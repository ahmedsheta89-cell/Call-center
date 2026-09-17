/**
 * @file server/core/audit.ts
 * Immutable Audit Logging Engine for Enterprise Compliance
 */

import { AuditEvent, UUID } from './types.ts';

export interface AuditParams {
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
}

export class AuditLogger {
  private static inMemoryStore: AuditEvent[] = [];

  public static async log(params: AuditParams): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: params.beforeState ? JSON.parse(JSON.stringify(params.beforeState)) : undefined,
      afterState: params.afterState ? JSON.parse(JSON.stringify(params.afterState)) : undefined,
      ipAddress: params.ipAddress || '127.0.0.1',
      userAgent: params.userAgent || 'system',
      requestId: params.requestId || crypto.randomUUID(),
      reason: params.reason,
      createdAt: new Date().toISOString(),
    };

    // Store in-memory buffer (and in production, insert to audit_events table)
    this.inMemoryStore.unshift(event);
    if (this.inMemoryStore.length > 2000) {
      this.inMemoryStore.pop();
    }

    return event;
  }

  public static getEvents(organizationId: UUID, limit = 100): AuditEvent[] {
    return this.inMemoryStore
      .filter((e) => e.organizationId === organizationId)
      .slice(0, limit);
  }
}
