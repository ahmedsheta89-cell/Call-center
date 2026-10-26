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
import { AuditLogger, redactSensitiveValue } from '../core/audit.ts';
import {
  decryptSecretValue,
  encryptChannelConfigForDisk,
  hasConfiguredSecretCredential,
  inspectDiskChannelConfigSecrets,
  isChannelSecretField,
  isEncryptedSecretEnvelope,
  validateChannelEncryptionKey,
} from '../core/channelCrypto.ts';

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

export interface ChannelConfigRecord {
  id: UUID;
  organizationId: UUID;
  channelId: string;
  config: Record<string, any>;
  updatedAt: string;
}

export interface RecommendationRecord {
  id: UUID;
  organizationId: UUID;
  domain: 'operational' | 'wfm' | 'customer_nba' | 'qa_coaching' | 'knowledge_gap' | 'cost_optimization';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact: string;
  actionLabel: string;
  applied: boolean;
  appliedAt?: string;
  targetEntity?: {
    type: 'customer' | 'agent' | 'channel' | 'shift' | 'kb';
    id: string;
    name: string;
  };
}

export interface CoachingPlanRecord {
  id: UUID;
  organizationId: UUID;
  agentId: string;
  agentName: string;
  title?: string;
  focusArea: string;
  recommendationText: string;
  targetMetric: string;
  status: 'active' | 'in_progress' | 'completed';
  assignedBy: string;
  dueDate: string;
  targetDate?: string;
  progressPercent: number;
  recommendedActions?: string[];
}

export interface MacroRecord {
  id: UUID;
  organizationId: UUID;
  shortcut: string;
  title: string;
  category: string;
  text: string;
  actions?: {
    setStatus?: string;
    setPriority?: string;
    escalate?: boolean;
    assignTo?: string;
  };
}

export interface TeamQAFeedbackRecord {
  id: UUID;
  organizationId: UUID;
  reviewerName: string;
  reviewerRole: string;
  moduleId: string;
  moduleName: string;
  verdict: 'passed_100' | 'needs_improvement' | 'bug_report';
  comment: string;
  githubIssueUrl?: string;
  githubIssueNumber?: number;
  notifiedAdminPhone: string;
  createdAt: string;
}

export interface ConnectedDeviceRecord {
  id: UUID;
  organizationId: UUID;
  deviceId: string;
  deviceName: string;
  osName: 'Android' | 'Windows' | 'iOS' | 'macOS' | 'Linux';
  formFactor: 'mobile' | 'tablet' | 'desktop';
  appRuntime: 'Android APK / TWA' | 'Windows Desktop EXE' | 'Standalone PWA' | 'Web Browser';
  browserName: string;
  screenResolution: string;
  activeTab: string;
  operatorRole: string;
  adminPhone: string;
  status: 'online_synced' | 'standby';
  latencyMs: number;
  lastHeartbeatAt: string;
}

export interface CrossDeviceSyncEventRecord {
  id: UUID;
  organizationId: UUID;
  syncId: string;
  sourceDeviceId: string;
  sourcePlatform: string;
  targetPlatforms: string[];
  actionType: string;
  payloadSummary: string;
  sha256Receipt: string;
  roundtripLatencyMs: number;
  timestamp: string;
}

export interface StorageDiagnosticError {
  operation: 'saveToDisk' | 'loadFromDisk' | 'importFullBackup' | 'tenantValidation';
  code: string;
  message: string;
  timestamp: string;
}

export interface BackupImportResult {
  ok: boolean;
  status: number;
  code: string;
  message: string;
  unconfiguredChannels?: string[];
}

export interface IDataStore {
  assertValidOrganizationId(orgId: unknown): UUID;
  getCustomers(orgId: UUID): Customer[];
  getConversations(orgId: UUID): Conversation[];
  getMessages(orgId: UUID, conversationId: UUID): UnifiedMessage[];
  getTickets(orgId: UUID): Ticket[];
  getCalls(orgId: UUID): CallSession[];
  getChannelConfig(orgId: UUID, channelId: string): Record<string, any> | undefined;
  getChannelConfigs(orgId: UUID): ChannelConfigRecord[];
  setChannelConfig(orgId: UUID, channelId: string, configUpdate: Record<string, any>): ChannelConfigRecord;
  getRecommendations(orgId: UUID, domain?: string): RecommendationRecord[];
  getRecommendation(orgId: UUID, id: UUID): RecommendationRecord | undefined;
  saveRecommendation(orgIdOrRecord: UUID | RecommendationRecord, maybeRecord?: RecommendationRecord): RecommendationRecord;
  getCoachingPlans(orgId: UUID): CoachingPlanRecord[];
  getCoachingPlan(orgId: UUID, id: UUID): CoachingPlanRecord | undefined;
  saveCoachingPlan(orgIdOrPlan: UUID | CoachingPlanRecord, maybePlan?: CoachingPlanRecord): CoachingPlanRecord;
  getMacros(orgId: UUID): MacroRecord[];
  getMacro(orgId: UUID, id: UUID): MacroRecord | undefined;
  saveMacro(orgIdOrMacro: UUID | MacroRecord, maybeMacro?: MacroRecord): MacroRecord;
  getTeamQaFeedback(orgId: UUID): TeamQAFeedbackRecord[];
  saveTeamQaFeedback(orgIdOrItem: UUID | TeamQAFeedbackRecord, maybeItem?: TeamQAFeedbackRecord): TeamQAFeedbackRecord;
  getConnectedDevices(orgId: UUID): ConnectedDeviceRecord[];
  getConnectedDevice(orgId: UUID, deviceId: UUID): ConnectedDeviceRecord | undefined;
  saveConnectedDevice(orgIdOrDevice: UUID | ConnectedDeviceRecord, maybeDevice?: ConnectedDeviceRecord): ConnectedDeviceRecord;
  getCrossDeviceSyncEvents(orgId: UUID): CrossDeviceSyncEventRecord[];
  saveCrossDeviceSyncEvent(orgIdOrEvent: UUID | CrossDeviceSyncEventRecord, maybeEvent?: CrossDeviceSyncEventRecord): CrossDeviceSyncEventRecord;
  exportFullBackup(): Record<string, any>;
  exportTenantBackup(orgId: UUID): Record<string, any>;
  importFullBackup(data: any): boolean;
  importFullBackupDetailed(
    data: any,
    options?: { scopeOrgId?: UUID; persistToDisk?: boolean; isDiskLoad?: boolean }
  ): BackupImportResult;
  saveToDisk(): boolean;
  loadFromDisk(): boolean;
  isDiskOverwriteProtected(): boolean;
  getLastStorageError(): StorageDiagnosticError | null;
}

const SENSITIVE_LOG_PATTERN =
  /(apiToken|webhookSecret|authSecret|accessToken|refreshToken|verifyToken|appSecret|clientSecret|sipPassword|smtpPassword|imapPassword|apiKey|api_key|privateKey|private_key|passphrase|credential(?!sConfigured\b)|password|secret|token|authorization|CHANNEL_SECRET_ENCRYPTION_KEY)["']?\s*[:=]\s*["']?[^\s,"'}]+/gi;

