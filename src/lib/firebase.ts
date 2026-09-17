/**
 * @file src/lib/firebase.ts
 * Client-Side Firebase Initialization (Auth & Firestore)
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-omniflowaios-c7e77753-7b8a-41c8-a9ca-10f723452807';

export const firestore = getFirestore(app, FIRESTORE_DATABASE_ID);
