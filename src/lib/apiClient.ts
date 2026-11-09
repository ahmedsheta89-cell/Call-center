/**
 * @file src/lib/apiClient.ts
 * Non-Intrusive Session-Aware Fetch Client & Descriptor-Safe Interceptor (Phase 4.2)
 *
 * Guarantees:
 * - Preserves native `Request`, `Headers`, `AbortSignal` (pre-aborted and mid-flight), and `this` binding.
 * - Coalesces concurrent pre-bootstrap API requests into a single `/api/v1/auth/login` call.
 * - Enforces an explicit login timeout (`loginTimeoutMs`) via `AbortController`.
 * - Fails closed (`HTTP 401 SESSION_BOOTSTRAP_FAILED`) if session initialization fails before a protected call.
 * - Respects explicit logout (`POST /api/v1/auth/logout`): does not silently re-login after logout unless
 *   `ensureSession(true)` or an explicit `/api/v1/auth/login` request is made.
 * - Never converts HTTP/auth errors (401/403/500) into synthetic 200 OK responses.
 * - Safely inspects property descriptors before attempting to wrap `window.fetch` and provides
 *   `appFetch` fallback so protection is never silently dropped even on non-configurable `window.fetch`.
 */

export interface SessionCredentials {
  token: string;
  csrfToken: string;
  sessionId?: string;
  userId?: string;
  organizationId?: string;
  role?: string;
  baseRole?: string;
}

export interface LogoutResult {
  localCleaned: boolean;
  remoteRevoked: boolean;
  status?: number;
  error?: string;
}

export interface ApiClientOptions {
  rawFetch: typeof fetch;
  globalThisTarget?: any;
  loginTimeoutMs?: number;
  getFirebaseIdToken?: () => Promise<string | null>;
  allowLocalTestBootstrap?: boolean;
}

export type FetchDescriptorMode =
  | 'writable_value'
  | 'configurable_getter'
  | 'non_configurable_locked'
  | 'uninstalled';

export interface FetchProtectionStatus {
  installedOnGlobal: boolean;
  descriptorMode: FetchDescriptorMode;
  fallbackRequired: boolean;
}

export interface ApiClientController {
  apiFetch: typeof fetch;
  ensureSession: (forceRelogin?: boolean) => Promise<SessionCredentials | null>;
  loginWithIdToken: (idToken: string) => Promise<SessionCredentials | null>;
  getActiveSession: () => SessionCredentials | null;
  clearSession: () => void;
  getLoginCallCount: () => number;
  getProtectionStatus: () => FetchProtectionStatus;
  setProtectionStatus: (status: FetchProtectionStatus) => void;
}

let registeredGlobalClient: ApiClientController | null = null;

export function registerGlobalApiClient(client: ApiClientController): void {
  registeredGlobalClient = client;
}

const SENSITIVE_STORAGE_KEYS = [
  'omniflow_workspace_token',
  'omniflow_session_cache',
  'omniflow_tenant_cache',
  'omniflow_api_cache',
];

function isSensitiveCacheName(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === 'omniflow-api-live-cache' ||
    lower.includes('omniflow-api') ||
    lower.includes('api-live-cache') ||
    lower.includes('workbox-runtime') ||
    lower.includes('omniflow-session') ||
    lower.includes('omniflow-tenant') ||
    lower.includes('omniflow-auth')
  );
}

/**
 * Purges legacy and runtime cached API responses from Browser CacheStorage (`caches`) and
 * sensitive session/tenant keys from web storage upon startup, account/tenant switch, role switch, or logout.
 * Preserves unrelated browser caches (such as font or static icon caches).
 */
export async function purgeSensitiveBrowserCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(async (key) => {
          if (isSensitiveCacheName(key)) {
            await caches.delete(key);
            return;
          }
          // For any other cache that supports inspection, evict only individual `/api/` entries
          if (typeof caches.open === 'function') {
            try {
              const cache = await caches.open(key);
              if (cache && typeof cache.keys === 'function') {
                const reqs = await cache.keys();
                await Promise.all(
                  reqs
                    .filter((req) => {
                      const u = typeof req === 'string' ? req : req?.url || '';
                      return u.includes('/api/');
                    })
                    .map((req) => cache.delete(req))
                );
              }
            } catch {
              // ignore individual cache inspection errors
            }
          }
        })
      );
    }
  } catch {
    // Ignore CacheStorage errors in non-browser or restricted environments
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      for (const k of SENSITIVE_STORAGE_KEYS) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // ignore storage errors
  }

  try {
    if (typeof localStorage !== 'undefined') {
      for (const k of SENSITIVE_STORAGE_KEYS) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Waits for Firebase Authentication persistence restoration (`authStateReady()`) before
 * reading `auth.currentUser` and requesting a fresh ID token.
 * Never treats `auth.currentUser` as authoritative prior to persistence restoration.
 */
export async function resolveRestoredFirebaseIdToken(authInstance: any): Promise<string | null> {
  if (!authInstance) return null;
  try {
    if (typeof authInstance.authStateReady === 'function') {
      await authInstance.authStateReady();
    }
    const currentUser = authInstance.currentUser;
    if (currentUser && typeof currentUser.getIdToken === 'function') {
      const token = await currentUser.getIdToken();
      return typeof token === 'string' && token.trim().length > 0 ? token.trim() : null;
    }
  } catch {
    // Return null if Firebase Auth restoration or ID token retrieval fails
  }
  return null;
}

/**
 * Computes an in-memory, non-reversible principal key from a Firebase ID Token without
 * storing or logging the raw token. Extracts the JWT `uid`/`sub` claim when present so
 * `googleSignIn()` and `onAuthStateChanged()` for the same Firebase user coalesce deterministically.
 */
function derivePrincipalKeyFromToken(rawIdToken?: string | null): string {
  if (!rawIdToken || typeof rawIdToken !== 'string' || rawIdToken.trim().length === 0) {
    return 'bootstrap:default';
  }
  const trimmed = rawIdToken.trim();
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr =
        typeof Buffer !== 'undefined'
          ? Buffer.from(b64, 'base64').toString('utf-8')
          : typeof atob === 'function'
          ? atob(b64)
          : '';
      if (jsonStr) {
        const claims = JSON.parse(jsonStr);
        const principalId = claims?.uid || claims?.user_id || claims?.sub || claims?.email;
        if (typeof principalId === 'string' && principalId.trim().length > 0) {
          return `principal:${principalId.trim()}`;
        }
      }
    } catch {
      // Fall through to non-reversible token fingerprint
    }
  }
  // Fast FNV-1a 32-bit fingerprint (never stores the raw token)
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `token_fp:${(hash >>> 0).toString(16)}:${trimmed.length}`;
}

/**
 * Exchanges a verified Firebase ID Token with `/api/v1/auth/login` via the registered global API client.
 * Coalesces concurrent calls for the same principal/token so `googleSignIn()` and `onAuthStateChanged()`
 * cannot mint competing sessions.
 */
export async function refreshGlobalApiSession(idToken?: string | null): Promise<SessionCredentials | null> {
  if (!registeredGlobalClient) return null;
  if (idToken && typeof idToken === 'string' && idToken.trim().length > 0) {
    return registeredGlobalClient.loginWithIdToken(idToken.trim());
  }
  return registeredGlobalClient.ensureSession(true);
}

/**
 * Revokes the backend session via `POST /api/v1/auth/logout` (always called with `credentials: 'include'`,
 * even when no in-memory session token exists after page reload), clears client credentials,
 * and purges sensitive browser caches in a guaranteed `finally` path.
 * Never claims `remoteRevoked: true` unless the server confirms revocation with HTTP 200.
 */
export async function logoutGlobalApiSession(): Promise<LogoutResult> {
  let remoteRevoked = false;
  let status: number | undefined;
  let errorMsg: string | undefined;

  try {
    const fetchFn = registeredGlobalClient
      ? registeredGlobalClient.apiFetch
      : typeof fetch === 'function'
      ? fetch
      : null;

    if (fetchFn) {
      const res = await fetchFn('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      status = res.status;
      const body = await res.json().catch(() => null);
      if (res.ok && body?.success === true && body?.remoteRevoked !== false) {
        remoteRevoked = true;
      } else {
        remoteRevoked = false;
        errorMsg =
          body?.error?.message ||
          body?.message ||
          `Server logout failed with HTTP ${res.status}`;
      }
    } else {
      errorMsg = 'No fetch implementation available for remote session revocation';
    }
  } catch (err: any) {
    remoteRevoked = false;
    errorMsg = err?.message || 'Network error during remote session logout';
  } finally {
    registeredGlobalClient?.clearSession();
    await purgeSensitiveBrowserCaches();
  }

  return {
    localCleaned: true,
    remoteRevoked,
    status,
    ...(errorMsg ? { error: errorMsg } : {}),
  };
}

/**
 * Safe application-level fetch entrypoint that always routes through the registered
 * session-aware client, even in environments where `window.fetch` is non-configurable (`configurable: false`).
 */
export const appFetch: typeof fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (registeredGlobalClient) {
    return registeredGlobalClient.apiFetch(input, init);
  }
  return fetch(input, init);
};