function sanitizeStorageDiagnosticMessage(raw: unknown): string {
  const str = raw instanceof Error ? raw.message : String(raw || 'Unknown storage error');
  return str
    .replace(SENSITIVE_LOG_PATTERN, '$1=[REDACTED_SECRET]')
    .replace(/\b01[0125][0-9]{8}\b/g, '[REDACTED_PHONE]')
    .slice(0, 500);
}

class DatabaseStore implements IDataStore {
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

  // Phase P.1 Consolidated Runtime Collections (Previously unpersisted module-scoped structures in router.ts)
  public channelConfigs: Map<UUID, ChannelConfigRecord> = new Map();
  public recommendations: Map<UUID, RecommendationRecord> = new Map();
  public coachingPlans: Map<UUID, CoachingPlanRecord> = new Map();
  public macros: Map<UUID, MacroRecord> = new Map();
  public teamQaFeedback: Map<UUID, TeamQAFeedbackRecord> = new Map();
  public connectedDevices: Map<UUID, ConnectedDeviceRecord> = new Map();
  public crossDeviceSyncEvents: Map<UUID, CrossDeviceSyncEventRecord> = new Map();

  // Indexes for high performance tenant filtering
  public orgIndex = {
    customers: new Map<UUID, Set<UUID>>(),
    conversations: new Map<UUID, Set<UUID>>(),
    tickets: new Map<UUID, Set<UUID>>(),
    messages: new Map<UUID, Set<UUID>>(),
    calls: new Map<UUID, Set<UUID>>(),
  };

  private defaultPersistFilePath = path.join(os.tmpdir(), 'omniflow-data', 'db_state.json');
  private persistFilePath = this.defaultPersistFilePath;
  private persistTimer: NodeJS.Timeout | null = null;
  private lastStorageError: StorageDiagnosticError | null = null;
  private existingFileProtected = false;
  private existingFileProtectionReason: 'NONE' | 'CORRUPTED_OR_EMPTY' | 'SECRET_KEY_PROTECTED' = 'NONE';

  private recordStorageError(
    operation: StorageDiagnosticError['operation'],
    code: string,
    rawMessage: unknown
  ): void {
    this.lastStorageError = {
      operation,
      code,
      message: sanitizeStorageDiagnosticMessage(rawMessage),
      timestamp: new Date().toISOString(),
    };
  }

  public getLastStorageError(): StorageDiagnosticError | null {
    return this.lastStorageError ? { ...this.lastStorageError } : null;
  }

  public isDiskOverwriteProtected(): boolean {
    return this.existingFileProtected;
  }

  public getPersistFilePath(): string {
    return this.persistFilePath;
  }

  public setPersistFilePathForTesting(customPath: string | null): void {
    if (process.env.NODE_ENV === 'production') return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.existingFileProtected = false;
    this.existingFileProtectionReason = 'NONE';
    this.persistFilePath = customPath ? customPath : this.defaultPersistFilePath;
  }

  /**
   * Validates that an organizationId comes from a verified, registered organization context.
   * Never falls back to a default organization or silently migrates unknown organization IDs.
   */
  public assertValidOrganizationId(orgId: unknown): UUID {
    if (typeof orgId !== 'string' || orgId.trim().length === 0 || orgId.trim() === 'unauthenticated') {
      this.recordStorageError('tenantValidation', 'INVALID_ORGANIZATION_CONTEXT', 'Missing or unauthenticated organizationId');
      throw Object.assign(new Error('Valid organizationId context is required; default tenant assignment is forbidden.'), {
        status: 400,
        code: 'INVALID_ORGANIZATION_CONTEXT',
      });
    }
    const cleanOrgId = orgId.trim();
    if (!this.organizations.has(cleanOrgId)) {
      this.recordStorageError('tenantValidation', 'UNREGISTERED_ORGANIZATION_ID', `Organization ${cleanOrgId} is not registered`);
      throw Object.assign(new Error(`Organization context [${cleanOrgId}] is not registered in the store.`), {
        status: 400,
        code: 'INVALID_ORGANIZATION_CONTEXT',
      });
    }
    return cleanOrgId;
  }

