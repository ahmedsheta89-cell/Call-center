/**
 * @file server/api/contracts.ts
 * Versioned REST API Endpoints & Contract Definitions (/api/v1/*)
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    requestId: string;
    timestamp: string;
  };
}

export const API_V1_ROUTES = {
  // Identity & Auth
  AUTH_ME: '/api/v1/auth/me',
  AUTH_LOGIN: '/api/v1/auth/login',

  // Customer 360
  CUSTOMERS: '/api/v1/customers',
  CUSTOMER_DETAIL: '/api/v1/customers/:id',
  CUSTOMER_TIMELINE: '/api/v1/customers/:id/timeline',

  // Omnichannel Conversations
  CONVERSATIONS: '/api/v1/conversations',
  CONVERSATION_DETAIL: '/api/v1/conversations/:id',
  CONVERSATION_MESSAGES: '/api/v1/conversations/:id/messages',
  CONVERSATION_ASSIGN: '/api/v1/conversations/:id/assign',
  CONVERSATION_CLOSE: '/api/v1/conversations/:id/close',

  // Telephony & Voice
  CALLS: '/api/v1/calls',
  CALL_CONTROL: '/api/v1/calls/:id/control', // hold, mute, transfer, barge
  CALL_DISPOSITION: '/api/v1/calls/:id/disposition',

  // Tickets & SLA
  TICKETS: '/api/v1/tickets',
  TICKET_DETAIL: '/api/v1/tickets/:id',
  TICKET_ESCALATE: '/api/v1/tickets/:id/escalate',

  // AI Gateway & Copilot
  AI_COPILOT_SUGGEST: '/api/v1/ai/copilot/suggest',
  AI_SUMMARY: '/api/v1/ai/summary',
  AI_NL_ANALYST: '/api/v1/ai/analyst',
  AI_SUPERVISOR_EVAL: '/api/v1/ai/supervisor/evaluate',

  // QA & Coaching
  QA_EVALUATIONS: '/api/v1/qa/evaluations',
  QA_RUBRICS: '/api/v1/qa/rubrics',
  COACHING_PLANS: '/api/v1/coaching/plans',

  // Analytics & Command Center
  ANALYTICS_OVERVIEW: '/api/v1/analytics/overview',
  ANALYTICS_KPIS: '/api/v1/analytics/kpis',
  LIVE_COMMAND_CENTER: '/api/v1/operations/live',

  // Workforce Management
  WFM_AGENTS: '/api/v1/wfm/agents',
  WFM_SHIFTS: '/api/v1/wfm/shifts',

  // Webhooks
  WEBHOOK_WHATSAPP: '/api/v1/webhooks/whatsapp',
  WEBHOOK_META: '/api/v1/webhooks/meta',

  // Audit & Settings
  AUDIT_LOGS: '/api/v1/audit/logs',
  SYSTEM_SETTINGS: '/api/v1/settings',
} as const;
