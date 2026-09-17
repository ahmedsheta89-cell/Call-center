/**
 * @file src/lib/firebaseConfig.ts
 * Firebase Initialization using configuration and firestoreDatabaseId from firebase-applet-config.json
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

// Database ID from firebase-applet-config.json
export const firestoreDatabaseId: string =
  firebaseConfig.firestoreDatabaseId ||
  (firebaseConfig as { databaseId?: string }).databaseId ||
  'ai-studio-omniflowaios-c7e77753-7b8a-41c8-a9ca-10f723452807';

export const FIRESTORE_DATABASE_ID = firestoreDatabaseId;

/**
 * Initialize Firestore explicitly using the designated database ID from 'firestoreDatabaseId'
 * This resolves the 'Database (default) not found' error by explicitly pointing to the intended database ID.
 */
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {}, firestoreDatabaseId);
} catch {
  // If already initialized with these settings, retrieve existing instance
  firestoreInstance = getFirestore(app, firestoreDatabaseId);
}

export const firestore = firestoreInstance;
export const db = firestoreInstance;

export default firestoreInstance;
