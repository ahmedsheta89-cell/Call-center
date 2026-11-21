/**
 * @file server/modules/integrations/adapters/sipTelephony.ts
 * SIP Telephony & Egypt NTRA / Law 10 & Law 151 Compliant Voice Engine
 */

import crypto from 'crypto';
import { CallSession, UUID } from '../../../core/types.ts';
import { TelephonyAdapter } from '../contracts.ts';
import { db } from '../../../db/store.ts';

export interface SipTelephonyConfig {
  sipServerUri?: string;
  defaultCallerId?: string;
  mandatoryRecordingDisclosure?: boolean;
  legalComplianceNotice?: string;
  sandboxMode?: boolean;
}

export class SipTelephonyAdapter implements TelephonyAdapter {
  public name = 'SIP Egypt Enterprise Telephony (Law 10/2003 & 151/2020 Compliant)';
  private config: SipTelephonyConfig;

  // Track live call sessions in memory
  private activeSessions: Map<UUID, CallSession> = new Map();

  constructor(config: SipTelephonyConfig = {}) {
    this.config = {
      sandboxMode: config.sandboxMode ?? true,
      defaultCallerId: config.defaultCallerId || '+20220000000',
      mandatoryRecordingDisclosure: config.mandatoryRecordingDisclosure ?? true,
      legalComplianceNotice:
        config.legalComplianceNotice ||
        'تنبيه نظامي: هذه المكالمة مسجلة وفقاً للمادة 12 من قانون حماية البيانات الشخصية رقم 151 لسنة 2020 ولأغراض تحسين الجودة وفق ضوابط الجهاز القومي لتنظيم الاتصالات NTRA.',
      ...config,
    };
  }

  public async initiateOutboundCall(params: {
    organizationId: UUID;
    from: string;
    to: string;
    agentId: UUID;
  }): Promise<CallSession> {
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
      status: 'in_progress',
      callerNumber: params.from || this.config.defaultCallerId || '+20220000000',
      calleeNumber: params.to,
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      disposition: 'connected',
      transcript: this.config.mandatoryRecordingDisclosure
        ? `[تسجيل نظامي]: ${this.config.legalComplianceNotice}\n[اتصال]: تم بدء الاتصال بالعميل بواسطة ${agentUser?.fullName || 'الموظف'}.`
        : `[اتصال]: تم بدء الاتصال بالعميل بواسطة ${agentUser?.fullName || 'الموظف'}.`,
      aiSentiment: 'neutral',
      aiSummary: 'مكالمة هاتفية صادرة عبر بوابة SIP Egypt المعتمدة.',
    };

    this.activeSessions.set(callId, session);
    db.calls.set(callId, session);
    db.schedulePersist();

    return session;
  }

  public async handleInboundCall(params: {
    organizationId: UUID;
    callerNumber: string;
    calleeNumber: string;
  }): Promise<CallSession> {
    const callId: UUID = crypto.randomUUID();
    const customer = Array.from(db.customers.values()).find(
      (c) => c.phone === params.callerNumber && c.organizationId === params.organizationId
    );
    const availableAgent = Array.from(db.agents.values()).find(
      (a) => a.organizationId === params.organizationId && a.status === 'online'
    );
    const agentUser = availableAgent ? db.users.get(availableAgent.userId) : undefined;

    const session: CallSession = {
      id: callId,
      organizationId: params.organizationId,
      customerId: customer?.id || 'cust-inbound-new',
      customerName: customer?.name || `متصل جديد (${params.callerNumber})`,
      agentId: availableAgent?.id || 'agent-queue-01',
      direction: 'inbound',
      status: 'in_progress',
      callerNumber: params.callerNumber,
      calleeNumber: params.calleeNumber,
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      disposition: 'queued',
      transcript: this.config.mandatoryRecordingDisclosure
        ? `[رسالة الترحيب الآلية والامتثال]: مرحباً بك في خدمة العملاء. يرجى العلم بأن هذه المكالمة قد تكون مسجلة لأغراض مراقبة الجودة والتدريب.\n`
        : '',
      aiSentiment: 'neutral',
      aiSummary: 'مكالمة هاتفية واردة عبر الـ IVR.',
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
    call.transcript = (call.transcript || '') + `\n[إنهاء]: انتهت المكالمة بنجاح، التصنيف: ${call.disposition}.`;

    this.activeSessions.delete(callId);
    db.calls.set(callId, call);
    db.schedulePersist();

    return call;
  }
}
