/**
 * @file server/modules/integrations/contracts.ts
 * Omnichannel Integration & Channel Provider Abstractions
 */

import { ChannelType, UnifiedMessage, UUID, CallSession } from '../../core/types.ts';

export interface WebhookVerificationResult {
  isValid: boolean;
  rawPayload: unknown;
  senderIdentifier: string;
  signatureHeader?: string;
  error?: string;
}

export interface ChannelAdapter {
  channelType: ChannelType;
  name: string;
  verifyWebhook(headers: Record<string, string>, rawBody: string | Buffer): Promise<WebhookVerificationResult>;
  normalizeInboundMessage(payload: unknown, organizationId: UUID): Promise<UnifiedMessage>;
  dispatchOutboundMessage(message: UnifiedMessage): Promise<{ externalMessageId: string; status: 'sent' | 'delivered' | 'failed' }>;
  fetchHealthStatus(): Promise<{ isHealthy: boolean; latencyMs: number; details?: string }>;
}

export interface TelephonyAdapter {
  name: string;
  initiateOutboundCall(params: { organizationId: UUID; from: string; to: string; agentId: UUID }): Promise<CallSession>;
  handleInboundCall(params: { organizationId: UUID; callerNumber: string; calleeNumber: string }): Promise<CallSession>;
  toggleHold(callId: UUID, holdState: boolean): Promise<void>;
  toggleMute(callId: UUID, muteState: boolean): Promise<void>;
  transferCall(callId: UUID, targetAgentId: UUID, isWarm: boolean): Promise<void>;
  bargeOrWhisperCall(callId: UUID, supervisorId: UUID, mode: 'whisper' | 'barge' | 'listen'): Promise<void>;
  terminateCall(callId: UUID, disposition: string): Promise<CallSession>;
}

export interface WhatsAppCloudApiConfig {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  rateLimitPerSecond: number;
}
