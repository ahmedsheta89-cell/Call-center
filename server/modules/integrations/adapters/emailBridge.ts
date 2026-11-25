/**
 * @file server/modules/integrations/adapters/emailBridge.ts
 * Email / SMTP / IMAP Bridge Adapter using Nodemailer
 * Strict State Separation: DISABLED (default), CONFIGURED, TCP_REACHABLE, CONNECTED, SIMULATED, FAILED
 * Never claims a message is 'sent' from a TCP probe alone; requires actual SMTP transaction & messageId capture.
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

const EMAIL_ADDRESS_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CRLF_RE = /[\r\n]/g;

// Bounded idempotency cache to prevent duplicate SMTP sends on retries (max 5000 entries)
const sentMessageIdempotencyCache = new Map<string, { externalMessageId: string; timestamp: number }>();

function sanitizeHeaderValue(val: string): string {
  return String(val || '').replace(CRLF_RE, ' ').trim();
}

function isValidEmailAddress(addr: string): boolean {
  return EMAIL_ADDRESS_RE.test(addr.trim());
}

function classifySmtpError(err: any): { code: string; transient: boolean; message: string } {
  const msg = String(err?.message || err || 'Unknown SMTP error');
  const code = String(err?.code || '');
  const responseCode = Number(err?.responseCode || 0);

  if (code === 'EAUTH' || responseCode === 535 || responseCode === 530 || /auth/i.test(msg)) {
    return { code: 'AUTH_FAILED', transient: false, message: msg };
  }
  if (code === 'ECONNREFUSED') {
    return { code: 'CONNECTION_REFUSED', transient: true, message: msg };
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || /timeout/i.test(msg)) {
    return { code: 'TIMEOUT', transient: true, message: msg };
  }
  if (code === 'ECONNRESET' || code === 'EAI_AGAIN' || (responseCode >= 400 && responseCode < 500)) {
    return { code: 'TRANSIENT_SMTP_ERROR', transient: true, message: msg };
  }
  if (responseCode >= 500) {
    return { code: 'SMTP_REJECTED', transient: false, message: msg };
  }
  return { code: 'SMTP_DELIVERY_ERROR', transient: false, message: msg };
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

    this.config = {
      smtpHost,
      smtpPort: config.smtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587),
      smtpUser,
      smtpPass,
      fromAddress: config.fromAddress || process.env.SMTP_FROM_ADDRESS || smtpUser,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized ?? true,
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
    return nodemailer.createTransport({
      host: this.config.smtpHost,
      port,
      secure,
      requireTLS: !secure && port === 587,
      auth:
        this.config.smtpUser && this.config.smtpPass
          ? {
              user: this.config.smtpUser,
              pass: this.config.smtpPass,
            }
          : undefined,
      tls: {
        rejectUnauthorized: this.config.tlsRejectUnauthorized ?? true,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
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
    const isValid =
      authHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
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
  ): Promise<{ externalMessageId: string; status: MessageDeliveryStatus }> {
    if (this.state === 'DISABLED') {
      return {
        externalMessageId: '',
        status: 'disabled',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        externalMessageId: `<sim-out-${Date.now()}@omniflow.local>`,
        status: 'simulated',
      };
    }

    // Require explicit SMTP credentials before attempting live delivery
    if (!this.config.smtpHost || !this.config.smtpUser || !this.config.smtpPass) {
      this.lastErrorCode = 'MISSING_SMTP_CREDENTIALS';
      this.lastError = 'SMTP authentication credentials (smtpHost, smtpUser, smtpPass) are required.';
      this.state = 'CONFIGURED';
      return {
        externalMessageId: '',
        status: 'failed',
      };
    }

    const fromAddr = sanitizeHeaderValue(this.config.fromAddress || this.config.smtpUser || '');
    const toAddr = sanitizeHeaderValue(
      String(message.metadata?.recipient || message.metadata?.to || message.metadata?.fromEmail || '')
    );

    if (!isValidEmailAddress(fromAddr) || !isValidEmailAddress(toAddr)) {
      this.lastErrorCode = 'INVALID_ENVELOPE';
      this.lastError = `Invalid SMTP envelope addresses (from='${fromAddr}', to='${toAddr}').`;
      return {
        externalMessageId: '',
        status: 'failed',
      };
    }

    // Idempotency guard against duplicate sends on retry
    const idempotencyKey = String(message.metadata?.idempotencyKey || message.id);
    const cached = sentMessageIdempotencyCache.get(idempotencyKey);
    if (cached) {
      return {
        externalMessageId: cached.externalMessageId,
        status: 'sent',
      };
    }

    const subject = sanitizeHeaderValue(String(message.metadata?.subject || 'رسالة من مركز الاتصال OmniFlow OS'));
    const htmlBody = typeof message.metadata?.html === 'string' ? message.metadata.html : undefined;
    const transporter = this.createTransporter();

    const maxAttempts = 2;
    let lastClassified = { code: 'SMTP_DELIVERY_ERROR', transient: false, message: 'Unknown error' };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const info = await transporter.sendMail({
          from: fromAddr,
          to: toAddr,
          subject,
          text: message.body,
          html: htmlBody,
          headers: {
            'X-OmniFlow-Message-Id': sanitizeHeaderValue(message.id),
            'X-OmniFlow-Idempotency-Key': sanitizeHeaderValue(idempotencyKey),
          },
        });

        const capturedMessageId = String(info.messageId || '').trim();
        if (!capturedMessageId) {
          throw new Error('SMTP server accepted message without returning a provider messageId');
        }

        if (sentMessageIdempotencyCache.size >= 5000) {
          const oldest = sentMessageIdempotencyCache.keys().next().value;
          if (oldest) sentMessageIdempotencyCache.delete(oldest);
        }
        sentMessageIdempotencyCache.set(idempotencyKey, {
          externalMessageId: capturedMessageId,
          timestamp: Date.now(),
        });

        this.lastError = null;
        this.lastErrorCode = null;
        this.state = 'CONNECTED';
        return {
          externalMessageId: capturedMessageId,
          status: 'sent',
        };
      } catch (err: any) {
        lastClassified = classifySmtpError(err);
        if (!lastClassified.transient || attempt === maxAttempts) {
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

    // TCP socket reachable — now verify explicit SMTP authentication if password is configured
    if (!this.config.smtpPass) {
      this.state = 'TCP_REACHABLE';
      return {
        state: 'TCP_REACHABLE',
        isHealthy: false,
        latencyMs: probe.latencyMs,
        details: `SMTP TCP socket reachable at ${host}:${port}, but SMTP password is missing (not authenticated).`,
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
      const classified = classifySmtpError(err);
      this.lastError = classified.message;
      this.lastErrorCode = classified.code;
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: Date.now() - startVerify,
        details: `SMTP TCP reachable at ${host}:${port}, but SMTP verification/auth failed (${classified.code}: ${classified.message}).`,
      };
    } finally {
      transporter.close();
    }
  }
}
