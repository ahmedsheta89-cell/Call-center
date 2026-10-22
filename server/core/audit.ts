/**
 * @file server/core/audit.ts
 * Immutable Audit Logging Engine for Enterprise Compliance
 * Enforces PII/Secret Redaction, Object.freeze Immutability, and SHA-256 Hash Chaining
 */

import crypto from 'crypto';
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

const SENSITIVE_KEY_PATTERN = /password|secret|token|apikey|api_key|authorization|privatekey|creditcard|cvv/i;
const CARD_NUMBER_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;

export function redactSensitiveValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return val.replace(CARD_NUMBER_REGEX, '[REDACTED_CARD]');
  }
  if (Array.isArray(val)) {
    return val.map(redactSensitiveValue);
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED_SECRET]';
      } else {
        out[k] = redactSensitiveValue(v);
      }
    }
    return out;
  }
  return val;
}

export class AuditLogger {
  private static inMemoryStore: AuditEvent[] = [];

  public static async log(params: AuditParams): Promise<AuditEvent> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const prevEvent = this.inMemoryStore[0];
    const prevHash = prevEvent?.integrityHash || '0000000000000000000000000000000000000000000000000000000000000000';

    const sanitizedBefore = params.beforeState
      ? (redactSensitiveValue(JSON.parse(JSON.stringify(params.beforeState))) as Record<string, unknown>)
      : undefined;
    const sanitizedAfter = params.afterState
      ? (redactSensitiveValue(JSON.parse(JSON.stringify(params.afterState))) as Record<string, unknown>)
      : undefined;

    const canonicalPayload = JSON.stringify({
      id,
      organizationId: params.organizationId,
      actorId: params.actorId || 'anonymous',
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: sanitizedBefore,
      afterState: sanitizedAfter,
      prevHash,
      createdAt,
    });

    const integrityHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

    const event: AuditEvent = Object.freeze({
      id,
      organizationId: params.organizationId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: sanitizedBefore ? Object.freeze(sanitizedBefore) : undefined,
      afterState: sanitizedAfter ? Object.freeze(sanitizedAfter) : undefined,
      ipAddress: params.ipAddress || '127.0.0.1',
      userAgent: params.userAgent || 'system',
      requestId: params.requestId || crypto.randomUUID(),
      reason: params.reason,
      prevHash,
      integrityHash,
      createdAt,
    });

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

  public static exportAllEvents(): AuditEvent[] {
    return [...this.inMemoryStore];
  }

  public static importEvents(events: AuditEvent[]): void {
    if (!Array.isArray(events)) return;
    this.inMemoryStore = events.map((ev) => Object.freeze({ ...ev }));
  }

  public static computeEventHash(ev: {
    id: string;
    organizationId: string;
    actorId?: string;
    actorType: string;
    action: string;
    entityType: string;
    entityId: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    prevHash?: string;
    createdAt: string;
  }): string {
    const canonicalPayload = JSON.stringify({
      id: ev.id,
      organizationId: ev.organizationId,
      actorId: ev.actorId || 'anonymous',
      actorType: ev.actorType,
      action: ev.action,
      entityType: ev.entityType,
      entityId: ev.entityId,
      beforeState: ev.beforeState,
      afterState: ev.afterState,
      prevHash: ev.prevHash || '0000000000000000000000000000000000000000000000000000000000000000',
      createdAt: ev.createdAt,
    });
    return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
  }

  public static verifyChainIntegrity(candidateEvents?: AuditEvent[]): {
    valid: boolean;
    checkedCount: number;
    failureReason?: string;
  } {
    const source = candidateEvents ? [...candidateEvents] : [...this.inMemoryStore];
    const events = source.reverse();
    let expectedPrev = '0000000000000000000000000000000000000000000000000000000000000000';
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || typeof ev.integrityHash !== 'string' || ev.integrityHash.length !== 64 || typeof ev.prevHash !== 'string' || ev.prevHash.length !== 64) {
        return { valid: false, checkedCount: i, failureReason: `Missing or malformed hash at index ${i}` };
      }
      if (i > 0 && ev.prevHash !== expectedPrev) {
        return { valid: false, checkedCount: i, failureReason: `Broken prevHash chain link at index ${i}` };
      }
      const recomputed = this.computeEventHash(ev);
      if (recomputed !== ev.integrityHash) {
        return { valid: false, checkedCount: i, failureReason: `Payload integrityHash mismatch at index ${i}` };
      }
      expectedPrev = ev.integrityHash;
    }
    return { valid: true, checkedCount: events.length };
  }
}

