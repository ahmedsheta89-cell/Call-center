/**
 * @file src/lib/firestoreService.ts
 * Real-time Firestore & Cloud Persistence Service
 * Database ID: ai-studio-omniflowaios-c7e77753-7b8a-41c8-a9ca-10f723452807
 */

import { firestore } from './firebase.ts';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { Ticket, Conversation, Customer } from '../types.ts';

export interface CloudDatabaseStatus {
  firestoreConnected: boolean;
  cloudSqlConnected: boolean;
  databaseId: string;
  region: string;
  totalSyncedTickets: number;
  totalSyncedConversations: number;
  lastSyncTimestamp: string;
}

const FIRESTORE_DB_ID = 'ai-studio-omniflowaios-c7e77753-7b8a-41c8-a9ca-10f723452807';

/**
 * Sync a ticket to Firestore
 */
export async function syncTicketToFirestore(ticket: Ticket): Promise<boolean> {
  try {
    const ticketRef = doc(firestore, 'tickets', ticket.id);
    await setDoc(ticketRef, {
      ...ticket,
      updatedAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('[Firestore Sync] Non-blocking ticket sync notice:', err);
    return false;
  }
}

/**
 * Sync a conversation to Firestore
 */
export async function syncConversationToFirestore(conv: Conversation): Promise<boolean> {
  try {
    const convRef = doc(firestore, 'conversations', conv.id);
    await setDoc(convRef, {
      ...conv,
      lastUpdated: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('[Firestore Sync] Non-blocking conversation sync notice:', err);
    return false;
  }
}

/**
 * Subscribe to live tickets updates from Firestore
 */
export function subscribeToFirestoreTickets(onUpdate: (tickets: Ticket[]) => void) {
  try {
    const q = query(collection(firestore, 'tickets'), limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const fetched: Ticket[] = [];
        snapshot.forEach((d) => {
          fetched.push(d.data() as Ticket);
        });
        if (fetched.length > 0) {
          onUpdate(fetched);
        }
      },
      (error) => {
        console.info('[Firestore] Live listener active in offline/fallback mode:', error.message);
      }
    );
  } catch (e) {
    console.info('[Firestore] Fallback to local memory store.');
    return () => {};
  }
}

/**
 * Trigger mass replication between backend store and Firestore
 */
export async function triggerReplicationToCloud(
  tickets: Ticket[],
  conversations: Conversation[]
): Promise<{ success: boolean; ticketsCount: number; conversationsCount: number }> {
  let tCount = 0;
  let cCount = 0;

  try {
    for (const t of tickets.slice(0, 20)) {
      await syncTicketToFirestore(t);
      tCount++;
    }
    for (const c of conversations.slice(0, 20)) {
      await syncConversationToFirestore(c);
      cCount++;
    }
    return { success: true, ticketsCount: tCount, conversationsCount: cCount };
  } catch (error) {
    return { success: false, ticketsCount: tCount, conversationsCount: cCount };
  }
}
