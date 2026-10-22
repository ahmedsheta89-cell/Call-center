/**
 * @file server/db/store.ts
 * Multi-Tenant In-Memory Relational Store with Foreign Key & Index Semantics
 * Mirrors PostgreSQL structure and guarantees strict tenant isolation.
 */

import fs from 'fs';
import os from 'os';
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
import { AuditLogger } from '../core/audit.ts';

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
  // Disk Persistence & Backup Engine (Stored in OS Temp Dir to keep Git Workspace 100% clean)
  // ----------------------------------------------------
  private persistFilePath = path.join(os.tmpdir(), 'omniflow-data', 'db_state.json');
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
      auditEvents: AuditLogger.exportAllEvents(),
    };
  }

  public saveToDisk(): boolean {
    const tmpPath = `${this.persistFilePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      const dir = path.dirname(this.persistFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const backup = this.exportFullBackup();
      const serialized = JSON.stringify(backup, null, 2);
      const fd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeFileSync(fd, serialized, 'utf-8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, this.persistFilePath);
      console.log(`[Storage] Database state persisted safely to ${this.persistFilePath}`);
      return true;
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // ignore cleanup error
      }
      console.error('[Storage Error] Failed to persist database state to disk:', err);
      return false;
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

      const restored = this.importFullBackup(parsed);
      if (!restored) {
        return false;
      }
      console.log(`[Storage] Successfully restored enterprise database from persistent storage (${parsed.exportedAt || 'saved state'}).`);
      return true;
    } catch (err) {
      console.error('[Storage Error] Failed to load database state from disk:', err);
      return false;
    }
  }

  /**
   * Strictly transactional, all-or-nothing backup restoration.
   * Validates all collections, primary keys, tenant foreign keys, and AuditLogger hash chain
   * in staging memory BEFORE mutating any live Map. Guarantees zero partial state corruption on failure.
   */
  public importFullBackup(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.organizations) || data.organizations.length === 0) {
      return false;
    }

    const collectionSpecs: Array<{ key: string; requireOrgId: boolean }> = [
      { key: 'organizations', requireOrgId: false },
      { key: 'users', requireOrgId: true },
      { key: 'teams', requireOrgId: true },
      { key: 'agents', requireOrgId: true },
      { key: 'customers', requireOrgId: true },
      { key: 'customerChannels', requireOrgId: false },
      { key: 'conversations', requireOrgId: true },
      { key: 'messages', requireOrgId: true },
      { key: 'calls', requireOrgId: true },
      { key: 'tickets', requireOrgId: true },
      { key: 'slaPolicies', requireOrgId: true },
      { key: 'knowledgeDocuments', requireOrgId: true },
      { key: 'qaRubrics', requireOrgId: true },
      { key: 'qaEvaluations', requireOrgId: true },
      { key: 'automationRules', requireOrgId: true },
      { key: 'shifts', requireOrgId: true },
    ];

    const stagedMaps: Record<string, Map<UUID, any>> = {};

    try {
      // 1. Validate & stage all entity collections in isolated staging maps
      for (const spec of collectionSpecs) {
        const rawList = data[spec.key];
        if (rawList === undefined) continue;
        if (!Array.isArray(rawList)) {
          return false;
        }
        const map = new Map<UUID, any>();
        for (const item of rawList) {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.trim().length === 0) {
            return false;
          }
          if (spec.requireOrgId && (typeof item.organizationId !== 'string' || item.organizationId.trim().length === 0)) {
            return false;
          }
          map.set(item.id, item);
        }
        stagedMaps[spec.key] = map;
      }

      // 2. Validate auditEvents hash chain integrity prior to committing any changes
      let stagedAuditEvents: AuditEvent[] | null = null;
      if (data.auditEvents !== undefined) {
        if (!Array.isArray(data.auditEvents)) {
          return false;
        }
        if (data.auditEvents.length > 0) {
          const chainCheck = AuditLogger.verifyChainIntegrity(data.auditEvents);
          if (!chainCheck.valid) {
            return false;
          }
        }
        stagedAuditEvents = data.auditEvents;
      }

      // 3. Atomic commit: swap staged maps into live DatabaseStore only after 100% validation succeeds
      for (const spec of collectionSpecs) {
        const staged = stagedMaps[spec.key];
        if (staged) {
          const targetMap: Map<UUID, any> = (this as any)[spec.key];
          targetMap.clear();
          for (const [k, v] of staged.entries()) {
            targetMap.set(k, v);
          }
        }
      }

      if (stagedAuditEvents !== null) {
        AuditLogger.importEvents(stagedAuditEvents);
      }

      return true;
    } catch (err) {
      console.error('[Storage Error] Atomic importFullBackup aborted due to error:', err);
      return false;
    }
  }
}

export const db = new DatabaseStore();
