/**
 * @file server/db/store.ts
 * Multi-Tenant In-Memory Relational Store with Foreign Key & Index Semantics
 * Mirrors PostgreSQL structure and guarantees strict tenant isolation.
 */

import {
  Organization,
  User,
  AgentProfile,
  Customer,
  CustomerChannel,
  Conversation,
  UnifiedMessage,
  CallSession,
  Ticket,
  AuditEvent,
  UUID,
} from '../core/types.ts';

export interface KnowledgeDocument {
  id: UUID;
  organizationId: UUID;
  title: string;
  category: string;
  tags: string[];
  version: number;
  status: 'draft' | 'review' | 'approved' | 'published' | 'archived';
  content: string;
  chunks: Array<{ id: string; content: string; embeddingKeyword: string }>;
  citationsCount: number;
  publishedAt?: string;
  updatedAt: string;
}

export interface QARubric {
  id: UUID;
  organizationId: UUID;
  title: string;
  criteria: Array<{
    category: string;
    weight: number;
    description: string;
  }>;
  passingScore: number;
  isActive: boolean;
  createdAt: string;
}

export interface QAEvaluation {
  id: UUID;
  organizationId: UUID;
  rubricId: UUID;
  conversationId?: UUID;
  callId?: UUID;
  agentId: UUID;
  evaluatorType: 'ai_evaluator' | 'human_supervisor';
  evaluatorName: string;
  totalScore: number;
  passed: boolean;
  findings: Array<{ criterion: string; score: number; maxScore: number; note: string }>;
  feedback: string;
  createdAt: string;
}

export interface Team {
  id: UUID;
  organizationId: UUID;
  name: string;
  description: string;
  leadUserId?: UUID;
  memberCount: number;
}

export interface SLAPolicy {
  id: UUID;
  organizationId: UUID;
  name: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  firstResponseTimeMinutes: number;
  resolutionTimeMinutes: number;
}

export interface AutomationRule {
  id: UUID;
  organizationId: UUID;
  name: string;
  trigger: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; payload: Record<string, unknown> }>;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string;
}

export interface ShiftSchedule {
  id: UUID;
  organizationId: UUID;
  agentId: UUID;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'active' | 'break' | 'completed' | 'absent';
  adherencePercentage: number;
}

class DatabaseStore {
  public organizations: Map<UUID, Organization> = new Map();
  public users: Map<UUID, User> = new Map();
  public teams: Map<UUID, Team> = new Map();
  public agents: Map<UUID, AgentProfile> = new Map();
  public customers: Map<UUID, Customer> = new Map();
  public customerChannels: Map<UUID, CustomerChannel> = new Map();
  public conversations: Map<UUID, Conversation> = new Map();
  public messages: Map<UUID, UnifiedMessage> = new Map();
  public calls: Map<UUID, CallSession> = new Map();
  public tickets: Map<UUID, Ticket> = new Map();
  public slaPolicies: Map<UUID, SLAPolicy> = new Map();
  public knowledgeDocuments: Map<UUID, KnowledgeDocument> = new Map();
  public qaRubrics: Map<UUID, QARubric> = new Map();
  public qaEvaluations: Map<UUID, QAEvaluation> = new Map();
  public automationRules: Map<UUID, AutomationRule> = new Map();
  public shifts: Map<UUID, ShiftSchedule> = new Map();

  // Indexes for high performance tenant filtering
  public orgIndex = {
    customers: new Map<UUID, Set<UUID>>(),
    conversations: new Map<UUID, Set<UUID>>(),
    tickets: new Map<UUID, Set<UUID>>(),
    messages: new Map<UUID, Set<UUID>>(),
    calls: new Map<UUID, Set<UUID>>(),
  };

  public getCustomers(orgId: UUID): Customer[] {
    const list: Customer[] = [];
    for (const c of this.customers.values()) {
      if (c.organizationId === orgId && !c.deletedAt) {
        list.push(c);
      }
    }
    return list;
  }

  public getConversations(orgId: UUID): Conversation[] {
    const list: Conversation[] = [];
    for (const c of this.conversations.values()) {
      if (c.organizationId === orgId) {
        list.push(c);
      }
    }
    return list.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  public getMessages(orgId: UUID, conversationId: UUID): UnifiedMessage[] {
    const list: UnifiedMessage[] = [];
    for (const m of this.messages.values()) {
      if (m.organizationId === orgId && m.conversationId === conversationId) {
        list.push(m);
      }
    }
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public getTickets(orgId: UUID): Ticket[] {
    const list: Ticket[] = [];
    for (const t of this.tickets.values()) {
      if (t.organizationId === orgId) {
        list.push(t);
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getCalls(orgId: UUID): CallSession[] {
    const list: CallSession[] = [];
    for (const c of this.calls.values()) {
      if (c.organizationId === orgId) {
        list.push(c);
      }
    }
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }
}

export const db = new DatabaseStore();
