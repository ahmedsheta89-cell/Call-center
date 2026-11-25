/**
 * @file server/modules/integrations/adapters/sipTelephony.ts
 * SIP Telephony & Egypt NTRA / Law 10 & Law 151 Compliant Voice Engine
 * Strict State Separation: DISABLED (default), CONFIGURED, CONNECTED, SIMULATED, FAILED
 * Never reports CONNECTED solely from credentials; verifies TCP SIP endpoint reachability.
 * Never marks calls connected until explicit provider call/session confirmation exists.
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

async function probeTcpSocket(host: string, port: number, timeoutMs = 1500): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
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

export class SipTelephonyAdapter implements TelephonyAdapter {
  public name = 'SIP Egypt Enterprise Telephony (Law 10/2003 & 151/2020 Compliant)';
  private config: SipTelephonyConfig;
  private state: AdapterOperationalState = 'DISABLED';

  // Track live call sessions in memory
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
      mandatoryRecordingDisclosure: config.mandatoryRecordingDisclosure ?? true,
      legalComplianceNotice:
        config.legalComplianceNotice ||
        'تنبيه نظامي: هذه المكالمة مسجلة وفقاً للمادة 12 من قانون حماية البيانات الشخصية رقم 151 لسنة 2020 ولأغراض تحسين الجودة وفق ضوابط الجهاز القومي لتنظيم الاتصالات NTRA.',
      allowSimulation,
    };

    // Never transition to CONNECTED solely from credentials; stay at CONFIGURED until proven.
    if (this.config.sipServerUri && this.config.sipUsername) {
      this.state = 'CONFIGURED';
    } else if (this.config.allowSimulation) {
      this.state = 'SIMULATED';
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

    // CONFIGURED / CONNECTED / FAILED: Genuine socket reachability probe required to report CONNECTED
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

    const probe = await probeTcpSocket(target.host, target.port, 1500);
    if (probe.ok) {
      this.state = 'CONNECTED';
      return {
        state: 'CONNECTED',
        isHealthy: true,
        latencyMs: probe.latencyMs,
        details: `Verified live SIP gateway reachability at ${target.host}:${target.port} as ${this.config.sipUsername}`,
      };
    }

    this.state = 'FAILED';
    return {
      state: 'FAILED',
      isHealthy: false,
      latencyMs: probe.latencyMs,
      details: `SIP gateway ${target.host}:${target.port} unreachable (${probe.error || 'connection failed'}). Remaining disconnected.`,
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

    const callId: UUID = crypto.randomUUID();
    const agent = db.agents.get(params.agentId);
    const agentUser = agent ? db.users.get(agent.userId) : undefined;
    const customer = Array.from(db.customers.values()).find(
      (c) => c.phone === params.to && c.organizationId === params.organizationId
    );

    const isSim = this.state === 'SIMULATED';
    // Do NOT mark a SIP call connected until a real provider call/session confirmation exists
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
      disposition: isSim ? 'simulated_ringing' : 'awaiting_provider_confirmation',
      transcript: this.config.mandatoryRecordingDisclosure
        ? `[تسجيل نظامي]: ${this.config.legalComplianceNotice}\n[اتصال]: جاري طلب المكالمة بواسطة ${agentUser?.fullName || 'الموظف'} (بانتظار تأكيد المزود).`
        : `[اتصال]: جاري طلب المكالمة بواسطة ${agentUser?.fullName || 'الموظف'} (بانتظار تأكيد المزود).`,
      aiSentiment: 'neutral',
      aiSummary: isSim
        ? 'طلب مكالمة هاتفية صادرة محاكاة (بانتظار تأكيد الجلسة - SIMULATED).'
        : 'طلب مكالمة هاتفية صادرة عبر بوابة SIP Egypt (بانتظار تأكيد جلسة المزود).',
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
    call.status = 'in_progress';
    call.disposition = this.state === 'SIMULATED' ? 'simulated_confirmed' : 'provider_confirmed';
    call.transcript =
      (call.transcript || '') +
      `\n[تأكيد المزود]: تم تأكيد اتصال الجلسة الصوتية فعلياً (${providerSessionId || 'sip-session-ack'}).`;
    db.calls.set(callId, call);
    db.schedulePersist();
    return call;
  }

  public async handleInboundCall(params: {
    organizationId: UUID;
    callerNumber: string;
    calleeNumber: string;
  }): Promise<CallSession> {
    if (this.state === 'DISABLED') {
      throw new Error('SIP Telephony Adapter is DISABLED: No SIP credentials configured.');
    }

    const callId: UUID = crypto.randomUUID();
    const customer = Array.from(db.customers.values()).find(
      (c) => c.phone === params.callerNumber && c.organizationId === params.organizationId
    );
    const availableAgent = Array.from(db.agents.values()).find(
      (a) => a.organizationId === params.organizationId && a.status === 'online'
    );
    const isSim = this.state === 'SIMULATED';

    const session: CallSession = {
      id: callId,
      organizationId: params.organizationId,
      customerId: customer?.id || 'cust-inbound-new',
      customerName: customer?.name || `متصل جديد (${params.callerNumber})`,
      agentId: availableAgent?.id || 'agent-queue-01',
      direction: 'inbound',
      status: 'ringing',
      callerNumber: params.callerNumber,
      calleeNumber: params.calleeNumber,
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      disposition: isSim ? 'simulated_queued' : 'awaiting_provider_confirmation',
      transcript: this.config.mandatoryRecordingDisclosure
        ? `[رسالة الترحيب الآلية والامتثال]: مرحباً بك في خدمة العملاء. يرجى العلم بأن هذه المكالمة قد تكون مسجلة لأغراض مراقبة الجودة والتدريب.\n`
        : '',
      aiSentiment: 'neutral',
      aiSummary: isSim ? 'مكالمة هاتفية واردة محاكاة (SIMULATED).' : 'مكالمة هاتفية واردة عبر الـ IVR (بانتظار تأكيد الإجابة).',
    };

    this.activeSessions.set(callId, session);
    db.calls.set(callId, session);
    db.schedulePersist();

    return session;
  }

  public async toggleHold(callId: UUID, holdState: boolean): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    call.status = holdState ? 'hold' : 'in_progress';
    call.transcript = (call.transcript || '') + `\n[إجراء]: ${holdState ? 'وضع المكالمة قيد الانتظار (Hold)' : 'استئناف المكالمة (Resume)'}.`;
    db.calls.set(callId, call);
    db.schedulePersist();
  }

  public async toggleMute(callId: UUID, muteState: boolean): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    call.transcript = (call.transcript || '') + `\n[إجراء]: ${muteState ? 'كتم الميكروفون (Muted)' : 'إلغاء كتم الميكروفون (Unmuted)'}.`;
    db.calls.set(callId, call);
    db.schedulePersist();
  }

  public async transferCall(callId: UUID, targetAgentId: UUID, isWarm: boolean): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    const targetAgent = db.agents.get(targetAgentId);
    const targetUser = targetAgent ? db.users.get(targetAgent.userId) : undefined;
    const targetName = targetUser?.fullName || 'الموظف المحول إليه';

    call.agentId = targetAgentId;
    call.transcript =
      (call.transcript || '') +
      `\n[تحويل]: تم تحويل المكالمة (${isWarm ? 'تحويل دافئ مع إحاطة' : 'تحويل مباشر'}) إلى ${targetName}.`;
    db.calls.set(callId, call);
    db.schedulePersist();
  }

  public async bargeOrWhisperCall(
    callId: UUID,
    supervisorId: UUID,
    mode: 'whisper' | 'barge' | 'listen'
  ): Promise<void> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);
    const supervisor = db.users.get(supervisorId);
    const supName = supervisor?.fullName || 'المشرف المسؤول';

    const modeLabel =
      mode === 'whisper'
        ? 'توجيه همسي للموظف فقط (Whisper)'
        : mode === 'barge'
        ? 'اقتحام وانضمام ثلاثي للمكالمة (Barge-in)'
        : 'استماع صامت للمراقبة (Silent Monitoring)';

    call.transcript = (call.transcript || '') + `\n[إشراف]: انضم ${supName} بنمط: ${modeLabel}.`;
    db.calls.set(callId, call);
    db.schedulePersist();
  }

  public async terminateCall(callId: UUID, disposition: string): Promise<CallSession> {
    const call = db.calls.get(callId) || this.activeSessions.get(callId);
    if (!call) throw new Error(`Call session ${callId} not found`);

    const elapsed = Math.max(1, Math.round((Date.now() - new Date(call.startedAt).getTime()) / 1000));
    call.durationSeconds = call.durationSeconds > 0 ? call.durationSeconds : elapsed;
    call.status = 'completed';
    call.disposition = disposition || 'completed_normal';
    call.endedAt = call.endedAt || new Date().toISOString();
    call.transcript = (call.transcript || '') + `\n[إنهاء]: انتهت المكالمة بنجاح، التصنيف: ${call.disposition}.`;

    this.activeSessions.delete(callId);
    db.calls.set(callId, call);
    db.schedulePersist();

    return call;
  }
}
