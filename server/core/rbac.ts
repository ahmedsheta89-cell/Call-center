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