  private assertRecordIdAndTenant<T extends { id: UUID; organizationId: UUID }>(
    record: T,
    existingMap: Map<UUID, T>,
    entityLabel: string
  ): { id: UUID; orgId: UUID } {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || record.id.trim().length === 0) {
      throw Object.assign(new Error(`${entityLabel} record requires a non-empty string id.`), {
        status: 400,
        code: 'INVALID_RECORD_ID',
      });
    }
    const orgId = this.assertValidOrganizationId(record.organizationId);
    const id = record.id.trim();
    const existing = existingMap.get(id);
    if (existing && existing.organizationId !== orgId) {
      throw Object.assign(
        new Error(`Cross-tenant overwrite forbidden on ${entityLabel} [${id}].`),
        {
          status: 403,
          code: 'CROSS_TENANT_OVERWRITE_FORBIDDEN',
        }
      );
    }
    return { id, orgId };
  }

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
  // Phase P.1 Consolidated Collection Accessors & Mutators
  // ----------------------------------------------------

  public getChannelConfig(orgId: UUID, channelId: string): Record<string, any> | undefined {
    const validOrgId = this.assertValidOrganizationId(orgId);
    if (!channelId || typeof channelId !== 'string') return undefined;
    const compositeKey = `${validOrgId}::${channelId.trim()}`;
    const direct = this.channelConfigs.get(compositeKey);
    if (direct && direct.organizationId === validOrgId) {
      return { ...direct.config };
    }
    for (const item of this.channelConfigs.values()) {
      if (item.organizationId === validOrgId && item.channelId === channelId.trim()) {
        return { ...item.config };
      }
    }
    return undefined;
  }

  public getChannelConfigs(orgId: UUID): ChannelConfigRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    const list: ChannelConfigRecord[] = [];
    for (const item of this.channelConfigs.values()) {
      if (item.organizationId === validOrgId) {
        list.push({ ...item, config: { ...item.config } });
      }
    }
    return list;
  }

  public setChannelConfig(
    orgId: UUID,
    channelId: string,
    configUpdate: Record<string, any>
  ): ChannelConfigRecord {
    const validOrgId = this.assertValidOrganizationId(orgId);
    if (!channelId || typeof channelId !== 'string' || channelId.trim().length === 0) {
      throw Object.assign(new Error('channelId is required'), {
        status: 400,
        code: 'INVALID_CHANNEL_ID',
      });
    }
    if (
      configUpdate &&
      typeof configUpdate === 'object' &&
      'organizationId' in configUpdate &&
      configUpdate.organizationId !== validOrgId
    ) {
      throw Object.assign(new Error('Cross-tenant channel config override is forbidden.'), {
        status: 403,
        code: 'CROSS_TENANT_ACCESS_FORBIDDEN',
      });
    }

    const cleanChannelId = channelId.trim();
    const sanitizedConfig = { ...(configUpdate || {}) };
    delete sanitizedConfig.organizationId;

    // Check if any new/updated secret field is being set; if so, fail-closed when encryption key is missing or invalid
    const hasNewSecretField = Object.entries(sanitizedConfig).some(
      ([k, v]) =>
        isChannelSecretField(k) &&
        typeof v === 'string' &&
        v.trim().length > 0 &&
        v !== '[REDACTED_SECRET]'
    );
    if (hasNewSecretField) {
      const keyCheck = validateChannelEncryptionKey();
      if (!keyCheck.valid) {
        this.recordStorageError(
          'saveToDisk',
          keyCheck.code || 'CHANNEL_SECRET_KEY_MISSING',
          keyCheck.reason || 'Cannot save channel secrets without valid CHANNEL_SECRET_ENCRYPTION_KEY'
        );
        throw Object.assign(
          new Error(
            keyCheck.reason ||
              'Cannot save channel secrets: CHANNEL_SECRET_ENCRYPTION_KEY is missing or invalid.'
          ),
          {
            status: 503,
            code: keyCheck.code || 'CHANNEL_SECRET_KEY_MISSING',
          }
        );
      }
    }

    const id = `${validOrgId}::${cleanChannelId}`;
    const existing = this.channelConfigs.get(id);
    const existingConfig = existing?.config || {};
    const now = new Date().toISOString();

    const mergedConfig: Record<string, any> = {
      ...existingConfig,
    };

    for (const [k, v] of Object.entries(sanitizedConfig)) {
      if (isChannelSecretField(k)) {
        // Never overwrite an existing secret with '[REDACTED_SECRET]' or undefined
        if (v === '[REDACTED_SECRET]' || v === undefined || v === null) {
          continue;
        }
        mergedConfig[k] = v;
      } else {
        mergedConfig[k] = v;
      }
    }

    const hasSecrets = hasConfiguredSecretCredential(mergedConfig);
    mergedConfig.credentialsConfigured = hasSecrets;
    mergedConfig.verified = true;
    mergedConfig.lastCheckedAt = now;

    const updatedRecord: ChannelConfigRecord = {
      id,
      organizationId: validOrgId,
      channelId: cleanChannelId,
      config: mergedConfig,
      updatedAt: now,
    };
    this.channelConfigs.set(id, updatedRecord);
    this.schedulePersist();
    return { ...updatedRecord, config: { ...updatedRecord.config } };
  }

  public getRecommendations(orgId: UUID, domain?: string): RecommendationRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    let list = Array.from(this.recommendations.values()).filter(
      (r) => r.organizationId === validOrgId
    );
    if (domain && domain !== 'all') {
      list = list.filter((r) => r.domain === domain);
    }
    return list;
  }

  public getRecommendation(orgId: UUID, id: UUID): RecommendationRecord | undefined {
    const validOrgId = this.assertValidOrganizationId(orgId);
    const rec = this.recommendations.get(id);
    if (!rec || rec.organizationId !== validOrgId) return undefined;
    return rec;
  }

  private resolveScopedRecord<T extends { organizationId: UUID }>(
    orgIdOrRecord: UUID | T,
    maybeRecord?: T,
    entityLabel = 'Record'
  ): T {
    if (typeof orgIdOrRecord === 'string') {
      const scopedOrgId = this.assertValidOrganizationId(orgIdOrRecord);
      if (!maybeRecord || typeof maybeRecord !== 'object') {
        const err = new Error(`[DataStore][TenantGuard] Missing ${entityLabel} payload for organization '${scopedOrgId}'.`) as Error & {
          status?: number;
          code?: string;
        };
        err.status = 400;
        err.code = 'INVALID_RECORD_ID';
        throw err;
      }
      const recordOrgRaw =
        typeof maybeRecord.organizationId === 'string' ? maybeRecord.organizationId.trim() : '';
      if (recordOrgRaw && recordOrgRaw !== scopedOrgId) {
        this.assertValidOrganizationId(recordOrgRaw);
        const err = new Error(
          `[DataStore][CrossTenantGuard] ${entityLabel} organizationId '${recordOrgRaw}' does not match active tenant '${scopedOrgId}'.`
        ) as Error & { status?: number; code?: string };
        err.status = 403;
        err.code = 'CROSS_TENANT_WRITE_DENIED';
        throw err;
      }
      return {
        ...maybeRecord,
        organizationId: scopedOrgId,
      };
    }
    return orgIdOrRecord;
  }

  public saveRecommendation(
    orgIdOrRecord: UUID | RecommendationRecord,
    maybeRecord?: RecommendationRecord
  ): RecommendationRecord {
    const record = this.resolveScopedRecord(orgIdOrRecord, maybeRecord, 'Recommendation');
    const { id, orgId } = this.assertRecordIdAndTenant(record, this.recommendations, 'Recommendation');
    const normalized: RecommendationRecord = {
      ...record,
      id,
      organizationId: orgId,
    };
    this.recommendations.set(id, normalized);
    this.schedulePersist();
    return normalized;
  }

  public getCoachingPlans(orgId: UUID): CoachingPlanRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    return Array.from(this.coachingPlans.values()).filter(
      (p) => p.organizationId === validOrgId
    );
  }

  public getCoachingPlan(orgId: UUID, id: UUID): CoachingPlanRecord | undefined {
    const validOrgId = this.assertValidOrganizationId(orgId);
    const plan = this.coachingPlans.get(id);
    if (!plan || plan.organizationId !== validOrgId) return undefined;
    return plan;
  }

  public saveCoachingPlan(
    orgIdOrPlan: UUID | CoachingPlanRecord,
    maybePlan?: CoachingPlanRecord
  ): CoachingPlanRecord {
    const plan = this.resolveScopedRecord(orgIdOrPlan, maybePlan, 'CoachingPlan');
    const { id, orgId } = this.assertRecordIdAndTenant(plan, this.coachingPlans, 'CoachingPlan');
    const normalized: CoachingPlanRecord = {
      ...plan,
      id,
      organizationId: orgId,
    };
    this.coachingPlans.set(id, normalized);
    this.schedulePersist();
    return normalized;
  }

  public getMacros(orgId: UUID): MacroRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    return Array.from(this.macros.values()).filter(
      (m) => m.organizationId === validOrgId
    );
  }

  public getMacro(orgId: UUID, id: UUID): MacroRecord | undefined {
    const validOrgId = this.assertValidOrganizationId(orgId);
    const macro = this.macros.get(id);
    if (!macro || macro.organizationId !== validOrgId) return undefined;
    return macro;
  }

  public saveMacro(
    orgIdOrMacro: UUID | MacroRecord,
    maybeMacro?: MacroRecord
  ): MacroRecord {
    const macro = this.resolveScopedRecord(orgIdOrMacro, maybeMacro, 'Macro');
    const { id, orgId } = this.assertRecordIdAndTenant(macro, this.macros, 'Macro');
    const normalized: MacroRecord = {
      ...macro,
      id,
      organizationId: orgId,
    };
    this.macros.set(id, normalized);
    this.schedulePersist();
    return normalized;
  }

  public getTeamQaFeedback(orgId: UUID): TeamQAFeedbackRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    return Array.from(this.teamQaFeedback.values())
      .filter((f) => f.organizationId === validOrgId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public saveTeamQaFeedback(
    orgIdOrItem: UUID | TeamQAFeedbackRecord,
    maybeItem?: TeamQAFeedbackRecord
  ): TeamQAFeedbackRecord {
    const item = this.resolveScopedRecord(orgIdOrItem, maybeItem, 'TeamQAFeedback');
    const { id, orgId } = this.assertRecordIdAndTenant(item, this.teamQaFeedback, 'TeamQAFeedback');
    const normalized: TeamQAFeedbackRecord = {
      ...item,
      id,
      organizationId: orgId,
    };
    this.teamQaFeedback.set(id, normalized);
    this.schedulePersist();
    return normalized;
  }

  public getConnectedDevices(orgId: UUID): ConnectedDeviceRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    return Array.from(this.connectedDevices.values()).filter(
      (d) => d.organizationId === validOrgId
    );
  }

  public getConnectedDevice(orgId: UUID, deviceId: UUID): ConnectedDeviceRecord | undefined {
    const validOrgId = this.assertValidOrganizationId(orgId);
    const dev = this.connectedDevices.get(deviceId);
    if (!dev || dev.organizationId !== validOrgId) return undefined;
    return dev;
  }

  public saveConnectedDevice(
    orgIdOrDevice: UUID | ConnectedDeviceRecord,
    maybeDevice?: ConnectedDeviceRecord
  ): ConnectedDeviceRecord {
    const device = this.resolveScopedRecord(orgIdOrDevice, maybeDevice, 'ConnectedDevice');
    const normalizedInput: ConnectedDeviceRecord = {
      ...device,
      id: (device.id || device.deviceId || '').trim(),
      deviceId: (device.deviceId || device.id || '').trim(),
    };
    const { id, orgId } = this.assertRecordIdAndTenant(
      normalizedInput,
      this.connectedDevices,
      'ConnectedDevice'
    );
    const normalized: ConnectedDeviceRecord = {
      ...normalizedInput,
      id,
      deviceId: normalizedInput.deviceId || id,
      organizationId: orgId,
    };
    this.connectedDevices.set(id, normalized);
    this.schedulePersist();
    return normalized;
  }

  public getCrossDeviceSyncEvents(orgId: UUID): CrossDeviceSyncEventRecord[] {
    const validOrgId = this.assertValidOrganizationId(orgId);
    return Array.from(this.crossDeviceSyncEvents.values())
      .filter((e) => e.organizationId === validOrgId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public saveCrossDeviceSyncEvent(
    orgIdOrEvent: UUID | CrossDeviceSyncEventRecord,
    maybeEvent?: CrossDeviceSyncEventRecord
  ): CrossDeviceSyncEventRecord {
    const event = this.resolveScopedRecord(orgIdOrEvent, maybeEvent, 'CrossDeviceSyncEvent');
    const normalizedInput: CrossDeviceSyncEventRecord = {
      ...event,
      id: (event.id || event.syncId || '').trim(),
      syncId: (event.syncId || event.id || '').trim(),
    };
    const { id, orgId } = this.assertRecordIdAndTenant(
      normalizedInput,
      this.crossDeviceSyncEvents,
      'CrossDeviceSyncEvent'
    );
    const normalized: CrossDeviceSyncEventRecord = {
      ...normalizedInput,
      id,
      syncId: normalizedInput.syncId || id,
      organizationId: orgId,
    };
    this.crossDeviceSyncEvents.set(id, normalized);
    this.schedulePersist();
    return normalized;
  }

  /**
   * Purges operational records belonging to a specific organization (used for isolated test tenant cleanup).
   */
  public purgeOrganizationData(orgId: UUID): void {
    const maps: Array<Map<UUID, any>> = [
      this.customers,
      this.conversations,
      this.messages,
      this.calls,
      this.tickets,
      this.slaPolicies,
      this.knowledgeDocuments,
      this.qaRubrics,
      this.qaEvaluations,
      this.automationRules,
      this.shifts,
      this.channelConfigs,
      this.recommendations,
      this.coachingPlans,
      this.macros,
      this.teamQaFeedback,
      this.connectedDevices,
      this.crossDeviceSyncEvents,
    ];
    for (const map of maps) {
      for (const [key, val] of map.entries()) {
        if (val && val.organizationId === orgId) {
          map.delete(key);
        }
      }
    }
  }

  // ----------------------------------------------------
  // Disk Persistence & Backup Engine (Stored in OS Temp Dir to keep Git Workspace 100% clean)
  // NOTE: /tmp/omniflow-data/db_state.json is local runtime file persistence, NOT durable cloud infrastructure storage.
  // ----------------------------------------------------

  public schedulePersist(delayMs = 300): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.saveToDisk();
      this.persistTimer = null;
    }, delayMs);
    this.persistTimer.unref?.();
  }

  private sanitizeChannelConfigsForExport(records: ChannelConfigRecord[]): ChannelConfigRecord[] {
    return records.map((rec) => ({
      ...rec,
      config: redactSensitiveValue({ ...(rec.config || {}) }) as Record<string, any>,
    }));
  }

  public exportFullBackup(): Record<string, any> {
    return {
      version: '1.2.0-enterprise-p1-2',
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
      channelConfigs: this.sanitizeChannelConfigsForExport(Array.from(this.channelConfigs.values())),
      recommendations: Array.from(this.recommendations.values()),
      coachingPlans: Array.from(this.coachingPlans.values()),
      macros: Array.from(this.macros.values()),
      teamQaFeedback: Array.from(this.teamQaFeedback.values()),
      connectedDevices: Array.from(this.connectedDevices.values()),
      crossDeviceSyncEvents: Array.from(this.crossDeviceSyncEvents.values()),
      auditEvents: AuditLogger.exportAllEvents(),
    };
  }

  /**
   * Exports a strictly tenant-isolated backup containing ONLY records owned by `orgId`.
   * Channel secrets are redacted (`[REDACTED_SECRET]`) in the exported backup representation.
   */
  public exportTenantBackup(orgId: UUID): Record<string, any> {
    const validOrgId = this.assertValidOrganizationId(orgId);
    const orgCustomerIds = new Set(
      Array.from(this.customers.values())
        .filter((c) => c.organizationId === validOrgId)
        .map((c) => c.id)
    );
    return {
      version: '1.2.0-enterprise-p1-2',
      exportedAt: new Date().toISOString(),
      scopeOrganizationId: validOrgId,
      organizations: Array.from(this.organizations.values()).filter((o) => o.id === validOrgId),
      users: Array.from(this.users.values()).filter((u) => u.organizationId === validOrgId),
      teams: Array.from(this.teams.values()).filter((t) => t.organizationId === validOrgId),
      agents: Array.from(this.agents.values()).filter((a) => a.organizationId === validOrgId),
      customers: Array.from(this.customers.values()).filter((c) => c.organizationId === validOrgId),
      customerChannels: Array.from(this.customerChannels.values()).filter((ch) =>
        orgCustomerIds.has(ch.customerId)
      ),
      conversations: Array.from(this.conversations.values()).filter((c) => c.organizationId === validOrgId),
      messages: Array.from(this.messages.values()).filter((m) => m.organizationId === validOrgId),
      calls: Array.from(this.calls.values()).filter((c) => c.organizationId === validOrgId),
      tickets: Array.from(this.tickets.values()).filter((t) => t.organizationId === validOrgId),
      slaPolicies: Array.from(this.slaPolicies.values()).filter((s) => s.organizationId === validOrgId),
      knowledgeDocuments: Array.from(this.knowledgeDocuments.values()).filter(
        (k) => k.organizationId === validOrgId
      ),
      qaRubrics: Array.from(this.qaRubrics.values()).filter((q) => q.organizationId === validOrgId),
      qaEvaluations: Array.from(this.qaEvaluations.values()).filter((e) => e.organizationId === validOrgId),
      automationRules: Array.from(this.automationRules.values()).filter(
        (r) => r.organizationId === validOrgId
      ),
      shifts: Array.from(this.shifts.values()).filter((s) => s.organizationId === validOrgId),
      channelConfigs: this.sanitizeChannelConfigsForExport(
        Array.from(this.channelConfigs.values()).filter((c) => c.organizationId === validOrgId)
      ),
      recommendations: Array.from(this.recommendations.values()).filter(
        (r) => r.organizationId === validOrgId
      ),
      coachingPlans: Array.from(this.coachingPlans.values()).filter(
        (p) => p.organizationId === validOrgId
      ),
      macros: Array.from(this.macros.values()).filter((m) => m.organizationId === validOrgId),
      teamQaFeedback: Array.from(this.teamQaFeedback.values()).filter(
        (f) => f.organizationId === validOrgId
      ),
      connectedDevices: Array.from(this.connectedDevices.values()).filter(
        (d) => d.organizationId === validOrgId
      ),
      crossDeviceSyncEvents: Array.from(this.crossDeviceSyncEvents.values()).filter(
        (e) => e.organizationId === validOrgId
      ),
      auditEvents: AuditLogger.exportAllEvents().filter((e) => e.organizationId === validOrgId),
    };
  }

  /**
   * Builds the operational on-disk persistence payload where every secret field in `channelConfigs`
   * is encrypted using AES-256-GCM bound to `AAD = "${organizationId}:${channelId}"` and immediately
   * verified via trial decryption before disk write.
   */
  private buildEncryptedDiskSnapshot(): Record<string, any> {
    const encryptedChannelConfigs: ChannelConfigRecord[] = [];
    for (const rec of this.channelConfigs.values()) {
      const inspection = inspectDiskChannelConfigSecrets(rec.config);
      if (inspection.hasLegacyPlaintextSecrets || inspection.hasEncryptedSecrets) {
        const keyCheck = validateChannelEncryptionKey();
        if (!keyCheck.valid) {
          throw Object.assign(new Error(keyCheck.reason || 'Encryption key validation failed'), {
            status: 503,
            code: keyCheck.code || 'CHANNEL_SECRET_KEY_MISSING',
          });
        }
        const encryptedConfig = encryptChannelConfigForDisk(
          rec.config,
          rec.organizationId,
          rec.channelId
        );
        encryptedChannelConfigs.push({
          ...rec,
          config: encryptedConfig,
        });
      } else {
        encryptedChannelConfigs.push({
          ...rec,
          config: { ...(rec.config || {}) },
        });
      }
    }

    return {
      version: '1.2.0-enterprise-p1-2',
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
      channelConfigs: encryptedChannelConfigs,
      recommendations: Array.from(this.recommendations.values()),
      coachingPlans: Array.from(this.coachingPlans.values()),
      macros: Array.from(this.macros.values()),
      teamQaFeedback: Array.from(this.teamQaFeedback.values()),
      connectedDevices: Array.from(this.connectedDevices.values()),
      crossDeviceSyncEvents: Array.from(this.crossDeviceSyncEvents.values()),
      auditEvents: AuditLogger.exportAllEvents(),
    };
  }

  public saveToDisk(): boolean {
    if (this.existingFileProtected) {
      if (!fs.existsSync(this.persistFilePath)) {
        this.existingFileProtected = false;
        this.existingFileProtectionReason = 'NONE';
      } else {
        this.recordStorageError(
          'saveToDisk',
          'DISK_OVERWRITE_BLOCKED_UNMIGRATED_FILE',
          'Refusing to overwrite existing persistence file because a previous load or secret migration failed. Fix CHANNEL_SECRET_ENCRYPTION_KEY or file integrity first.'
        );
        return false;
      }
    }

    const tmpPath = `${this.persistFilePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      const dir = path.dirname(this.persistFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const diskSnapshot = this.buildEncryptedDiskSnapshot();
      const serialized = JSON.stringify(diskSnapshot, null, 2);
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
    } catch (err: any) {
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // ignore cleanup error
      }
      const errCode =
        typeof err?.code === 'string' &&
        (err.code.startsWith('CHANNEL_SECRET_') ||
          err.code.startsWith('INVALID_') ||
          err.code === 'AUTH_TAG_MISMATCH' ||
          err.code === 'ENCRYPTION_VERIFICATION_FAILED')
          ? err.code
          : 'DISK_PERSISTENCE_WRITE_FAILED';
      this.recordStorageError('saveToDisk', errCode, err);
      console.error('[Storage Error] Failed to persist database state to disk:', sanitizeStorageDiagnosticMessage(err));
      return false;
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(this.persistFilePath)) {
        this.existingFileProtected = false;
        this.existingFileProtectionReason = 'NONE';
        this.recordStorageError('loadFromDisk', 'DISK_FILE_NOT_FOUND', `Persistence file not found at ${this.persistFilePath}`);
        return false;
      }

      const content = fs.readFileSync(this.persistFilePath, 'utf-8');
      if (!content || content.trim().length === 0) {
        this.existingFileProtected = true;
        this.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY';
        this.recordStorageError('loadFromDisk', 'DISK_FILE_EMPTY', 'Persistence file is empty');
        return false;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        this.existingFileProtected = true;
        this.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY';
        this.recordStorageError('loadFromDisk', 'DISK_PERSISTENCE_READ_FAILED', parseErr);
        console.error('[Storage Error] Corrupted JSON in persistence file:', sanitizeStorageDiagnosticMessage(parseErr));
        return false;
      }

      if (!parsed || !Array.isArray(parsed.organizations) || parsed.organizations.length === 0) {
        this.existingFileProtected = true;
        this.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY';
        this.recordStorageError('loadFromDisk', 'DISK_LOAD_INVALID_SCHEMA', 'Parsed JSON missing valid organizations array');
        return false;
      }

      // Inspect channelConfigs on disk for encrypted envelopes or legacy plain-text secrets
      let hasEncryptedSecrets = false;
      let hasLegacyPlaintextSecrets = false;
      if (Array.isArray(parsed.channelConfigs)) {
        for (const rec of parsed.channelConfigs) {
          if (!rec || typeof rec !== 'object') continue;
          const inspection = inspectDiskChannelConfigSecrets(rec.config);
          if (inspection.hasEncryptedSecrets) hasEncryptedSecrets = true;
          if (inspection.hasLegacyPlaintextSecrets) hasLegacyPlaintextSecrets = true;
        }
      }

      if (hasEncryptedSecrets || hasLegacyPlaintextSecrets) {
        const keyCheck = validateChannelEncryptionKey();
        if (!keyCheck.valid) {
          this.existingFileProtected = true;
          this.existingFileProtectionReason = 'SECRET_KEY_PROTECTED';
          const contextMsg = hasLegacyPlaintextSecrets
            ? `Legacy plain-text channel secrets detected in persistence file, but migration cannot proceed: ${keyCheck.reason} Recovery: configure a valid 64-character lowercase hex CHANNEL_SECRET_ENCRYPTION_KEY and reload.`
            : `Encrypted channel secrets in persistence file cannot be decrypted: ${keyCheck.reason} Recovery: configure the matching 64-character lowercase hex CHANNEL_SECRET_ENCRYPTION_KEY and reload.`;
          this.recordStorageError(
            'loadFromDisk',
            keyCheck.code || 'CHANNEL_SECRET_KEY_MISSING',
            contextMsg
          );
          console.error('[Storage Error]', sanitizeStorageDiagnosticMessage(contextMsg));
          return false;
        }
      }

      // Snapshot current in-memory state in case automatic legacy migration write fails
      const collectionKeys = [
        'organizations',
        'users',
        'teams',
        'agents',
        'customers',
        'customerChannels',
        'conversations',
        'messages',
        'calls',
        'tickets',
        'slaPolicies',
        'knowledgeDocuments',
        'qaRubrics',
        'qaEvaluations',
        'automationRules',
        'shifts',
        'channelConfigs',
        'recommendations',
        'coachingPlans',
        'macros',
        'teamQaFeedback',
        'connectedDevices',
        'crossDeviceSyncEvents',
      ];
      const preLoadSnapshots: Record<string, Map<UUID, any>> = {};
      for (const k of collectionKeys) {
        const liveMap: Map<UUID, any> = (this as any)[k];
        preLoadSnapshots[k] = new Map(liveMap.entries());
      }
      const preLoadAuditEvents = AuditLogger.exportAllEvents();

      const importRes = this.importFullBackupDetailed(parsed, {
        persistToDisk: false,
        isDiskLoad: true,
      });
      if (!importRes.ok) {
        this.existingFileProtected = true;
        this.existingFileProtectionReason =
          importRes.code === 'AUTH_TAG_MISMATCH' ||
          importRes.code.startsWith('CHANNEL_SECRET_') ||
          importRes.code.startsWith('INVALID_')
            ? 'SECRET_KEY_PROTECTED'
            : 'CORRUPTED_OR_EMPTY';
        this.recordStorageError('loadFromDisk', importRes.code, importRes.message);
        return false;
      }

      // Automatic Migration (Section 4): If legacy plain-text secrets were loaded from disk with a valid key,
      // immediately migrate them to AES-256-GCM encrypted format via atomic saveToDisk().
      // If the migration disk write fails, roll back memory and keep the original file untouched.
      if (hasLegacyPlaintextSecrets) {
        this.existingFileProtected = false;
        this.existingFileProtectionReason = 'NONE';
        const migrated = this.saveToDisk();
        if (!migrated) {
          for (const k of collectionKeys) {
            const targetMap: Map<UUID, any> = (this as any)[k];
            const prevMap = preLoadSnapshots[k];
            targetMap.clear();
            for (const [id, val] of prevMap.entries()) {
              targetMap.set(id, val);
            }
          }
          AuditLogger.importEvents(preLoadAuditEvents);
          this.existingFileProtected = true;
          this.existingFileProtectionReason = 'SECRET_KEY_PROTECTED';
          const prevErr = this.getLastStorageError();
          this.recordStorageError(
            'loadFromDisk',
            prevErr?.code || 'DISK_SECRET_MIGRATION_WRITE_FAILED',
            `Automatic migration of legacy plain-text secrets to encrypted disk format failed (${prevErr?.message || 'write error'}). Original file and pre-load memory state preserved.`
          );
          return false;
        }
        console.log('[Storage] Automatically migrated legacy plain-text channel secrets to AES-256-GCM encrypted disk format.');
      }

      this.existingFileProtected = false;
      this.existingFileProtectionReason = 'NONE';
      console.log(`[Storage] Successfully restored enterprise database from persistent storage (${parsed.exportedAt || 'saved state'}).`);
      return true;
    } catch (err: any) {
      this.existingFileProtected = true;
      this.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY';
      const errCode = typeof err?.code === 'string' ? err.code : 'DISK_LOAD_FAILED';
      this.recordStorageError('loadFromDisk', errCode, err);
      console.error('[Storage Error] Failed to load database state from disk:', sanitizeStorageDiagnosticMessage(err));
      return false;
    }
  }

  /**
   * Strictly transactional, all-or-nothing backup restoration.
   * Validates all collections, primary keys, tenant foreign keys (never assigning a default org),
   * channel secret integrity/preservation rules (Section 5), and AuditLogger hash chain in staging memory
   * BEFORE mutating any live Map.
   * Guarantees zero partial state corruption on failure (including disk write rollback when persistToDisk=true).
   */
  public importFullBackupDetailed(
    data: any,
    options?: { scopeOrgId?: UUID; persistToDisk?: boolean; isDiskLoad?: boolean }
  ): BackupImportResult {
    if (!data || typeof data !== 'object') {
      this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', 'Backup payload is not a valid object');
      return {
        ok: false,
        status: 400,
        code: 'CORRUPTED_BACKUP_PAYLOAD',
        message: 'Invalid backup payload structure.',
      };
    }
    if (!Array.isArray(data.organizations) || data.organizations.length === 0) {
      this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', 'Backup payload missing non-empty organizations array');
      return {
        ok: false,
        status: 400,
        code: 'CORRUPTED_BACKUP_PAYLOAD',
        message: 'Backup payload must contain at least one valid organization.',
      };
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
      { key: 'channelConfigs', requireOrgId: true },
      { key: 'recommendations', requireOrgId: true },
      { key: 'coachingPlans', requireOrgId: true },
      { key: 'macros', requireOrgId: true },
      { key: 'teamQaFeedback', requireOrgId: true },
      { key: 'connectedDevices', requireOrgId: true },
      { key: 'crossDeviceSyncEvents', requireOrgId: true },
    ];

    const stagedMaps: Record<string, Map<UUID, any>> = {};
    const scopeOrgId = options?.scopeOrgId?.trim();
    const unconfiguredChannels: string[] = [];

    try {
      // 1. Validate organizations first so we can enforce referential organizationId membership
      const orgMap = new Map<UUID, any>();
      for (const org of data.organizations) {
        if (!org || typeof org !== 'object' || typeof org.id !== 'string' || org.id.trim().length === 0) {
          this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', 'Organization record missing valid id');
          return {
            ok: false,
            status: 400,
            code: 'CORRUPTED_BACKUP_PAYLOAD',
            message: 'Backup validation failed: invalid organization record.',
          };
        }
        orgMap.set(org.id.trim(), org);
      }
      stagedMaps['organizations'] = orgMap;

      // Known organizations for referential integrity (staged organizations + existing organizations)
      const knownOrgIds = new Set<string>([
        ...Array.from(orgMap.keys()),
        ...Array.from(this.organizations.keys()),
      ]);

      // 2. Pass 1: Structural & Referential Integrity Validation across ALL collections (HTTP 400 on malformed/corrupted records)
      for (const spec of collectionSpecs) {
        if (spec.key === 'organizations') continue;
        const rawList = data[spec.key];
        if (rawList === undefined) continue;
        if (!Array.isArray(rawList)) {
          this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', `Collection ${spec.key} is not an array`);
          return {
            ok: false,
            status: 400,
            code: 'CORRUPTED_BACKUP_PAYLOAD',
            message: `Backup validation failed: collection [${spec.key}] must be an array.`,
          };
        }
        const map = new Map<UUID, any>();
        for (const item of rawList) {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.trim().length === 0) {
            this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', `Record in ${spec.key} missing valid id`);
            return {
              ok: false,
              status: 400,
              code: 'CORRUPTED_BACKUP_PAYLOAD',
              message: `Backup validation failed: record in [${spec.key}] is missing a valid id.`,
            };
          }
          if (spec.requireOrgId) {
            if (
              typeof item.organizationId !== 'string' ||
              item.organizationId.trim().length === 0 ||
              item.organizationId.trim() === 'unauthenticated'
            ) {
              this.recordStorageError(
                'importFullBackup',
                'MISSING_ORGANIZATION_ID',
                `Record ${item.id} in ${spec.key} missing valid organizationId`
              );
              return {
                ok: false,
                status: 400,
                code: 'CORRUPTED_BACKUP_PAYLOAD',
                message: `Backup validation failed: record [${item.id}] in [${spec.key}] is missing a valid organizationId.`,
              };
            }
            const itemOrgId = item.organizationId.trim();
            if (!knownOrgIds.has(itemOrgId)) {
              this.recordStorageError(
                'importFullBackup',
                'UNREGISTERED_ORGANIZATION_ID',
                `Record ${item.id} in ${spec.key} references unregistered organizationId ${itemOrgId}`
              );
              return {
                ok: false,
                status: 400,
                code: 'UNREGISTERED_ORGANIZATION_ID',
                message: `Backup validation failed: record [${item.id}] in [${spec.key}] references unregistered organization [${itemOrgId}]. Automatic migration to a default tenant is forbidden.`,
              };
            }
          }

          if (spec.key === 'channelConfigs') {
            const itemOrgId = item.organizationId.trim();
            const itemChannelId = typeof item.channelId === 'string' ? item.channelId.trim() : '';
            if (!itemChannelId) {
              this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', `ChannelConfig ${item.id} missing valid channelId`);
              return {
                ok: false,
                status: 400,
                code: 'CORRUPTED_BACKUP_PAYLOAD',
                message: `Backup validation failed: channelConfigs record [${item.id}] is missing a valid channelId.`,
              };
            }
            const canonicalId = `${itemOrgId}::${itemChannelId}`;
            if (item.id.trim() !== canonicalId) {
              this.recordStorageError(
                'importFullBackup',
                'CORRUPTED_BACKUP_PAYLOAD',
                `ChannelConfig id [${item.id}] does not match composite context [${canonicalId}]`
              );
              return {
                ok: false,
                status: 400,
                code: 'CORRUPTED_BACKUP_PAYLOAD',
                message: `Backup validation failed: channelConfigs record id [${item.id}] does not match [${canonicalId}].`,
              };
            }

            // Look up existing in-memory config strictly for the exact same (organizationId, channelId)
            const existingRec = !options?.isDiskLoad ? this.channelConfigs.get(canonicalId) : undefined;
            const existingSameScopeConfig =
              existingRec &&
              existingRec.organizationId === itemOrgId &&
              existingRec.channelId === itemChannelId &&
              existingRec.config &&
              typeof existingRec.config === 'object'
                ? existingRec.config
                : {};

            const rawConfig = item.config && typeof item.config === 'object' ? item.config : {};
            const reconciledConfig: Record<string, any> = {};
            let hasActiveSecret = false;
            let hadRedactedOrMissingSecret = false;

            for (const [k, v] of Object.entries(rawConfig)) {
              if (k === 'organizationId') continue;
              if (isEncryptedSecretEnvelope(v)) {
                // Decrypt and verify GCM AuthTag + AAD = "${itemOrgId}:${itemChannelId}"
                const decrypted = decryptSecretValue(v, itemOrgId, itemChannelId);
                reconciledConfig[k] = decrypted;
                hasActiveSecret = true;
              } else if (isChannelSecretField(k)) {
                if (v === '[REDACTED_SECRET]' || v === undefined || v === null || v === '') {
                  const prevVal = existingSameScopeConfig[k];
                  if (typeof prevVal === 'string' && prevVal.length > 0 && prevVal !== '[REDACTED_SECRET]') {
                    reconciledConfig[k] = prevVal;
                    hasActiveSecret = true;
                  } else {
                    hadRedactedOrMissingSecret = true;
                  }
                } else if (typeof v === 'string') {
                  reconciledConfig[k] = v;
                  hasActiveSecret = true;
                }
              } else {
                reconciledConfig[k] = v;
              }
            }

            // Preserve any existing secret fields for the exact same (itemOrgId, itemChannelId) that were omitted/deleted from rawConfig (AT-08)
            for (const [existingKey, existingVal] of Object.entries(existingSameScopeConfig)) {
              if (
                isChannelSecretField(existingKey) &&
                !(existingKey in reconciledConfig) &&
                typeof existingVal === 'string' &&
                existingVal.length > 0 &&
                existingVal !== '[REDACTED_SECRET]'
              ) {
                reconciledConfig[existingKey] = existingVal;
                hasActiveSecret = true;
              }
            }

            const requiresCredentials =
              hadRedactedOrMissingSecret ||
              ['chan-whatsapp', 'chan-voice', 'chan-messenger'].includes(itemChannelId);

            if (!hasActiveSecret && requiresCredentials && !options?.isDiskLoad) {
              reconciledConfig.credentialsConfigured = false;
              reconciledConfig.verified = false;
              unconfiguredChannels.push(itemChannelId);
            } else if (hasActiveSecret) {
              reconciledConfig.credentialsConfigured = true;
              reconciledConfig.verified = reconciledConfig.verified ?? true;
            }

            map.set(canonicalId, {
              ...item,
              id: canonicalId,
              organizationId: itemOrgId,
              channelId: itemChannelId,
              config: reconciledConfig,
            });
          } else {
            map.set(item.id.trim(), item);
          }
        }
        stagedMaps[spec.key] = map;
      }

      // 3. Pass 2: Tenant-Scope Authorization (HTTP 403 if authenticated tenant attempts to restore another tenant's data)
      if (scopeOrgId) {
        for (const orgId of orgMap.keys()) {
          if (orgId !== scopeOrgId) {
            this.recordStorageError(
              'importFullBackup',
              'CROSS_TENANT_RESTORE_FORBIDDEN',
              `Tenant ${scopeOrgId} attempted to restore organization ${orgId}`
            );
            return {
              ok: false,
              status: 403,
              code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
              message: `Cross-tenant restore forbidden: cannot restore organization [${orgId}] from session [${scopeOrgId}].`,
            };
          }
        }
        for (const spec of collectionSpecs) {
          if (spec.key === 'organizations' || !spec.requireOrgId) continue;
          const map = stagedMaps[spec.key];
          if (!map) continue;
          for (const item of map.values()) {
            const itemOrgId = item.organizationId.trim();
            if (itemOrgId !== scopeOrgId) {
              this.recordStorageError(
                'importFullBackup',
                'CROSS_TENANT_RESTORE_FORBIDDEN',
                `Tenant ${scopeOrgId} attempted to restore record ${item.id} in ${spec.key} belonging to ${itemOrgId}`
              );
              return {
                ok: false,
                status: 403,
                code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
                message: `Cross-tenant restore forbidden: record [${item.id}] in [${spec.key}] belongs to another organization.`,
              };
            }
          }
        }
      }

      // 4. Validate auditEvents hash chain integrity prior to committing any changes
      let stagedAuditEvents: AuditEvent[] | null = null;
      if (data.auditEvents !== undefined) {
        if (!Array.isArray(data.auditEvents)) {
          this.recordStorageError('importFullBackup', 'CORRUPTED_BACKUP_PAYLOAD', 'auditEvents is not an array');
          return {
            ok: false,
            status: 400,
            code: 'CORRUPTED_BACKUP_PAYLOAD',
            message: 'Backup validation failed: auditEvents must be an array.',
          };
        }
        if (scopeOrgId) {
          for (const evt of data.auditEvents) {
            if (!evt || evt.organizationId !== scopeOrgId) {
              this.recordStorageError(
                'importFullBackup',
                'CROSS_TENANT_RESTORE_FORBIDDEN',
                `Tenant ${scopeOrgId} attempted to restore auditEvents for another organization`
              );
              return {
                ok: false,
                status: 403,
                code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
                message: 'Cross-tenant restore forbidden in auditEvents.',
              };
            }
          }
        }
        if (data.auditEvents.length > 0 && !scopeOrgId) {
          const chainCheck = AuditLogger.verifyChainIntegrity(data.auditEvents);
          if (!chainCheck.valid) {
            this.recordStorageError(
              'importFullBackup',
              'TAMPERED_AUDIT_CHAIN',
              chainCheck.failureReason || 'Invalid audit hash chain'
            );
            return {
              ok: false,
              status: 400,
              code: 'TAMPERED_AUDIT_CHAIN',
              message: `Audit chain integrity verification failed: ${chainCheck.failureReason || 'Invalid hash chain'}`,
            };
          }
        }
        stagedAuditEvents = data.auditEvents;
      }

      // 5. Snapshot current live maps in case persistToDisk fails and requires atomic rollback
      const preCommitSnapshots: Record<string, Map<UUID, any>> = {};
      for (const spec of collectionSpecs) {
        const liveMap: Map<UUID, any> = (this as any)[spec.key];
        preCommitSnapshots[spec.key] = new Map(liveMap.entries());
      }
      const preCommitAuditEvents = AuditLogger.exportAllEvents();

      // 6. Atomic commit: swap staged maps into live DatabaseStore
      for (const spec of collectionSpecs) {
        const staged = stagedMaps[spec.key];
        if (!staged) continue;
        const targetMap: Map<UUID, any> = (this as any)[spec.key];
        if (scopeOrgId) {
          // Scoped tenant restore: replace only records belonging to scopeOrgId, preserving other tenants
          if (spec.key === 'organizations') {
            for (const [k, v] of staged.entries()) {
              targetMap.set(k, v);
            }
          } else if (spec.requireOrgId) {
            for (const [k, existingVal] of targetMap.entries()) {
              if (existingVal && existingVal.organizationId === scopeOrgId) {
                targetMap.delete(k);
              }
            }
            for (const [k, v] of staged.entries()) {
              targetMap.set(k, v);
            }
          } else {
            for (const [k, v] of staged.entries()) {
              targetMap.set(k, v);
            }
          }
        } else {
          // Full store restore (used by loadFromDisk and full system restore)
          targetMap.clear();
          for (const [k, v] of staged.entries()) {
            targetMap.set(k, v);
          }
        }
      }

      if (stagedAuditEvents !== null && !scopeOrgId) {
        AuditLogger.importEvents(stagedAuditEvents);
      }

      if (options?.persistToDisk) {
        const wasCorruptProtected =
          this.existingFileProtected && this.existingFileProtectionReason === 'CORRUPTED_OR_EMPTY';
        if (wasCorruptProtected) {
          this.existingFileProtected = false;
          this.existingFileProtectionReason = 'NONE';
        }
        const saved = this.saveToDisk();
        if (!saved) {
          if (wasCorruptProtected) {
            this.existingFileProtected = true;
            this.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY';
          }
          // Roll back in-memory state if disk write fails!
          for (const spec of collectionSpecs) {
            const targetMap: Map<UUID, any> = (this as any)[spec.key];
            const prevMap = preCommitSnapshots[spec.key];
            targetMap.clear();
            for (const [k, v] of prevMap.entries()) {
              targetMap.set(k, v);
            }
          }
          AuditLogger.importEvents(preCommitAuditEvents);
          const diskErr = this.getLastStorageError();
          return {
            ok: false,
            status: 500,
            code: diskErr?.code || 'DISK_PERSISTENCE_WRITE_FAILED',
            message: 'Failed to persist restored state to disk; in-memory state rolled back atomically.',
          };
        }
      }

      const unconfiguredNotice =
        unconfiguredChannels.length > 0
          ? ` (Non-secret settings restored; credentials must be entered independently for: ${unconfiguredChannels.join(', ')})`
          : '';

      return {
        ok: true,
        status: 200,
        code: 'RESTORED',
        message: `Database state restored successfully${unconfiguredNotice}`,
        unconfiguredChannels: unconfiguredChannels.length > 0 ? unconfiguredChannels : undefined,
      };
    } catch (err: any) {
      const errCode = typeof err?.code === 'string' ? err.code : 'CORRUPTED_BACKUP_PAYLOAD';
      const errStatus = typeof err?.status === 'number' ? err.status : 400;
      this.recordStorageError('importFullBackup', errCode, err);
      console.error('[Storage Error] Atomic importFullBackup aborted due to error:', sanitizeStorageDiagnosticMessage(err));
      return {
        ok: false,
        status: errStatus,
        code: errCode,
        message: sanitizeStorageDiagnosticMessage(err),
      };
    }
  }

  public importFullBackup(data: any): boolean {
    return this.importFullBackupDetailed(data).ok;
  }
}

export const db = new DatabaseStore();
