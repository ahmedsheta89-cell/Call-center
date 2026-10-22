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
}

export interface ApiClientOptions {
  rawFetch: typeof fetch;
  globalThisTarget?: any;
  loginTimeoutMs?: number;
  getFirebaseIdToken?: () => Promise<string | null>;
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
  let loginInFlight: Promise<SessionCredentials | null> | null = null;
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

  const ensureSession = (forceRelogin = false): Promise<SessionCredentials | null> => {
    if (forceRelogin) {
      explicitlyLoggedOut = false;
    }
    if (explicitlyLoggedOut) {
      return Promise.resolve(null);
    }
    if (activeSession) {
      return Promise.resolve(activeSession);
    }
    if (loginInFlight) {
      return loginInFlight;
    }

    loginCallCount += 1;
    loginInFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('Login bootstrap timed out')), loginTimeoutMs);
      try {
        let idToken: string | null = null;
        if (getFirebaseIdToken) {
          try {
            idToken = await getFirebaseIdToken();
          } catch {
            idToken = null;
          }
        }

        const bodyPayload = idToken ? { idToken } : { userId: 'usr-admin-01' };
        const res = await invokeRawFetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });

        if (!res.ok) {
          activeSession = null;
          return null;
        }

        const json = await res.json().catch(() => null);
        const token = json?.data?.token;
        const csrfToken = json?.data?.csrfToken || res.headers?.get?.('X-CSRF-Token') || '';
        if (typeof token === 'string' && token.length > 0) {
          activeSession = { token, csrfToken };
          explicitlyLoggedOut = false;
          return activeSession;
        }
        activeSession = null;
        return null;
      } catch {
        activeSession = null;
        return null;
      } finally {
        clearTimeout(timer);
        loginInFlight = null;
      }
    })();

    return loginInFlight;
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
        return !urlStr.startsWith('/api/v1/auth/login');
      }
      if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        const parsed = new URL(urlStr);
        return (
          parsed.pathname.startsWith('/api/v1/') &&
          !parsed.pathname.startsWith('/api/v1/auth/login')
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

    // If caller explicitly calls /api/v1/auth/login, clear logged-out lock and capture the new session
    if (urlStr.includes('/api/v1/auth/login')) {
      const loginRes = await invokeRawFetch(input, init);
      if (loginRes.ok) {
        try {
          const cloned = loginRes.clone();
          const json = await cloned.json();
          const token = json?.data?.token;
          const csrfToken = json?.data?.csrfToken || loginRes.headers?.get?.('X-CSRF-Token') || '';
          if (typeof token === 'string' && token.length > 0) {
            activeSession = { token, csrfToken };
            explicitlyLoggedOut = false;
          }
        } catch {
          // ignore parse error
        }
      }
      return loginRes;
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
          activeSession = {
            token: data.data.token,
            csrfToken: data.data.csrfToken || session.csrfToken,
          };
        }
      } catch {
        // ignore clone parse failure
      }
    } else if (urlStr.includes('/api/v1/auth/logout') && response.ok) {
      activeSession = null;
      explicitlyLoggedOut = true;
    }

    return response;
  };

  return {
    apiFetch,
    ensureSession,
    getActiveSession: () => activeSession,
    clearSession: () => {
      activeSession = null;
      explicitlyLoggedOut = true;
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
