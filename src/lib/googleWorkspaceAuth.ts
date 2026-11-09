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
import {
  refreshGlobalApiSession,
  logoutGlobalApiSession,
  purgeSensitiveBrowserCaches,
} from './apiClient';

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
      let backendSession = null;
      let syncError: string | null = null;
      try {
        const idToken = await user.getIdToken();
        backendSession = await refreshGlobalApiSession(idToken);
        if (!backendSession || !backendSession.token) {
          syncError = 'تعذر التحقق من جلسة الخادم الخلفي (/api/v1/auth/login)';
        }
      } catch (err: any) {
        backendSession = null;
        syncError = err?.message || 'فشل التحقق من جلسة الخادم الخلفي';
      }

      // If an interactive googleSignIn() flow is actively running, refreshGlobalApiSession above coalesced
      // onto the single in-flight request; let googleSignIn() emit the authoritative state transition.
      if (isSigningIn) {
        return;
      }

      if (!backendSession || !backendSession.token) {
        cachedAccessToken = null;
        tokenExpiresAt = null;
        currentState = {
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          error: syncError,
        };
      } else {
        currentState = {
          user,
          accessToken: cachedAccessToken,
          isAuthenticated: Boolean(cachedAccessToken && backendSession.token),
          isLoading: false,
          error: null,
        };
      }
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
 * Sign in with Google Popup and obtain access token with requested Gmail & Sheets scopes.
 * Requires a verified backend session from `/api/v1/auth/login`; fails closed if backend authentication fails.
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

    const idToken = await result.user.getIdToken();
    const backendSession = await refreshGlobalApiSession(idToken);
    if (!backendSession || !backendSession.token) {
      throw new Error('فشل التحقق من الجلسة في الخادم الخلفي (/api/v1/auth/login): تم رفض الهوية أو تعذر إنشاء الجلسة.');
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
    cachedAccessToken = null;
    tokenExpiresAt = null;
    const errorMessage = error?.message || 'فشل تسجيل الدخول باستخدام حساب Google';
    currentState = {
      user: null,
      accessToken: null,
      isAuthenticated: false,
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
 * Sign out, revoke backend /api/v1/auth/logout session, purge sensitive caches, and clear in-memory token.
 * Guarantees local state and cache cleanup in `finally` even if remote revocation or Firebase signOut throws,
 * while surfacing remote revocation failures accurately.
 */
export const googleSignOut = async (): Promise<void> => {
  let remoteRevocationError: Error | null = null;
  let firebaseSignOutError: Error | null = null;

  try {
    try {
      const logoutResult = await logoutGlobalApiSession();
      if (!logoutResult.remoteRevoked) {
        remoteRevocationError = new Error(
          logoutResult.error ||
            'Remote backend session revocation (/api/v1/auth/logout) could not be confirmed; local credentials and caches were cleared.'
        );
      }
    } catch (err: any) {
      remoteRevocationError =
        err instanceof Error
          ? err
          : new Error('Remote backend session revocation failed; local credentials and caches were cleared.');
    }

    try {
      if (auth && typeof signOut === 'function') {
        await signOut(auth);
      }
    } catch (err: any) {
      firebaseSignOutError =
        err instanceof Error
          ? err
          : new Error('Firebase signOut failed; local credentials and caches were cleared.');
    }
  } finally {
    cachedAccessToken = null;
    tokenExpiresAt = null;
    try {
      await purgeSensitiveBrowserCaches();
    } catch {
      // Ignore cache cleanup errors in finally
    }
    const surfacedError = remoteRevocationError || firebaseSignOutError;
    currentState = {
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: surfacedError ? surfacedError.message : null,
    };
    notifySubscribers(currentState);
  }

  if (remoteRevocationError) {
    throw remoteRevocationError;
  }
  if (firebaseSignOutError) {
    throw firebaseSignOutError;
  }
};
