/**
 * @file server/modules/integrations/contracts.ts
 * Omnichannel Integration & Channel Provider Abstractions
 * Supports Strict State Separation: DISABLED, CONFIGURED, CONNECTED, SIMULATED, FAILED
 */

import { ChannelType, UnifiedMessage, UUID, CallSession } from '../../core/types.ts';

export type AdapterOperationalState = 'DISABLED' | 'CONFIGURED' | 'CONNECTED' | 'SIMULATED' | 'FAILED';
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'failed' | 'simulated' | 'disabled';

export interface WebhookVerificationResult {
  isValid: boolean;
  rawPayload: unknown;
  senderIdentifier: string;
  signatureHeader?: string;
  error?: string;
  isSimulated?: boolean;
}

export interface AdapterHealthStatus {
  state: AdapterOperationalState;
  isHealthy: boolean;
  latencyMs: number;
  details?: string;
  isSimulated?: boolean;
}

export interface ChannelAdapter {
  channelType: ChannelType;
  name: string;
  getState(): AdapterOperationalState;
  verifyWebhook(headers: Record<string, string>, rawBody: string | Buffer): Promise<WebhookVerificationResult>;
  normalizeInboundMessage(payload: unknown, organizationId: UUID): Promise<UnifiedMessage>;
  dispatchOutboundMessage(message: UnifiedMessage): Promise<{ externalMessageId: string; status: MessageDeliveryStatus }>;
  fetchHealthStatus(): Promise<AdapterHealthStatus>;
}

export interface TelephonyAdapter {
  name: string;
  getState(): AdapterOperationalState;
  fetchHealthStatus(): Promise<AdapterHealthStatus>;
  initiateOutboundCall(params: { organizationId: UUID; from: string; to: string; agentId: UUID }): Promise<CallSession>;
  handleInboundCall(params: { organizationId: UUID; callerNumber: string; calleeNumber: string }): Promise<CallSession>;
  toggleHold(callId: UUID, holdState: boolean): Promise<void>;
  toggleMute(callId: UUID, muteState: boolean): Promise<void>;
  transferCall(callId: UUID, targetAgentId: UUID, isWarm: boolean): Promise<void>;
  bargeOrWhisperCall(callId: UUID, supervisorId: UUID, mode: 'whisper' | 'barge' | 'listen'): Promise<void>;
  terminateCall(callId: UUID, disposition: string): Promise<CallSession>;
}

export interface WhatsAppCloudApiConfig {
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
  rateLimitPerSecond?: number;
  allowSimulation?: boolean;
}

export interface CequensAdapterConfig {
  apiKey?: string;
  senderName?: string;
  webhookSecret?: string;
  allowSimulation?: boolean;
}

export interface TelegramAdapterConfig {
  botToken?: string;
  webhookSecretToken?: string;
  allowSimulation?: boolean;
}

export interface EmailAdapterConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  webhookSecret?: string;
  allowSimulation?: boolean;
}

export interface SipTelephonyConfig {
  sipServerUri?: string;
  sipUsername?: string;
  sipPassword?: string;
  defaultCallerId?: string;
  mandatoryRecordingDisclosure?: boolean;
  legalComplianceNotice?: string;
  allowSimulation?: boolean;
}
