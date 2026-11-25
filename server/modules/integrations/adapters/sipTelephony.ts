/**
 * @file server/modules/integrations/adapters/sipTelephony.ts
 * SIP Telephony & Egypt NTRA / Law 10 & Law 151 Compliant Voice Engine
 * Strict Lifecycle Separation: DISABLED -> CONFIGURED -> TCP_REACHABLE -> REGISTERED -> CONNECTED | FAILED | SIMULATED
 * Never labels TCP reachability as SIP registration or CONNECTED.
 * Never marks calls connected until explicit provider session confirmation exists.
 */

import crypto from 'crypto';
import net from 'net';
import { CallSession, UUID } from '../../../core/types.ts';
import {
  TelephonyAdapter,
  SipTelephonyConfig,
  AdapterOperationalState,
  AdapterHealthStatus,
} from '../contracts.ts';
import { db } from '../../../db/store.ts';

function parseSipTarget(uri: string): { host: string; port: number } | null {
  try {
    const cleaned = uri.trim().replace(/^sips?:/i, '');
    const hostPortPart = cleaned.split('@').pop()?.split(';')[0] || '';
    const [host, portStr] = hostPortPart.split(':');
    if (!host) return null;
    const defaultPort = /^sips:/i.test(uri.trim()) ? 5061 : 5060;
    const port = portStr ? parseInt(portStr, 10) : defaultPort;
    if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
    return { host, port };
  } catch {
    return null;
  }
}

async function probeTcpSocket(
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
    socket.once('timeout', () => done(false, `TCP connection timeout after ${timeoutMs}ms`));
    socket.once('error', (err) => done(false, err.message));
  });
}

function md5Hex(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

function parseDigestChallenge(headerValue: string): { realm: string; nonce: string; qop?: string; opaque?: string } | null {
  const sanitize = (v?: string) => (v ? v.replace(/[\r\n"]/g, '').trim() : '');
  const realmMatch = /realm="([^"\r\n]+)"/i.exec(headerValue);
  const nonceMatch = /nonce="([^"\r\n]+)"/i.exec(headerValue);
  const qopMatch = /qop="([^"\r\n]+)"/i.exec(headerValue);
  const opaqueMatch = /opaque="([^"\r\n]+)"/i.exec(headerValue);
  if (!realmMatch || !nonceMatch) return null;
  return {
    realm: sanitize(realmMatch[1]),
    nonce: sanitize(nonceMatch[1]),
    qop: qopMatch ? sanitize(qopMatch[1]) : undefined,
    opaque: opaqueMatch ? sanitize(opaqueMatch[1]) : undefined,
  };
}

/**
 * Performs an RFC 3261 SIP REGISTER transaction over TCP (with Digest auth challenge-response).
 * Distinguishes TCP_REACHABLE (non-SIP or unacknowledged) from REGISTERED (200 OK) and FAILED (401/403 rejected).
 */
