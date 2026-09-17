/**
 * @file src/db/users.ts
 * Cloud SQL User & Ticket Persistence Helpers with Sanitized Error Handling
 */

import { db } from './index.ts';
import { users, tickets } from './schema.ts';
import { eq } from 'drizzle-orm';

/**
 * Upserts a user by Firebase UID
 */
export async function getOrCreateUser(uid: string, email: string, displayName?: string, role = 'agent') {
  try {
    const result = await db.insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        role,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || email.split('@')[0],
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to get or create user in Cloud SQL:', error);
    throw new Error('Database user sync failed. Please try again later.', { cause: error });
  }
}

/**
 * Fetches all registered users
 */
export async function getUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Database getUsers failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

/**
 * Fetches tickets from Cloud SQL
 */
export async function getSqlTickets() {
  try {
    return await db.select().from(tickets);
  } catch (error) {
    console.error('Database getSqlTickets failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
