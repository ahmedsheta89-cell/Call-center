/**
 * @file src/db/schema.ts
 * Cloud SQL (PostgreSQL) Complete Enterprise Schema Definition using Drizzle ORM
 * Includes all operational tables and columns for OmniFlow AI Contact Center OS
 */

import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users & Agents table authenticated via Firebase UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  phoneNumber: text('phone_number').default('01018108979'),
  role: text('role').default('agent').notNull(),
  teamName: text('team_name').default('فريق العمليات الرئيسي'),
  status: text('status').default('online').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Customers 360 CRM table
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone').notNull(),
  customerTier: text('customer_tier').default('standard').notNull(),
  lifetimeValue: integer('lifetime_value').default(0).notNull(),
  assignedAgentId: text('assigned_agent_id'),
  assignedAgentName: text('assigned_agent_name'),
  accountNumber: text('account_number'),
  city: text('city'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Tickets & SLA Engine table
export const tickets = pgTable('tickets', {
  id: text('id').primaryKey(),
  ticketNumber: integer('ticket_number').default(2001).notNull(),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').default('عام'),
  priority: text('priority').default('medium').notNull(),
  status: text('status').default('new').notNull(),
  slaStatus: text('sla_status').default('healthy').notNull(),
  assignedAgent: text('assigned_agent'),
  assignedAgentName: text('assigned_agent_name'),
  firstResponseDueAt: timestamp('first_response_due_at'),
  resolutionDueAt: timestamp('resolution_due_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 4. Omnichannel Conversations table
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  customerId: text('customer_id'),
  channel: text('channel').notNull(),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerTier: text('customer_tier').default('standard'),
  status: text('status').default('open').notNull(),
  priority: text('priority').default('medium'),
  assignedAgentId: text('assigned_agent_id'),
  subject: text('subject'),
  sentiment: text('sentiment').default('neutral'),
  intent: text('intent'),
  lastMessage: text('last_message'),
  unreadCount: integer('unread_count').default(0),
  slaDueAt: timestamp('sla_due_at'),
  timestamp: timestamp('timestamp').defaultNow(),
});

// 5. Voice & WebRTC Call Sessions table
export const callSessions = pgTable('call_sessions', {
  id: text('id').primaryKey(),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  agentId: text('agent_id'),
  direction: text('direction').default('inbound').notNull(),
  status: text('status').default('completed').notNull(),
  callerNumber: text('caller_number').notNull(),
  calleeNumber: text('callee_number').notNull(),
  durationSeconds: integer('duration_seconds').default(0).notNull(),
  transcript: text('transcript'),
  aiSummary: text('ai_summary'),
  aiSentiment: text('ai_sentiment').default('neutral'),
  disposition: text('disposition'),
  startedAt: timestamp('started_at').defaultNow(),
});

// 6. Immutable Security & Operations Audit Trail table
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  actorId: text('actor_id'),
  actorType: text('actor_type').default('user').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  ipAddress: text('ip_address'),
  requestId: text('request_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  tickets: many(tickets),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  assignee: one(users, {
    fields: [tickets.assignedAgent],
    references: [users.uid],
  }),
  customer: one(customers, {
    fields: [tickets.customerId],
    references: [customers.id],
  }),
}));
