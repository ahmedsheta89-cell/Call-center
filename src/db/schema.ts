/**
 * @file src/db/schema.ts
 * Cloud SQL (PostgreSQL) Schema Definition using Drizzle ORM
 */

import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table authenticated via Firebase UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('agent').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tickets table for Omnichannel operations
export const tickets = pgTable('tickets', {
  id: text('id').primaryKey(),
  customerId: text('customer_id'),
  title: text('title').notNull(),
  category: text('category').default('عام'),
  priority: text('priority').default('medium'),
  status: text('status').default('open').notNull(),
  assignedAgent: text('assigned_agent'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Conversations table
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  status: text('status').default('active').notNull(),
  lastMessage: text('last_message'),
  timestamp: timestamp('timestamp').defaultNow(),
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
}));