export function createSessionAwareClient(options: ApiClientOptions): ApiClientController {
  const {
    rawFetch,
    globalThisTarget = typeof window !== 'undefined' ? window : globalThis,
    loginTimeoutMs = 6000,
    getFirebaseIdToken,
  } = options;

  let activeSession: SessionCredentials | null = null;
  let activePrincipalKey: string | null = null;
  let lastCommittedUserId: string | null = null;
  let lastCommittedOrgId: string | null = null;
  let transitionEpoch = 0;

  const inFlightByPrincipal = new Map<string, Promise<SessionCredentials | null>>();
  let defaultBootstrapInFlight: Promise<SessionCredentials | null> | null = null;

  let loginCallCount = 0;
  let explicitlyLoggedOut = false;
  let protectionStatus: FetchProtectionStatus = {
    installedOnGlobal: false,
    descriptorMode: 'uninstalled',
    fallbackRequired: false,
  };

  const invokeRawFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return rawFetch.call(globalThisTarget, input, init);
  };

  const applyAuthenticatedSession = async (
    nextSession: SessionCredentials,
    principalKey: string
  ): Promise<SessionCredentials> => {
    const isPrincipalChanged =
      (activePrincipalKey !== null && activePrincipalKey !== principalKey) ||
      (lastCommittedUserId !== null &&
        nextSession.userId !== undefined &&
        lastCommittedUserId !== nextSession.userId) ||
      (lastCommittedOrgId !== null &&
        nextSession.organizationId !== undefined &&
        lastCommittedOrgId !== nextSession.organizationId);

    if (isPrincipalChanged) {
      await purgeSensitiveBrowserCaches();
    }

    activeSession = nextSession;
    activePrincipalKey = principalKey;
    if (nextSession.userId) {
      lastCommittedUserId = nextSession.userId;
    }
    if (nextSession.organizationId) {
      lastCommittedOrgId = nextSession.organizationId;
    }
    explicitlyLoggedOut = false;
    return nextSession;
  };

  const executeLoginRequest = (
    explicitIdToken: string | null | undefined,
    principalKey: string,
    epochAtStart: number
  ): Promise<SessionCredentials | null> => {
    loginCallCount += 1;
    let promise!: Promise<SessionCredentials | null>;
    promise = (async (): Promise<SessionCredentials | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('Login bootstrap timed out')), loginTimeoutMs);
      try {
        let idToken: string | null =
          typeof explicitIdToken === 'string' && explicitIdToken.trim().length > 0
            ? explicitIdToken.trim()
            : null;

        if (!idToken && explicitIdToken === undefined && getFirebaseIdToken) {
          try {
            idToken = await getFirebaseIdToken();
          } catch {
            idToken = null;
          }
        }

        const effectivePrincipalKey =
          principalKey === 'bootstrap:default' && idToken
            ? derivePrincipalKeyFromToken(idToken)
            : principalKey;

        // If another login already established a session for this exact principal while getFirebaseIdToken resolved, reuse it
        if (
          activeSession &&
          activePrincipalKey === effectivePrincipalKey &&
          !explicitlyLoggedOut &&
          explicitIdToken === undefined
        ) {
          return activeSession;
        }

        // If an in-flight request already exists for the resolved principal key, coalesce onto it
        const existingResolvedInFlight = inFlightByPrincipal.get(effectivePrincipalKey);
        if (existingResolvedInFlight && existingResolvedInFlight !== promise) {
          loginCallCount -= 1;
          return await existingResolvedInFlight;
        }
        inFlightByPrincipal.set(effectivePrincipalKey, promise);

        // If switching away from an existing principal, clear prior active session and caches immediately
        if (activePrincipalKey !== null && activePrincipalKey !== effectivePrincipalKey) {
          activeSession = null;
          activePrincipalKey = null;
          await purgeSensitiveBrowserCaches();
        }

        const isNodeLocalTestAllowed =
          typeof process !== 'undefined' &&
          process.env?.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN === 'true' &&
          process.env?.NODE_ENV !== 'production' &&
          process.env?.OMNIFLOW_REQUIRE_FIREBASE_AUTH !== 'true';
        const allowFallbackUserId =
          options.allowLocalTestBootstrap !== undefined
            ? options.allowLocalTestBootstrap
            : isNodeLocalTestAllowed;

        const bodyPayload = idToken
          ? { idToken }
          : allowFallbackUserId
          ? { userId: 'usr-admin-01' }
          : {};

        const res = await invokeRawFetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (epochAtStart === transitionEpoch) {
            activeSession = null;
            activePrincipalKey = null;
          }
          return null;
        }

        const json = await res.json().catch(() => null);
        const token = json?.data?.token;
        const csrfToken = json?.data?.csrfToken || res.headers?.get?.('X-CSRF-Token') || '';
        const actor = json?.data?.actor;

        if (typeof token === 'string' && token.length > 0) {
          const nextCredentials: SessionCredentials = {
            token,
            csrfToken,
            sessionId: json?.data?.sessionId || actor?.sessionId,
            userId: actor?.userId,
            organizationId: actor?.organizationId,
            role: actor?.role,
            baseRole: actor?.baseRole,
          };

          // Only commit to activeSession if a newer principal transition did not supersede this request
          if (epochAtStart === transitionEpoch) {
            await applyAuthenticatedSession(nextCredentials, effectivePrincipalKey);
          }
          return nextCredentials;
        }

        if (epochAtStart === transitionEpoch) {
          activeSession = null;
          activePrincipalKey = null;
        }
        return null;
      } catch {
        if (epochAtStart === transitionEpoch) {
          activeSession = null;
          activePrincipalKey = null;
        }
        return null;
      } finally {
        clearTimeout(timer);
        inFlightByPrincipal.forEach((val, key) => {
          if (val === promise) {
            inFlightByPrincipal.delete(key);
          }
        });
        if (defaultBootstrapInFlight === promise) {
          defaultBootstrapInFlight = null;
        }
      }
    })();

    inFlightByPrincipal.set(principalKey, promise);
    return promise;
  };

  const loginWithIdToken = (idToken: string): Promise<SessionCredentials | null> => {
    const trimmed = typeof idToken === 'string' ? idToken.trim() : '';
    if (!trimmed) {
      return Promise.resolve(null);
    }
    const principalKey = derivePrincipalKeyFromToken(trimmed);
    explicitlyLoggedOut = false;

    // 1. If a request for the exact same principal/token is currently in flight, coalesce onto it
    const existingInFlight = inFlightByPrincipal.get(principalKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    // 2. If an active session is already established for the exact same principal, return it without duplicate login
    if (activeSession && activePrincipalKey === principalKey) {
      return Promise.resolve(activeSession);
    }

    // 3. Different principal or fresh login: invalidate prior principal state immediately so prior account data is never exposed
    transitionEpoch += 1;
    const currentEpoch = transitionEpoch;
    if (activePrincipalKey !== null && activePrincipalKey !== principalKey) {
      activeSession = null;
      activePrincipalKey = null;
      void purgeSensitiveBrowserCaches();
    }

    return executeLoginRequest(trimmed, principalKey, currentEpoch);
  };

  const ensureSession = (forceRelogin = false): Promise<SessionCredentials | null> => {
    if (forceRelogin) {
      explicitlyLoggedOut = false;
    }
    if (explicitlyLoggedOut) {
      return Promise.resolve(null);
    }
    if (activeSession && !forceRelogin) {
      return Promise.resolve(activeSession);
    }
    if (defaultBootstrapInFlight) {
      return defaultBootstrapInFlight;
    }
    if (inFlightByPrincipal.size === 1) {
      const firstInFlight = inFlightByPrincipal.values().next().value;
      if (firstInFlight) {
        return firstInFlight;
      }
    }

    const currentEpoch = transitionEpoch;
    defaultBootstrapInFlight = executeLoginRequest(undefined, 'bootstrap:default', currentEpoch);
    return defaultBootstrapInFlight;
  };

  const extractUrlString = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input && typeof (input as Request).url === 'string') return (input as Request).url;
    return String(input);
  };

  const isProtectedApiRoute = (urlStr: string): boolean => {
    try {
      if (urlStr.startsWith('/api/v1/')) {
        return !urlStr.startsWith('/api/v1/auth/login') && !urlStr.startsWith('/api/v1/auth/logout');
      }
      if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        const parsed = new URL(urlStr);
        return (
          parsed.pathname.startsWith('/api/v1/') &&
          !parsed.pathname.startsWith('/api/v1/auth/login') &&
          !parsed.pathname.startsWith('/api/v1/auth/logout')
        );
      }
    } catch {
      // ignore URL parse error
    }
    return false;
  };

  const apiFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const isRequestInstance = typeof Request !== 'undefined' && input instanceof Request;
    const callerSignal = init?.signal || (isRequestInstance ? input.signal : undefined);
    if (callerSignal?.aborted) {
      throw callerSignal.reason || new DOMException('The operation was aborted.', 'AbortError');
    }

    const urlStr = extractUrlString(input);

    // Handle explicit /api/v1/auth/login calls (including account/tenant transitions)
    if (urlStr.includes('/api/v1/auth/login')) {
      let parsedBody: any = null;
      if (typeof init?.body === 'string') {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = null;
        }
      }
      const suppliedPrincipalKey = parsedBody?.idToken
        ? derivePrincipalKeyFromToken(parsedBody.idToken)
        : parsedBody?.userId
        ? `principal:${String(parsedBody.userId).trim()}`
        : parsedBody?.email
        ? `principal:${String(parsedBody.email).trim().toLowerCase()}`
        : 'bootstrap:explicit';

      if (activePrincipalKey !== null && activePrincipalKey !== suppliedPrincipalKey) {
        activeSession = null;
        activePrincipalKey = null;
        await purgeSensitiveBrowserCaches();
      }

      const loginRes = await invokeRawFetch(input, {
        ...init,
        credentials: init?.credentials || (isRequestInstance ? input.credentials : undefined) || 'include',
      });
      if (loginRes.ok) {
        try {
          const cloned = loginRes.clone();
          const json = await cloned.json();
          const token = json?.data?.token;
          const csrfToken = json?.data?.csrfToken || loginRes.headers?.get?.('X-CSRF-Token') || '';
          const actor = json?.data?.actor;
          if (typeof token === 'string' && token.length > 0) {
            await applyAuthenticatedSession(
              {
                token,
                csrfToken,
                sessionId: json?.data?.sessionId || actor?.sessionId,
                userId: actor?.userId,
                organizationId: actor?.organizationId,
                role: actor?.role,
                baseRole: actor?.baseRole,
              },
              suppliedPrincipalKey
            );
          }
        } catch {
          // ignore parse error
        }
      } else {
        activeSession = null;
        activePrincipalKey = null;
      }
      return loginRes;
    }

    // Handle /api/v1/auth/logout directly without calling ensureSession(), supporting both in-memory and cookie-only sessions
    if (urlStr.includes('/api/v1/auth/logout')) {
      const logoutHeaders = new Headers(isRequestInstance ? input.headers : undefined);
      if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => logoutHeaders.set(key, value));
      }
      if (activeSession?.token && !logoutHeaders.has('Authorization')) {
        logoutHeaders.set('Authorization', `Bearer ${activeSession.token}`);
      }
      if (activeSession?.csrfToken && !logoutHeaders.has('X-CSRF-Token')) {
        logoutHeaders.set('X-CSRF-Token', activeSession.csrfToken);
      }
      try {
        const logoutRes = await invokeRawFetch(input, {
          ...init,
          method: init?.method || (isRequestInstance ? input.method : 'POST') || 'POST',
          headers: logoutHeaders,
          credentials: init?.credentials || (isRequestInstance ? input.credentials : undefined) || 'include',
        });
        return logoutRes;
      } finally {
        transitionEpoch += 1;
        activeSession = null;
        activePrincipalKey = null;
        explicitlyLoggedOut = true;
        await purgeSensitiveBrowserCaches();
      }
    }

    if (!isProtectedApiRoute(urlStr)) {
      return invokeRawFetch(input, init);
    }

    if (explicitlyLoggedOut) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'SESSION_REVOKED_OR_LOGGED_OUT',
            message: 'Cannot execute protected API request: session was explicitly logged out and revoked.',
          },
        }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const session = await ensureSession();
    if (callerSignal?.aborted) {
      throw callerSignal.reason || new DOMException('The operation was aborted.', 'AbortError');
    }

    if (!session) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'SESSION_BOOTSTRAP_FAILED',
            message: 'Cannot execute protected API request: session authentication bootstrap failed or timed out.',
          },
        }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const mergedHeaders = new Headers(isRequestInstance ? input.headers : undefined);
    if (init?.headers) {
      const overrideHeaders = new Headers(init.headers);
      overrideHeaders.forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    if (!mergedHeaders.has('Authorization')) {
      mergedHeaders.set('Authorization', `Bearer ${session.token}`);
    }
    if (session.csrfToken && !mergedHeaders.has('X-CSRF-Token')) {
      mergedHeaders.set('X-CSRF-Token', session.csrfToken);
    }

    let response: Response;
    if (isRequestInstance && !init) {
      const authedRequest = new Request(input, {
        headers: mergedHeaders,
        credentials: input.credentials || 'include',
      });
      response = await invokeRawFetch(authedRequest);
    } else {
      const nextInit: RequestInit = {
        ...init,
        headers: mergedHeaders,
        credentials: init?.credentials || (isRequestInstance ? input.credentials : undefined) || 'include',
      };
      response = await invokeRawFetch(input, nextInit);
    }

    if (urlStr.includes('/api/v1/auth/switch-role') && response.ok) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (data?.success && data?.data?.token) {
          const updatedActor = data.data.currentActor;
          activeSession = {
            ...session,
            token: data.data.token,
            csrfToken: data.data.csrfToken || session.csrfToken,
            role: updatedActor?.role || session.role,
            baseRole: updatedActor?.baseRole || session.baseRole,
          };
          await purgeSensitiveBrowserCaches();
        }
      } catch {
        // ignore clone parse failure
      }
    }

    return response;
  };

  return {
    apiFetch,
    ensureSession,
    loginWithIdToken,
    getActiveSession: () => activeSession,
    clearSession: () => {
      transitionEpoch += 1;
      activeSession = null;
      activePrincipalKey = null;
      explicitlyLoggedOut = true;
      void purgeSensitiveBrowserCaches();
    },
    getLoginCallCount: () => loginCallCount,
    getProtectionStatus: () => protectionStatus,
    setProtectionStatus: (status: FetchProtectionStatus) => {
      protectionStatus = status;
    },
  };
}

