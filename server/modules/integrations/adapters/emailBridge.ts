/**
 * @file server/modules/integrations/adapters/emailBridge.ts
 * Email / SMTP / IMAP Bridge Adapter using Nodemailer
 *
 * Security & Truthfulness Guarantees:
 * - Strict State Separation: DISABLED (default), CONFIGURED, TCP_REACHABLE, CONNECTED, SIMULATED, FAILED
 * - Mandatory TLS (implicit TLS on port 465 or strict STARTTLS on all other ports).
 * - Never allows plaintext SMTP authentication unless explicit test-only `allowInsecureTestOnly` is set in NODE_ENV=test.
 * - Durable, tenant/account-namespaced idempotency (survives cold restarts, prevents duplicate sends on retry/ambiguous response).
 * - Never leaks SMTP passwords in error messages, logs, or diagnostics.
 * - Distinguishes SMTP relay acceptance (`250 OK`) from confirmed inbox delivery.
 * - Never labels a TCP probe alone as SMTP CONNECTED or SENT.
 */

import crypto from 'crypto';
import net from 'net';
import nodemailer from 'nodemailer';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import {
  ChannelAdapter,
  WebhookVerificationResult,
  EmailAdapterConfig,
  AdapterOperationalState,
  AdapterHealthStatus,
  MessageDeliveryStatus,
} from '../contracts.ts';
import {
  reserveDurableIdempotencyKeys,
  transitionDurableIdempotencyState,
  releaseDurableIdempotencyKeys,
  lookupDurableIdempotencyKey,
} from '../../../core/durableIdempotency.ts';

const EMAIL_ADDRESS_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CRLF_RE = /[\r\n]/g;

function sanitizeHeaderValue(val: string): string {
  return String(val || '').replace(CRLF_RE, ' ').trim();
}

function isValidEmailAddress(addr: string): boolean {
  return EMAIL_ADDRESS_RE.test(addr.trim());
}

function redactPasswordFromError(msg: string, secret?: string): string {
  if (!secret || secret.length < 2) return msg;
  return msg.split(secret).join('[REDACTED_SECRET]');
}

function classifySmtpError(
  err: any,
  smtpPass?: string
): { code: string; preDataTransient: boolean; ambiguousPostData: boolean; message: string } {
  const rawMsg = String(err?.message || err || 'Unknown SMTP error');
  const msg = redactPasswordFromError(rawMsg, smtpPass);
  const code = String(err?.code || '');
  const command = String(err?.command || '').toUpperCase();
  const responseCode = Number(err?.responseCode || 0);

  if (responseCode >= 500) {
    return { code: 'SMTP_REJECTED', preDataTransient: false, ambiguousPostData: false, message: msg };
  }
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 530 || /auth/i.test(msg)) {
    return { code: 'AUTH_FAILED', preDataTransient: false, ambiguousPostData: false, message: msg };
  }
  if (/TLS|STARTTLS|certificate|self[- ]signed|UNABLE_TO_VERIFY|CERT_|SSL/i.test(msg)) {
    return { code: 'TLS_VERIFICATION_FAILED', preDataTransient: false, ambiguousPostData: false, message: msg };
  }
  // If DATA was already sent and the connection dropped or timed out before receiving final 250 OK,
  // we MUST NOT blindly retry and duplicate the email!
  if (
    command === 'DATA' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ECONNECTION' ||
    /unexpected socket close|socket close|connection closed/i.test(msg) ||
    ((code === 'ETIMEDOUT' || code === 'ESOCKET') && command !== 'CONN')
  ) {
    return {
      code: 'SMTP_RESPONSE_AMBIGUOUS',
      preDataTransient: false,
      ambiguousPostData: true,
      message: msg,
    };
  }
  if (code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
    return { code: 'CONNECTION_REFUSED', preDataTransient: true, ambiguousPostData: false, message: msg };
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || /timeout/i.test(msg)) {
    return { code: 'TIMEOUT', preDataTransient: false, ambiguousPostData: false, message: msg };
  }
  return { code: 'SMTP_DELIVERY_ERROR', preDataTransient: false, ambiguousPostData: false, message: msg };
}

