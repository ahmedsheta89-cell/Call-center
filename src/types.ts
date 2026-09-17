/**
 * @file src/types.ts
 * Frontend Client Types for AI Contact Center OS
 */

export type ChannelType = 'whatsapp' | 'webchat' | 'voice' | 'email' | 'messenger' | 'instagram' | 'sms';
export type CustomerTier = 'standard' | 'priority' | 'vip';
export type PriorityType = 'low' | 'medium' | 'high' | 'urgent';
export type SLAStatus = 'healthy' | 'warning' | 'at_risk' | 'breached';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  customerTier: CustomerTier;
  lifetimeValue: number;
  tags: string[];
  customFields?: Record<string, unknown>;
  channels?: Array<{ id: string; channelType: ChannelType; externalIdentifier: string; isVerified: boolean }>;
  assignedAgentName?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  customerTier: CustomerTier;
  customerPhone?: string;
  channel: ChannelType;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: PriorityType;
  assignedAgentId?: string;
  subject?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  intent?: string;
  slaDueAt?: string;
  lastMessageAt: string;
  latestMessageSnippet?: string;
  unreadCount?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  channel: ChannelType;
  direction: 'inbound' | 'outbound' | 'internal_note';
  type: 'text' | 'image' | 'audio' | 'document';
  body: string;
  sender: {
    id: string;
    type: 'customer' | 'agent' | 'bot' | 'system';
    name?: string;
  };
  status: 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
}

export interface CallSession {
  id: string;
  customerId?: string;
  customerName?: string;
  customerTier?: CustomerTier;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'in_progress' | 'hold' | 'transferring' | 'completed' | 'failed';
  callerNumber: string;
  calleeNumber: string;
  durationSeconds: number;
  transcript?: string;
  aiSummary?: string;
  aiSentiment?: 'positive' | 'neutral' | 'negative';
  disposition?: string;
  startedAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  assignedAgentName?: string;
  title: string;
  description: string;
  status: 'new' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
  priority: PriorityType;
  category: string;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  slaStatus: SLAStatus;
  createdAt: string;
}

export interface Agent {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  teamName?: string;
  status: 'online' | 'busy' | 'break' | 'offline';
  skills: string[];
  currentActiveChats: number;
  currentActiveCalls: number;
  maxConcurrency: number;
}

export interface LiveMetrics {
  activeConversations: number;
  activeCalls: number;
  waitingQueue: number;
  slaAtRiskCount: number;
  agentsOnline: number;
  agentsBusy: number;
  serviceAvailabilityPercent: number;
  aiComplianceAlerts: number;
  openTicketsCount: number;
}

export type RecommendationDomain =
  | 'operational'
  | 'wfm'
  | 'customer_nba'
  | 'qa_coaching'
  | 'knowledge_gap'
  | 'cost_optimization';

export interface SmartRecommendation {
  id: string;
  domain: RecommendationDomain;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  impact: string;
  actionLabel: string;
  applied: boolean;
  appliedAt?: string;
  targetEntity?: {
    type: 'customer' | 'agent' | 'ticket' | 'shift' | 'kb' | 'channel';
    id: string;
    name?: string;
  };
}

export interface CoachingActionPlan {
  id: string;
  agentId: string;
  agentName: string;
  focusArea: string;
  recommendationText: string;
  targetMetric: string;
  status: 'active' | 'in_progress' | 'completed';
  assignedBy: string;
  dueDate: string;
  progressPercent: number;
}