/**
 * Inspects the `fetch` descriptor on the target object (`window` or prototype) and installs
 * the session-aware wrapper ONLY if the descriptor permits safe redefinition.
 * Never throws `TypeError: Cannot set property fetch of #<Window> which has only a getter`.
 * Records the protection status on the controller so non-configurable environments explicitly
 * flag `fallbackRequired: true` and use `appFetch` / `controller.apiFetch` without dropping security.
 */
export function installDescriptorSafeFetch(
  target: any,
  controller: ApiClientController
): FetchProtectionStatus {
  const ownDesc = Object.getOwnPropertyDescriptor(target, 'fetch');
  const protoDesc =
    !ownDesc && Object.getPrototypeOf(target)
      ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'fetch')
      : undefined;
  const desc = ownDesc || protoDesc;

  if (desc && desc.configurable === false && !desc.writable && !desc.set) {
    const status: FetchProtectionStatus = {
      installedOnGlobal: false,
      descriptorMode: 'non_configurable_locked',
      fallbackRequired: true,
    };
    controller.setProtectionStatus(status);
    return status;
  }

  try {
    if (desc && typeof desc.get === 'function' && !desc.writable) {
      if (desc.configurable === false) {
        const status: FetchProtectionStatus = {
          installedOnGlobal: false,
          descriptorMode: 'non_configurable_locked',
          fallbackRequired: true,
        };
        controller.setProtectionStatus(status);
        return status;
      }
      Object.defineProperty(target, 'fetch', {
        get() {
          return controller.apiFetch;
        },
        configurable: true,
        enumerable: desc.enumerable ?? true,
      });
      const status: FetchProtectionStatus = {
        installedOnGlobal: true,
        descriptorMode: 'configurable_getter',
        fallbackRequired: false,
      };
      controller.setProtectionStatus(status);
      return status;
    }

    Object.defineProperty(target, 'fetch', {
      value: controller.apiFetch,
      configurable: true,
      writable: true,
      enumerable: desc?.enumerable ?? true,
    });
    const status: FetchProtectionStatus = {
      installedOnGlobal: true,
      descriptorMode: 'writable_value',
      fallbackRequired: false,
    };
    controller.setProtectionStatus(status);
    return status;
  } catch {
    const status: FetchProtectionStatus = {
      installedOnGlobal: false,
      descriptorMode: 'non_configurable_locked',
      fallbackRequired: true,
    };
    controller.setProtectionStatus(status);
    return status;
  }
}
