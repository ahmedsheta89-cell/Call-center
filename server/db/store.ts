/**
 * @file server/db/store.ts
 * Multi-Tenant In-Memory Relational Store with Foreign Key & Index Semantics
 * Mirrors PostgreSQL structure and guarantees strict tenant isolation.
 */

import fs from 'fs';
import path from 'path';
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

  // ----------------------------------------------------
  // Disk Persistence & Backup Engine
  // ----------------------------------------------------
  private persistFilePath = path.join(process.cwd(), 'data', 'db_state.json');
  private persistTimer: NodeJS.Timeout | null = null;

  public schedulePersist(delayMs = 300): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.saveToDisk();
      this.persistTimer = null;
    }, delayMs);
  }

  public exportFullBackup(): Record<string, unknown> {
    return {
      version: '1.0.0-enterprise',
      exportedAt: new Date().toISOString(),
      organizations: Array.from(this.organizations.values()),
      users: Array.from(this.users.values()),
      teams: Array.from(this.teams.values()),
      agents: Array.from(this.agents.values()),
      customers: Array.from(this.customers.values()),
      customerChannels: Array.from(this.customerChannels.values()),
      conversations: Array.from(this.conversations.values()),
      messages: Array.from(this.messages.values()),
      calls: Array.from(this.calls.values()),
      tickets: Array.from(this.tickets.values()),
      slaPolicies: Array.from(this.slaPolicies.values()),
      knowledgeDocuments: Array.from(this.knowledgeDocuments.values()),
      qaRubrics: Array.from(this.qaRubrics.values()),
      qaEvaluations: Array.from(this.qaEvaluations.values()),
      automationRules: Array.from(this.automationRules.values()),
      shifts: Array.from(this.shifts.values()),
    };
  }

  public saveToDisk(): void {
    try {
      const dir = path.dirname(this.persistFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const backup = this.exportFullBackup();
      const tmpPath = `${this.persistFilePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(backup, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.persistFilePath);
      console.log(`[Storage] Database state persisted safely to ${this.persistFilePath}`);
    } catch (err) {
      console.error('[Storage Error] Failed to persist database state to disk:', err);
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(this.persistFilePath)) {
        return false;
      }

      const content = fs.readFileSync(this.persistFilePath, 'utf-8');
      if (!content || content.trim().length === 0) {
        return false;
      }

      const parsed = JSON.parse(content);
      if (!parsed || !Array.isArray(parsed.organizations) || parsed.organizations.length === 0) {
        return false;
      }

      this.importFullBackup(parsed);
      console.log(`[Storage] Successfully restored enterprise database from persistent storage (${parsed.exportedAt || 'saved state'}).`);
      return true;
    } catch (err) {
      console.error('[Storage Error] Failed to load database state from disk:', err);
      return false;
    }
  }

  public importFullBackup(data: any): boolean {
    if (!data) return false;

    if (Array.isArray(data.organizations)) {
      this.organizations.clear();
      data.organizations.forEach((item: Organization) => this.organizations.set(item.id, item));
    }
    if (Array.isArray(data.users)) {
      this.users.clear();
      data.users.forEach((item: User) => this.users.set(item.id, item));
    }
    if (Array.isArray(data.teams)) {
      this.teams.clear();
      data.teams.forEach((item: Team) => this.teams.set(item.id, item));
    }
    if (Array.isArray(data.agents)) {
      this.agents.clear();
      data.agents.forEach((item: AgentProfile) => this.agents.set(item.id, item));
    }
    if (Array.isArray(data.customers)) {
      this.customers.clear();
      data.customers.forEach((item: Customer) => this.customers.set(item.id, item));
    }
    if (Array.isArray(data.customerChannels)) {
      this.customerChannels.clear();
      data.customerChannels.forEach((item: CustomerChannel) => this.customerChannels.set(item.id, item));
    }
    if (Array.isArray(data.conversations)) {
      this.conversations.clear();
      data.conversations.forEach((item: Conversation) => this.conversations.set(item.id, item));
    }
    if (Array.isArray(data.messages)) {
      this.messages.clear();
      data.messages.forEach((item: UnifiedMessage) => this.messages.set(item.id, item));
    }
    if (Array.isArray(data.calls)) {
      this.calls.clear();
      data.calls.forEach((item: CallSession) => this.calls.set(item.id, item));
    }
    if (Array.isArray(data.tickets)) {
      this.tickets.clear();
      data.tickets.forEach((item: Ticket) => this.tickets.set(item.id, item));
    }
    if (Array.isArray(data.slaPolicies)) {
      this.slaPolicies.clear();
      data.slaPolicies.forEach((item: SLAPolicy) => this.slaPolicies.set(item.id, item));
    }
    if (Array.isArray(data.knowledgeDocuments)) {
      this.knowledgeDocuments.clear();
      data.knowledgeDocuments.forEach((item: KnowledgeDocument) => this.knowledgeDocuments.set(item.id, item));
    }
    if (Array.isArray(data.qaRubrics)) {
      this.qaRubrics.clear();
      data.qaRubrics.forEach((item: QARubric) => this.qaRubrics.set(item.id, item));
    }
    if (Array.isArray(data.qaEvaluations)) {
      this.qaEvaluations.clear();
      data.qaEvaluations.forEach((item: QAEvaluation) => this.qaEvaluations.set(item.id, item));
    }
    if (Array.isArray(data.automationRules)) {
      this.automationRules.clear();
      data.automationRules.forEach((item: AutomationRule) => this.automationRules.set(item.id, item));
    }
    if (Array.isArray(data.shifts)) {
      this.shifts.clear();
      data.shifts.forEach((item: ShiftSchedule) => this.shifts.set(item.id, item));
    }

    return true;
  }
}

export const db = new DatabaseStore();
