/**
 * @file src/lib/googleWorkspaceAuth.ts
 * Google Workspace OAuth & Authentication Management
 * Handles Google Sign-In with Gmail, Sheets & Drive scopes.
 * Note: Access token is cached in-memory ONLY (never in localStorage/sessionStorage) per security specifications.
 */

import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

export const WORKSPACE_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

// Configure GoogleAuthProvider with Workspace scopes
const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
// In-memory token storage (MANDATORY: Never in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

export interface WorkspaceAuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

type AuthCallback = (state: WorkspaceAuthState) => void;
const subscribers = new Set<AuthCallback>();

const notifySubscribers = (state: WorkspaceAuthState) => {
  subscribers.forEach((cb) => cb(state));
};

let currentState: WorkspaceAuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Initialize auth state listener
export const initWorkspaceAuth = (callback?: AuthCallback): (() => void) => {
  if (callback) subscribers.add(callback);

  const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // User is signed into Firebase Auth
      currentState = {
        user,
        accessToken: cachedAccessToken,
        isAuthenticated: !!cachedAccessToken,
        isLoading: false,
        error: null,
      };
    } else {
      cachedAccessToken = null;
      tokenExpiresAt = null;
      currentState = {
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    }
    notifySubscribers(currentState);
  });

  return () => {
    if (callback) subscribers.delete(callback);
    unsubscribe();
  };
};

export const getWorkspaceAuthState = (): WorkspaceAuthState => currentState;

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) {
    if (tokenExpiresAt && Date.now() > tokenExpiresAt) {
      cachedAccessToken = null;
      tokenExpiresAt = null;
      currentState.accessToken = null;
      currentState.isAuthenticated = false;
      notifySubscribers(currentState);
      return null;
    }
    return cachedAccessToken;
  }
  return null;
};

/**
 * Sign in with Google Popup and obtain access token with requested Gmail & Sheets scopes
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  if (isSigningIn) {
    throw new Error('Sign-in flow already in progress');
  }

  try {
    isSigningIn = true;
    currentState = { ...currentState, isLoading: true, error: null };
    notifySubscribers(currentState);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('لم يتم استلام تصريح الوصول (OAuth Access Token) من Google.');
    }

    cachedAccessToken = credential.accessToken;
    // OAuth access tokens typically expire in 3600 seconds (1 hour)
    tokenExpiresAt = Date.now() + 3500 * 1000;

    currentState = {
      user: result.user,
      accessToken: cachedAccessToken,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };
    notifySubscribers(currentState);

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Workspace Sign-in error:', error);
    const errorMessage = error?.message || 'فشل تسجيل الدخول باستخدام حساب Google';
    currentState = {
      ...currentState,
      isLoading: false,
      error: errorMessage,
    };
    notifySubscribers(currentState);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Sign out and clear in-memory token
 */
export const googleSignOut = async (): Promise<void> => {
  try {
    await signOut(auth);
    cachedAccessToken = null;
    tokenExpiresAt = null;
    currentState = {
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };
    notifySubscribers(currentState);
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};
