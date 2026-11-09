/**
 * @file server/core/rbac.ts
 * Enterprise Role-Based Access Control (RBAC) Engine
 */

export const SYSTEM_PERMISSIONS = [
  // Customer Permissions
  'customer.read',
  'customer.create',
  'customer.update',
  'customer.delete',

  // Conversation Permissions
  'conversation.read',
  'conversation.reply',
  'conversation.assign',
  'conversation.close',
  'conversation.export',

  // Call & Voice Permissions
  'call.read',
  'call.make',
  'call.recording.read',
  'call.monitor',
  'call.whisper_barge',

  // Ticket & SLA Permissions
  'ticket.read',
  'ticket.create',
  'ticket.update',
  'ticket.assign',
  'ticket.escalate',
  'ticket.delete',

  // QA & Coaching
  'qa.evaluate',
  'qa.approve',
  'qa.rubric.manage',
  'coaching.plan.manage',

  // AI Gateway & Policy
  'ai.suggest',
  'ai.execute',
  'ai.approve',
  'ai.policy.manage',

  // WFM & Analytics
  'wfm.manage',
  'analytics.read',
  'analytics.export',

  // System & Compliance
  'audit.read',
  'settings.manage',
  'billing.manage',
] as const;

export type Permission = (typeof SYSTEM_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  Owner: [...SYSTEM_PERMISSIONS],
  Admin: SYSTEM_PERMISSIONS.filter(p => !p.startsWith('billing.')),
  Supervisor: [
    'customer.read',
    'customer.create',
    'customer.update',
    'conversation.read',
    'conversation.reply',
    'conversation.assign',
    'conversation.close',
    'conversation.export',
    'call.read',
    'call.make',
    'call.recording.read',
    'call.monitor',
    'call.whisper_barge',
    'ticket.read',
    'ticket.create',
    'ticket.update',
    'ticket.assign',
    'ticket.escalate',
    'qa.evaluate',
    'qa.approve',
    'qa.rubric.manage',
    'coaching.plan.manage',
    'ai.suggest',
    'ai.approve',
    'ai.policy.manage',
    'wfm.manage',
    'analytics.read',
    'analytics.export',
    'audit.read',
    'settings.manage',
  ],
  'Team Leader': [
    'customer.read',
    'customer.create',
    'customer.update',
    'conversation.read',
    'conversation.reply',
    'conversation.assign',
    'conversation.close',
    'call.read',
    'call.make',
    'call.recording.read',
    'ticket.read',
    'ticket.create',
    'ticket.update',
    'ticket.assign',
    'ticket.escalate',
    'qa.evaluate',
    'ai.suggest',
    'wfm.manage',
    'analytics.read',
  ],
  Agent: [
    'customer.read',
    'customer.create',
    'customer.update',
    'conversation.read',
    'conversation.reply',
    'conversation.close',
    'call.read',
    'call.make',
    'ticket.read',
    'ticket.create',
    'ticket.update',
    'ticket.escalate',
    'ai.suggest',
  ],
  QA: [
    'customer.read',
    'conversation.read',
    'call.read',
    'call.recording.read',
    'ticket.read',
    'qa.evaluate',
    'qa.approve',
    'qa.rubric.manage',
    'coaching.plan.manage',
    'ai.suggest',
    'analytics.read',
    'audit.read',
  ],
  Analyst: [
    'customer.read',
    'conversation.read',
    'ticket.read',
    'analytics.read',
    'analytics.export',
    'audit.read',
  ],
  'Read Only': [
    'customer.read',
    'conversation.read',
    'call.read',
    'ticket.read',
    'analytics.read',
  ],
  'AI Agent': [
    'customer.read',
    'conversation.read',
    'call.read',
    'ticket.read',
    'ticket.create',
    'ai.suggest',
  ],
};

/**
 * Authoritative privilege rank per role.
 * Role switching is strictly a downscoping mechanism: activeRole rank must never exceed baseRole rank.
 */
export const ROLE_HIERARCHY_RANK: Readonly<Record<string, number>> = Object.freeze({
  Owner: 100,
  Admin: 80,
  Supervisor: 60,
  'Team Leader': 50,
  QA: 40,
  Analyst: 30,
  Agent: 20,
  'AI Agent': 15,
  'Read Only': 10,
});

