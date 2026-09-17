/**
 * @file src/lib/firebase.ts
 * Re-exports Firebase App, Auth, and Firestore from firebaseConfig.ts
 */

export {
  app,
  auth,
  googleAuthProvider,
  firestoreDatabaseId,
  FIRESTORE_DATABASE_ID,
  firestore,
  db,
  default,
} from './firebaseConfig.ts';