async function probeSmtpSocket(
  host: string,
  port: number,
  timeoutMs = 1500
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, latencyMs: Date.now() - start, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, `SMTP TCP timeout after ${timeoutMs}ms`));
    socket.once('error', (err) => done(false, err.message));
  });
}

export class EmailChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'email';
  public name = 'Enterprise Email Bridge (SMTP/IMAP & Inbound Webhooks)';
  private config: EmailAdapterConfig;
  private state: AdapterOperationalState = 'DISABLED';
  public lastError: string | null = null;
  public lastErrorCode: string | null = null;

  constructor(config: EmailAdapterConfig = {}) {
    const smtpHost = config.smtpHost || process.env.SMTP_HOST;
    const smtpUser = config.smtpUser || process.env.SMTP_USER;
    const smtpPass = config.smtpPass || process.env.SMTP_PASS;
    const allowSimulation = config.allowSimulation ?? (process.env.NODE_ENV === 'test');
    const allowInsecureTestOnly =
      process.env.NODE_ENV === 'test' && config.allowInsecureTestOnly === true;

    this.config = {
      smtpHost,
      smtpPort: config.smtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587),
      smtpUser,
      smtpPass,
      fromAddress: config.fromAddress || process.env.SMTP_FROM_ADDRESS || smtpUser,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized ?? true,
      allowInsecureTestOnly,
      webhookSecret: config.webhookSecret || process.env.EMAIL_WEBHOOK_SECRET,
      allowSimulation,
    };

    if (this.config.allowSimulation) {
      this.state = 'SIMULATED';
    } else if (this.config.smtpHost && this.config.smtpUser) {
      this.state = 'CONFIGURED';
    } else {
      this.state = 'DISABLED';
    }
  }

  public getState(): AdapterOperationalState {
    return this.state;
  }

  private createTransporter() {
    const port = this.config.smtpPort || 587;
    const secure = port === 465;
    const allowInsecure = process.env.NODE_ENV === 'test' && this.config.allowInsecureTestOnly === true;

    return nodemailer.createTransport({
      host: this.config.smtpHost,
      port,
      secure,
      // Mandatory STARTTLS on all non-465 ports unless explicit test-only override in NODE_ENV=test
      requireTLS: !secure && !allowInsecure,
      ignoreTLS: allowInsecure ? true : false,
      auth:
        this.config.smtpUser && this.config.smtpPass
          ? {
              user: this.config.smtpUser,
              pass: this.config.smtpPass,
            }
          : undefined,
      tls: {
        rejectUnauthorized: this.config.tlsRejectUnauthorized ?? true,
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000,
    });
  }

  public async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    if (this.state === 'DISABLED') {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Email adapter is DISABLED: SMTP or inbound webhook secret not configured',
      };
    }

    if (this.state === 'SIMULATED') {
      try {
        const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
        const sender = parsed?.from || parsed?.sender || 'sim_user@example.com';
        return {
          isValid: true,
          rawPayload: parsed,
          senderIdentifier: sender,
          isSimulated: true,
        };
      } catch (err: any) {
        return {
          isValid: false,
          rawPayload: null,
          senderIdentifier: '',
          error: `Malformed Email payload: ${err.message}`,
        };
      }
    }

    if (!this.config.webhookSecret) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Missing webhook secret for Email signature verification',
      };
    }

    const authHeader = headers['authorization'] || headers['x-email-webhook-secret'] || '';
    const expected = this.config.webhookSecret;
    const bufA = Buffer.from(authHeader, 'utf8');
    const bufB = Buffer.from(expected, 'utf8');
    const isValid = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    if (!isValid) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Invalid email webhook authorization secret',
      };
    }

    try {
      const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
      const sender = parsed?.from || parsed?.sender || 'user@example.com';
      return {
        isValid: true,
        rawPayload: parsed,
        senderIdentifier: sender,
      };
    } catch (err: any) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: `Malformed Email payload: ${err.message}`,
      };
    }
  }

  public async normalizeInboundMessage(payload: any, organizationId: UUID): Promise<UnifiedMessage> {
    const fromEmail = payload?.from || payload?.sender || 'support@client.com';
    const fromName = payload?.fromName || fromEmail.split('@')[0];
    const subject = payload?.subject || 'استفسار بريدي وارد';
    const text = payload?.text || payload?.body || payload?.html || '[محتوى البريد الإلكتروني]';
    const isSim = this.state === 'SIMULATED';

    return {
      id: crypto.randomUUID(),
      organizationId,
      customerId: `cust-email-${fromEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
      conversationId: `conv-email-${fromEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
      channel: 'email',
      direction: 'inbound',
      type: 'text',
      body: text,
      sender: {
        id: `cust-email-${fromEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
        name: fromName,
        type: 'customer',
      },
      status: isSim ? 'simulated' : 'delivered',
      createdAt: new Date().toISOString(),
      metadata: {
        subject,
        messageId: payload?.messageId || `<${Date.now()}@omniflow.local>`,
        fromEmail,
        isSimulated: isSim,
      },
    };
  }

  public async dispatchOutboundMessage(
    message: UnifiedMessage
  ): Promise<{ externalMessageId: string; status: MessageDeliveryStatus; relayAccepted?: boolean; inboxDeliveryConfirmed?: boolean }> {
    if (this.state === 'DISABLED') {
      return { externalMessageId: '', status: 'disabled' };
    }

    if (this.state === 'SIMULATED') {
      return {
        externalMessageId: `<sim-out-${Date.now()}@omniflow.local>`,
        status: 'simulated',
        relayAccepted: false,
        inboxDeliveryConfirmed: false,
      };
    }

    if (!this.config.smtpHost || !this.config.smtpUser || !this.config.smtpPass) {
      this.lastErrorCode = 'MISSING_SMTP_CREDENTIALS';
      this.lastError = 'SMTP authentication credentials (smtpHost, smtpUser, smtpPass) are required.';
      this.state = 'CONFIGURED';
      return { externalMessageId: '', status: 'failed' };
    }

    const fromAddr = sanitizeHeaderValue(this.config.fromAddress || this.config.smtpUser || '');
    const toAddr = sanitizeHeaderValue(
      String(message.metadata?.recipient || message.metadata?.to || message.metadata?.fromEmail || '')
    );

    if (!isValidEmailAddress(fromAddr) || !isValidEmailAddress(toAddr)) {
      this.lastErrorCode = 'INVALID_ENVELOPE';
      this.lastError = `Invalid SMTP envelope addresses (from='${fromAddr}', to='${toAddr}').`;
      return { externalMessageId: '', status: 'failed' };
    }

    // Durable tenant/account/message namespaced idempotency
    const orgId = message.organizationId || 'default-org';
    const rawKey = String(message.metadata?.idempotencyKey || message.id);
    const durableKey = `smtp:${orgId}:${this.config.smtpHost}:${this.config.smtpUser}:${rawKey}`;
    const txId = crypto.randomUUID();

    try {
      const existing = lookupDurableIdempotencyKey(durableKey);
      if (existing) {
        if (
          existing.state === 'AMBIGUOUS' ||
          existing.state === 'RECONCILIATION_REQUIRED' ||
          existing.state === 'SENDING' ||
          existing.state === 'RESERVED' ||
          existing.metadata?.ambiguous === true
        ) {
          this.lastErrorCode = 'SMTP_RECONCILIATION_REQUIRED';
          this.lastError =
            `Existing SMTP intent is in state '${existing.state}'; refusing automatic resend to prevent duplicate delivery.`;
          return { externalMessageId: '', status: 'failed', relayAccepted: false, inboxDeliveryConfirmed: false };
        }
        if (existing.state === 'RELAY_ACCEPTED' || existing.state === 'COMMITTED') {
          return {
            externalMessageId: String(existing.metadata?.externalMessageId || ''),
            status: 'sent',
            relayAccepted: true,
            inboxDeliveryConfirmed: false,
          };
        }
      }
    } catch (err: any) {
      this.lastErrorCode = 'IDEMPOTENCY_STORAGE_UNTRUSTED';
      this.lastError = redactPasswordFromError(err?.message || 'Idempotency storage unavailable', this.config.smtpPass);
      return { externalMessageId: '', status: 'failed' };
    }

    // Step 1: Persist durable RESERVED intent BEFORE any SMTP side effects
    const reserve = reserveDurableIdempotencyKeys([durableKey], {
      kind: 'smtp',
      txId,
      metadata: { recipient: toAddr },
    });
    if (!reserve.ok) {
      this.lastErrorCode = reserve.reason || 'RESERVE_FAILED';
      this.lastError = reserve.message || 'Failed to reserve durable SMTP sending intent.';
      return { externalMessageId: '', status: 'failed' };
    }

    const faultInject = process.env.NODE_ENV === 'test' ? process.env.OMNIFLOW_TEST_FAULT_INJECT : undefined;
    if (faultInject === 'SMTP_CRASH_AFTER_RESERVE') {
      throw new Error('FAULT_INJECT: SMTP_CRASH_AFTER_RESERVE');
    }

    // Step 2: Transition durable intent to SENDING BEFORE calling transporter.sendMail()
    try {
      transitionDurableIdempotencyState([durableKey], 'SENDING');
    } catch (err: any) {
      releaseDurableIdempotencyKeys([durableKey]);
      this.lastErrorCode = 'IDEMPOTENCY_STORAGE_UNTRUSTED';
      this.lastError = redactPasswordFromError(err?.message || 'Failed to persist SENDING intent', this.config.smtpPass);
      return { externalMessageId: '', status: 'failed' };
    }

    const subject = sanitizeHeaderValue(String(message.metadata?.subject || 'رسالة من مركز الاتصال OmniFlow OS'));
    const htmlBody = typeof message.metadata?.html === 'string' ? message.metadata.html : undefined;
    const maxAttempts = 2;
    let lastClassified = {
      code: 'SMTP_DELIVERY_ERROR',
      preDataTransient: false,
      ambiguousPostData: false,
      message: 'Unknown error',
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const transporter = this.createTransporter();
      try {
        if (faultInject === 'SMTP_CRASH_BEFORE_DATA') {
          throw Object.assign(new Error('FAULT_INJECT: SMTP_CRASH_BEFORE_DATA'), { code: 'ECONNRESET', command: 'DATA' });
        }

        const info = await transporter.sendMail({
          from: fromAddr,
          to: toAddr,
          subject,
          text: message.body,
          html: htmlBody,
          headers: {
            'X-OmniFlow-Message-Id': sanitizeHeaderValue(message.id),
            'X-OmniFlow-Idempotency-Key': sanitizeHeaderValue(rawKey),
          },
        });

        if (faultInject === 'SMTP_CRASH_AFTER_DATA') {
          throw Object.assign(new Error('FAULT_INJECT: SMTP_CRASH_AFTER_DATA'), { code: 'ECONNRESET', command: 'DATA' });
        }

        const capturedMessageId = String(info.messageId || '').trim();
        if (!capturedMessageId) {
          throw new Error('SMTP server accepted message without returning a provider messageId');
        }

        if (faultInject === 'SMTP_FAIL_COMMIT_AFTER_RELAY') {
          throw Object.assign(new Error('FAULT_INJECT: SMTP_FAIL_COMMIT_AFTER_RELAY'), { isCommitFailure: true });
        }

        transitionDurableIdempotencyState([durableKey], 'RELAY_ACCEPTED', {
          metadata: {
            externalMessageId: capturedMessageId,
            relayAccepted: true,
            ambiguous: false,
          },
        });

        this.lastError = null;
        this.lastErrorCode = null;
        this.state = 'CONNECTED';
        return {
          externalMessageId: capturedMessageId,
          status: 'sent',
          relayAccepted: true,
          inboxDeliveryConfirmed: false,
        };
      } catch (err: any) {
        if (err?.isCommitFailure) {
          // Relay accepted, but commit write failed: transition to RECONCILIATION_REQUIRED / retain SENDING
          try {
            transitionDurableIdempotencyState([durableKey], 'RECONCILIATION_REQUIRED', {
              metadata: { relayAcceptedCommitFailed: true },
            });
          } catch {
            // Leave SENDING on disk; startup reconciler will block automatic resend
          }
          this.lastErrorCode = 'SMTP_COMMIT_FAILED_AFTER_RELAY';
          this.lastError = 'SMTP relay accepted message, but durable commit failed; automatic resend blocked.';
          this.state = 'FAILED';
          return { externalMessageId: '', status: 'failed', relayAccepted: true, inboxDeliveryConfirmed: false };
        }

        lastClassified = classifySmtpError(err, this.config.smtpPass);
        if (lastClassified.ambiguousPostData) {
          try {
            transitionDurableIdempotencyState([durableKey], 'AMBIGUOUS', {
              metadata: { ambiguous: true, errorCode: lastClassified.code },
            });
          } catch {
            // Leave SENDING on disk
          }
          break;
        }
        if (!lastClassified.preDataTransient || attempt === maxAttempts) {
          releaseDurableIdempotencyKeys([durableKey]);
          break;
        }
      } finally {
        transporter.close();
      }
    }

    this.lastErrorCode = lastClassified.code;
    this.lastError = lastClassified.message;
    this.state = 'FAILED';
    return {
      externalMessageId: '',
      status: 'failed',
      relayAccepted: false,
      inboxDeliveryConfirmed: false,
    };
  }

  public async fetchHealthStatus(): Promise<AdapterHealthStatus> {
    if (this.state === 'DISABLED') {
      return {
        state: 'DISABLED',
        isHealthy: false,
        latencyMs: 0,
        details: 'Email bridge adapter disabled (SMTP credentials not configured).',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        state: 'SIMULATED',
        isHealthy: true,
        latencyMs: 1,
        details: 'Email bridge adapter active in SIMULATED mode ($0.00, local test).',
        isSimulated: true,
      };
    }

    const host = this.config.smtpHost || '';
    const port = this.config.smtpPort || 587;
    const probe = await probeSmtpSocket(host, port, 1500);
    if (!probe.ok) {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: probe.latencyMs,
        details: `SMTP host ${host}:${port} unreachable (${probe.error || 'connection failed'}).`,
      };
    }

    // TCP probe succeeded, but TCP alone NEVER means CONNECTED or SENT
    if (!this.config.smtpPass) {
      this.state = 'TCP_REACHABLE';
      return {
        state: 'TCP_REACHABLE',
        isHealthy: false,
        latencyMs: probe.latencyMs,
        details: `SMTP TCP socket reachable at ${host}:${port}, but SMTP password is missing (not authenticated or TLS verified).`,
      };
    }

    const startVerify = Date.now();
    const transporter = this.createTransporter();
    try {
      await transporter.verify();
      this.state = 'CONNECTED';
      this.lastError = null;
      this.lastErrorCode = null;
      return {
        state: 'CONNECTED',
        isHealthy: true,
        latencyMs: Date.now() - startVerify,
        details: `Verified SMTP TLS & authentication for ${this.config.smtpUser}@${host}:${port}`,
      };
    } catch (err: any) {
      const classified = classifySmtpError(err, this.config.smtpPass);
      this.lastError = classified.message;
      this.lastErrorCode = classified.code;
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: Date.now() - startVerify,
        details: `SMTP TCP reachable at ${host}:${port}, but TLS/auth verification failed (${classified.code}: ${classified.message}).`,
      };
    } finally {
      transporter.close();
    }
  }
}