async function performSipRegister(params: {
  host: string;
  port: number;
  username: string;
  password?: string;
  timeoutMs?: number;
}): Promise<{ outcome: 'REGISTERED' | 'AUTH_REJECTED' | 'TCP_ONLY'; statusCode?: number; details: string; latencyMs: number }> {
  const { host, port, username, password, timeoutMs = 2000 } = params;
  const start = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let buffer = '';
    let sentAuth = false;
    const callId = crypto.randomUUID();
    const branchBase = `z9hG4bK-${crypto.randomBytes(6).toString('hex')}`;
    const tag = crypto.randomBytes(4).toString('hex');

    const finish = (
      outcome: 'REGISTERED' | 'AUTH_REJECTED' | 'TCP_ONLY',
      details: string,
      statusCode?: number
    ) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ outcome, statusCode, details, latencyMs: Date.now() - start });
    };

    const buildRegister = (cseq: number, authHeader?: string) => {
      const uri = `sip:${host}:${port}`;
      const lines = [
        `REGISTER ${uri} SIP/2.0`,
        `Via: SIP/2.0/TCP 127.0.0.1:5060;branch=${branchBase}-${cseq};rport`,
        `Max-Forwards: 70`,
        `From: <sip:${username}@${host}>;tag=${tag}`,
        `To: <sip:${username}@${host}>`,
        `Call-ID: ${callId}@omniflow.local`,
        `CSeq: ${cseq} REGISTER`,
        `Contact: <sip:${username}@127.0.0.1:5060;transport=tcp>`,
        `Expires: 60`,
      ];
      if (authHeader) lines.push(authHeader);
      lines.push(`Content-Length: 0`, ``, ``);
      return lines.join('\r\n');
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(buildRegister(1));
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.includes('\r\n\r\n') && !buffer.includes('\n\n')) return;

      const statusMatch = /^SIP\/2\.0\s+(\d{3})\s+([^\r\n]*)/i.exec(buffer);
      if (!statusMatch) {
        finish('TCP_ONLY', `TCP socket at ${host}:${port} responded with non-SIP data; not registered.`);
        return;
      }

      const code = parseInt(statusMatch[1], 10);
      const reason = statusMatch[2] || '';

      // Ignore provisional 1xx responses (e.g., 100 Trying) and keep reading
      if (code >= 100 && code < 200) {
        const hdrEnd = buffer.indexOf('\r\n\r\n');
        buffer = hdrEnd >= 0 ? buffer.slice(hdrEnd + 4) : '';
        return;
      }

      if (code === 200) {
        finish('REGISTERED', `SIP REGISTER 200 OK verified for ${username}@${host}:${port}`, 200);
        return;
      }

      if ((code === 401 || code === 407) && !sentAuth) {
        const authChallengeLine = buffer
          .split(/\r?\n/)
          .find((l) => /^(?:WWW-Authenticate|Proxy-Authenticate):/i.test(l));
        const challenge = authChallengeLine ? parseDigestChallenge(authChallengeLine) : null;

        if (!password) {
          finish('AUTH_REJECTED', `SIP REGISTER rejected (${code} ${reason}): missing SIP password.`, code);
          return;
        }
        if (!challenge) {
          finish('AUTH_REJECTED', `SIP REGISTER rejected (${code} ${reason}): unsupported auth challenge.`, code);
          return;
        }

        sentAuth = true;
        buffer = '';
        const safeUser = username.replace(/[\r\n"]/g, '');
        const uri = `sip:${host}:${port}`;
        const ha1 = md5Hex(`${safeUser}:${challenge.realm}:${password}`);
        const ha2 = md5Hex(`REGISTER:${uri}`);
        const supportsQopAuth = challenge.qop && challenge.qop.split(',').map((s) => s.trim()).includes('auth');
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        const digestResp = supportsQopAuth
          ? md5Hex(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`)
          : md5Hex(`${ha1}:${challenge.nonce}:${ha2}`);
        const headerName = code === 407 ? 'Proxy-Authorization' : 'Authorization';
        let authHeader = `${headerName}: Digest username="${safeUser}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${digestResp}", algorithm=MD5`;
        if (supportsQopAuth) {
          authHeader += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
        }
        if (challenge.opaque) {
          authHeader += `, opaque="${challenge.opaque}"`;
        }
        socket.write(buildRegister(2, authHeader));
        return;
      }

      finish('AUTH_REJECTED', `SIP REGISTER rejected by PBX (${code} ${reason}).`, code);
    });

    socket.once('timeout', () => {
      finish('TCP_ONLY', `TCP socket at ${host}:${port} reachable, but SIP REGISTER timed out after ${timeoutMs}ms.`);
    });
    socket.once('error', (err) => {
      finish('TCP_ONLY', `TCP socket connected then closed (${err.message}); SIP REGISTER unconfirmed.`);
    });
  });
}

export class SipTelephonyAdapter implements TelephonyAdapter {
  public name = 'SIP Egypt Enterprise Telephony (Law 10/2003 & 151/2020 Compliant)';
  private config: SipTelephonyConfig;
  private state: AdapterOperationalState = 'DISABLED';

  private activeSessions: Map<UUID, CallSession> = new Map();

  constructor(config: SipTelephonyConfig = {}) {
    const sipServerUri = config.sipServerUri || process.env.SIP_SERVER_URI;
    const sipUsername = config.sipUsername || process.env.SIP_USERNAME;
    const sipPassword = config.sipPassword || process.env.SIP_PASSWORD;
    const allowSimulation = config.allowSimulation ?? (process.env.NODE_ENV === 'test');

    this.config = {
      sipServerUri,
      sipUsername,
      sipPassword,
      defaultCallerId: config.defaultCallerId || process.env.SIP_DEFAULT_CALLER_ID || '+20220000000',
      webhookSecret: config.webhookSecret || process.env.SIP_WEBHOOK_SECRET,
      mandatoryRecordingDisclosure: config.mandatoryRecordingDisclosure ?? true,
      legalComplianceNotice:
        config.legalComplianceNotice ||
        'تنبيه نظامي: هذه المكالمة مسجلة وفقاً للمادة 12 من قانون حماية البيانات الشخصية رقم 151 لسنة 2020 ولأغراض تحسين الجودة وفق ضوابط الجهاز القومي لتنظيم الاتصالات NTRA.',
      allowSimulation,
    };

    if (this.config.allowSimulation) {
      this.state = 'SIMULATED';
    } else if (this.config.sipServerUri && this.config.sipUsername) {
      this.state = 'CONFIGURED';
    } else {
      this.state = 'DISABLED';
    }
  }

  public getState(): AdapterOperationalState {
    return this.state;
  }

  public async fetchHealthStatus(): Promise<AdapterHealthStatus> {
    if (this.state === 'DISABLED') {
      return {
        state: 'DISABLED',
        isHealthy: false,
        latencyMs: 0,
        details: 'SIP Egypt Telephony adapter disabled (SIP PBX gateway credentials not configured).',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        state: 'SIMULATED',
        isHealthy: true,
        latencyMs: 1,
        details: 'SIP Egypt Telephony active in SIMULATED mode ($0.00, local testing, Law 10/151 notice enforced).',
        isSimulated: true,
      };
    }

    const target = parseSipTarget(this.config.sipServerUri || '');
    if (!target) {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: 0,
        details: `Invalid SIP Server URI '${this.config.sipServerUri}'; cannot establish live SIP connection.`,
      };
    }

    // Step 1: Verify TCP socket reachability
    const tcpProbe = await probeTcpSocket(target.host, target.port, 1500);
    if (!tcpProbe.ok) {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: tcpProbe.latencyMs,
        details: `SIP gateway ${target.host}:${target.port} unreachable (${tcpProbe.error || 'connection failed'}).`,
      };
    }

    // Socket is reachable — never label TCP_REACHABLE as REGISTERED or CONNECTED
    this.state = 'TCP_REACHABLE';

    // Step 2: Attempt real RFC 3261 SIP REGISTER
    const regResult = await performSipRegister({
      host: target.host,
      port: target.port,
      username: this.config.sipUsername || '',
      password: this.config.sipPassword,
      timeoutMs: 2000,
    });

    if (regResult.outcome === 'REGISTERED') {
      this.state = 'REGISTERED';
      return {
        state: 'REGISTERED',
        isHealthy: true,
        latencyMs: regResult.latencyMs,
        details: regResult.details,
      };
    }

    if (regResult.outcome === 'AUTH_REJECTED') {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: regResult.latencyMs,
        details: regResult.details,
      };
    }

    // TCP reachable, but SIP REGISTER was not acknowledged -> remain strictly TCP_REACHABLE
    this.state = 'TCP_REACHABLE';
    return {
      state: 'TCP_REACHABLE',
      isHealthy: false,
      latencyMs: tcpProbe.latencyMs,
      details: regResult.details,
    };
  }

  public async initiateOutboundCall(params: {
    organizationId: UUID;
    from: string;
    to: string;
    agentId: UUID;
  }): Promise<CallSession> {
    if (this.state === 'DISABLED') {
      throw new Error('SIP Telephony Adapter is DISABLED: No SIP credentials configured.');
    }
    if (this.state !== 'SIMULATED') {
      throw new Error(
        'LIVE_SIP_INVITE_NOT_IMPLEMENTED: Live SIP INVITE/SDP/RTP media calling is not implemented without a live PBX/WebRTC media gateway. Use simulate=true for local pilot testing.'
      );
    }

    const callId: UUID = crypto.randomUUID();
    const agent = db.agents.get(params.agentId);
    const agentUser = agent ? db.users.get(agent.userId) : undefined;
    const customer = Array.from(db.customers.values()).find(
      (c) => c.phone === params.to && c.organizationId === params.organizationId
    );

    const session: CallSession = {
      id: callId,
      organizationId: params.organizationId,
      customerId: customer?.id || 'cust-auto-unknown',
      customerName: customer?.name || `عميل هاتف (${params.to})`,
      agentId: params.agentId,
      direction: 'outbound',
      status: 'ringing',
      callerNumber: params.from || this.config.defaultCallerId || '+20220000000',
      calleeNumber: params.to,
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      disposition: 'simulated_ringing',
      transcript: this.config.mandatoryRecordingDisclosure
        ? `[تسجيل نظامي]: ${this.config.legalComplianceNotice}\n[اتصال]: جاري طلب المكالمة المحاكاة بواسطة ${agentUser?.fullName || 'الموظف'} (SIMULATED).`
        : `[اتصال]: جاري طلب المكالمة المحاكاة بواسطة ${agentUser?.fullName || 'الموظف'} (SIMULATED).`,
      aiSentiment: 'neutral',
      aiSummary: 'طلب مكالمة هاتفية صادرة محاكاة (بانتظار تأكيد الجلسة - SIMULATED).',
    };

    this.activeSessions.set(callId, session);
    db.calls.set(callId, session);
    db.schedulePersist();

    return session;
  }

  public async confirmCallConnected(callId: UUID, providerSessionId?: string): Promise<CallSession> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    if (this.state === 'DISABLED') {
      throw new Error('SIP Telephony Adapter is DISABLED: Cannot confirm session.');
    }
    if (call.status !== 'ringing') {
      throw new Error(`Invalid call state transition: cannot confirm call from status '${call.status}'`);
    }
    if (this.state !== 'SIMULATED') {
      if (!call.providerTransactionId || call.disposition !== 'awaiting_provider_confirmation') {
        throw new Error('NO_PENDING_PROVIDER_TRANSACTION: Call has no pending live SIP provider transaction.');
      }
      if (!providerSessionId) {
        throw new Error('INVALID_PROVIDER_SESSION_ID: providerSessionId is required.');
      }
      call.providerSessionId = providerSessionId;
    }
    call.status = 'in_progress';
    call.disposition = this.state === 'SIMULATED' ? 'simulated_confirmed' : 'provider_confirmed';
    call.transcript = `${call.transcript || ''}\n[تأكيد الجلسة]: ${
      this.state === 'SIMULATED' ? 'تم تأكيد جلسة المحاكاة محلياً' : `تم تأكيد الجلسة من مزود SIP (${providerSessionId || 'ack'})`
    }.`;
    db.calls.set(call.id, call);
    db.schedulePersist();
    return call;
  }

  public async handleInboundCall(params: {
    organizationId: UUID;
    callerNumber: string;
    calleeNumber: string;
  }): Promise<CallSession> {
    if (this.state === 'DISABLED') {
      throw new Error('SIP Telephony Adapter is DISABLED: Cannot accept inbound call.');
    }
    const callId: UUID = crypto.randomUUID();
    const customer = Array.from(db.customers.values()).find(
      (c) => c.phone === params.callerNumber && c.organizationId === params.organizationId
    );
    const isSim = this.state === 'SIMULATED';

    const session: CallSession = {
      id: callId,
      organizationId: params.organizationId,
      customerId: customer?.id || 'cust-auto-unknown',
      customerName: customer?.name || `متصل وارد (${params.callerNumber})`,
      direction: 'inbound',
      status: 'ringing',
      callerNumber: params.callerNumber,
      calleeNumber: params.calleeNumber || this.config.defaultCallerId || '+20220000000',
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      disposition: isSim ? 'simulated_ringing' : 'awaiting_provider_confirmation',
      transcript: this.config.mandatoryRecordingDisclosure
        ? `[تسجيل نظامي]: ${this.config.legalComplianceNotice}`
        : undefined,
      aiSentiment: 'neutral',
      aiSummary: isSim ? 'مكالمة واردة محاكاة' : 'مكالمة واردة عبر SIP (بانتظار رد الوكيل)',
    };

    this.activeSessions.set(callId, session);
    db.calls.set(callId, session);
    db.schedulePersist();
    return session;
  }

  public async toggleHold(callId: UUID, holdState: boolean): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    if (holdState && call.status !== 'in_progress') {
      throw new Error(`INVALID_CALL_STATE_TRANSITION: Cannot place call on hold from status '${call.status}'.`);
    }
    if (!holdState && call.status !== 'hold') {
      throw new Error(`INVALID_CALL_STATE_TRANSITION: Cannot unhold call from status '${call.status}'.`);
    }
    call.status = holdState ? 'hold' : 'in_progress';
    db.calls.set(call.id, call);
    db.schedulePersist();
  }

  public async toggleMute(callId: UUID, muteState: boolean): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    call.transcript = `${call.transcript || ''}\n[تحكم]: ${muteState ? 'تم كتم الميكروفون' : 'تم إلغاء كتم الميكروفون'}`;
    db.calls.set(call.id, call);
    db.schedulePersist();
  }

  public async transferCall(callId: UUID, targetAgentId: UUID, isWarm: boolean): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    call.agentId = targetAgentId;
    call.transcript = `${call.transcript || ''}\n[تحويل ${isWarm ? 'دافئ' : 'مباشر'}]: تم تحويل المكالمة للوكيل ${targetAgentId}`;
    db.calls.set(call.id, call);
    db.schedulePersist();
  }

  public async bargeOrWhisperCall(
    callId: UUID,
    supervisorId: UUID,
    mode: 'whisper' | 'barge' | 'listen'
  ): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    call.transcript = `${call.transcript || ''}\n[إشراف ${mode.toUpperCase()}]: تدخل المشرف ${supervisorId}`;
    db.calls.set(call.id, call);
    db.schedulePersist();
  }

  public async terminateCall(callId: UUID, disposition: string): Promise<CallSession> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    call.status = 'completed';
    call.disposition = disposition || 'completed_normal';
    call.endedAt = new Date().toISOString();
    call.durationSeconds = Math.max(
      1,
      Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
    );
    db.calls.set(call.id, call);
    this.activeSessions.delete(call.id);
    db.schedulePersist();
    return call;
  }
}
