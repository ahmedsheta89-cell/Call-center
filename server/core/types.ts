/**
 * @file server/core/types.ts
 * Core Domain Entities and Value Objects for AI Contact Center OS
 */

export type UUID = string;

export interface TenantContext {
  organizationId: UUID;
  userId: UUID;
  userRole: string;
  permissions: string[];
}

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  plan: 'free_local' | 'starter' | 'professional' | 'enterprise';
  settings: {
    timezone: string;
    defaultLanguage: 'ar' | 'en';
    workingHours: { start: string; end: string; days: number[] };
    zeroCostMode: boolean;
    aiMonthlyBudgetUsd: number;
    aiCurrentMonthSpendUsd: number;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: UUID;
  organizationId: UUID;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string;
  phoneNumber?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfile {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  teamId?: UUID;
  status: 'online' | 'busy' | 'break' | 'offline';
  skills: string[];
  languages: string[];
  maxConcurrency: number;
  currentActiveChats: number;
  currentActiveCalls: number;
  updatedAt: string;
}

export interface Customer {
  id: UUID;
  organizationId: UUID;
  name: string;
  email?: string;
  phone?: string;
  customerTier: 'standard' | 'priority' | 'vip';
  lifetimeValue: number;
  assignedAgentId?: UUID;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CustomerChannel {
  id: UUID;
  customerId: UUID;
  channelType: 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'voice' | 'webchat';
  externalIdentifier: string;
  isVerified: boolean;
  lastInteractionAt: string;
}

export type ChannelType = 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'webchat' | 'voice';

export interface UnifiedMessage {
  id: UUID;
  organizationId: UUID;
  conversationId: UUID;
  customerId: UUID;
  channel: ChannelType;
  direction: 'inbound' | 'outbound' | 'internal_note';
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'template' | 'system_event';
  body: string;
  sender: {
    id: UUID | 'bot' | 'system';
    type: 'customer' | 'agent' | 'bot' | 'system';
    name?: string;
  };
  attachments?: Array<{
    id: UUID;
    type: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    hashSha256: string;
  }>;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Conversation {
  id: UUID;
  organizationId: UUID;
  customerId: UUID;
  channel: ChannelType;
  status: 'queued' | 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedAgentId?: UUID;
  assignedTeamId?: UUID;
  subject?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  intent?: string;
  slaDueAt?: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallSession {
  id: UUID;
  organizationId: UUID;
  customerId?: UUID;
  agentId?: UUID;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'in_progress' | 'hold' | 'completed' | 'missed' | 'abandoned';
  callerNumber: string;
  calleeNumber: string;
  durationSeconds: number;
  recordingUrl?: string;
  transcript?: string;
  disposition?: string;
  aiSummary?: string;
  aiSentiment?: 'positive' | 'neutral' | 'negative';
  startedAt: string;
  endedAt?: string;
}

export interface Ticket {
  id: UUID;
  organizationId: UUID;
  ticketNumber: number;
  customerId: UUID;
  conversationId?: UUID;
  assignedAgentId?: UUID;
  teamId?: UUID;
  title: string;
  description: string;
  status: 'new' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  firstResponseDueAt?: string;
  resolutionDueAt?: string;
  slaStatus: 'healthy' | 'warning' | 'at_risk' | 'breached';
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface AuditEvent {
  id: UUID;
  organizationId: UUID;
  actorId?: UUID;
  actorType: 'user' | 'agent' | 'ai' | 'system';
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  reason?: string;
  createdAt: string;
}