/**
 * Returns true if and only if a user with `baseRole` is permitted to switch their active session role to `targetRole`.
 * Enforces both:
 * 1. Role hierarchy constraints: only `Owner` and `Admin` baseRoles may switch roles, and `targetRank <= baseRank`.
 * 2. Explicit effective permission-set containment: every permission granted to `targetRole` must be present in
 *    the authorized permission set of `baseRole` (never relying on numerical rank alone).
 */
export function canSwitchToRole(
  baseRole: string,
  targetRole: string,
  rolePermissionsMap: Readonly<Record<string, readonly string[]>> = ROLE_PERMISSIONS
): boolean {
  if (typeof baseRole !== 'string' || typeof targetRole !== 'string') {
    return false;
  }
  if (baseRole !== 'Owner' && baseRole !== 'Admin') {
    return false;
  }
  if (
    !Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY_RANK, baseRole) ||
    !Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY_RANK, targetRole) ||
    !Object.prototype.hasOwnProperty.call(rolePermissionsMap, baseRole) ||
    !Object.prototype.hasOwnProperty.call(rolePermissionsMap, targetRole)
  ) {
    return false;
  }
  const baseRank = ROLE_HIERARCHY_RANK[baseRole];
  const targetRank = ROLE_HIERARCHY_RANK[targetRole];
  if (typeof baseRank !== 'number' || typeof targetRank !== 'number' || targetRank > baseRank) {
    return false;
  }
  const basePermissions = rolePermissionsMap[baseRole];
  const targetPermissions = rolePermissionsMap[targetRole];
  if (!Array.isArray(basePermissions) || !Array.isArray(targetPermissions)) {
    return false;
  }
  const basePermissionSet = new Set<string>(basePermissions);
  return targetPermissions.every((perm) => typeof perm === 'string' && basePermissionSet.has(perm));
}

/**
 * Enforces that paid-tier activation (`zeroCostMode: false`) and billing/budget mutations
 * can only be performed by an authenticated `Owner` acting with `baseRole === 'Owner'` and `role === 'Owner'`.
 */
export function assertOwnerBillingAuthority(actor: {
  role: string;
  baseRole?: string;
}): void {
  const effectiveBaseRole = actor.baseRole || actor.role;
  if (
    effectiveBaseRole !== 'Owner' ||
    actor.role !== 'Owner' ||
    !hasPermission(actor.role, [], 'billing.manage')
  ) {
    const err = new AuthorizationError(
      'Access Denied: Paid-tier activation and billing/budget mutations require explicit Owner authority (baseRole=Owner, role=Owner, billing.manage).'
    );
    err.code = 'OWNER_BILLING_AUTHORIZATION_REQUIRED';
    throw err;
  }
}

/**
 * Validates whether a user with given roles and custom permissions possesses the requested permission.
 */
export function hasPermission(
  userRole: string,
  userExplicitPermissions: string[] = [],
  requiredPermission: Permission
): boolean {
  if (!userRole) return false;
  const canonicalRole = Object.keys(ROLE_PERMISSIONS).find(
    (r) => r.toLowerCase() === userRole.toLowerCase().trim()
  ) || userRole;

  if (canonicalRole === 'Owner') return true;
  if (userExplicitPermissions.includes(requiredPermission)) return true;
  const rolePermissions = ROLE_PERMISSIONS[canonicalRole] || [];
  return rolePermissions.includes(requiredPermission);
}

/**
 * Formal Authorization Error class supporting HTTP status and code.
 */
export class AuthorizationError extends Error {
  status = 403;
  code = 'FORBIDDEN';

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Guard utility throwing a formal AuthorizationError if permission is denied.
 */
export function assertPermission(
  userRole: string,
  userExplicitPermissions: string[] = [],
  requiredPermission: Permission
): void {
  if (!hasPermission(userRole, userExplicitPermissions, requiredPermission)) {
    throw new AuthorizationError(
      `Access Denied: Role [${userRole}] lacks required permission [${requiredPermission}].`
    );
  }
}
