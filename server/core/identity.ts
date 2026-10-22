/**
 * @file server/core/identity.ts
 * Server-Verified Cryptographic Session, Firebase ID Token & CSRF Protection Engine (Phase 4.2)
 *
 * Enforces:
 * 1. Firebase ID Token verification via `adminAuth.verifyIdToken(idToken, true)` (mandatory in production),
 *    strict `aud`/`iss`/`exp` validation, primary `uid`/`firebaseUid` binding, and `email_verified === true`
 *    requirement before binding an existing directory email to a Firebase UID.
 * 2. Fail-closed `SESSION_SECRET` validation in production (minimum 32-char high-entropy secret).
 * 3. HMAC-SHA256 signed session tokens (`omf1.<payload>.<sig>`) with constant-time verification and
 *    live User (`user.isActive`) + Organization (`org.isActive`) active checks on every request.
 * 4. Strict CSRF protection for cookie-authenticated state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`):
 *    - Mandatory `Origin` or `Referer` header (`403 CSRF_ORIGIN_REQUIRED` when both are absent).
 *    - Validation against a server-controlled Trusted Origins Allowlist (never trusting client `Host` or `X-Forwarded-Host`).
 *    - Constant-time verification of session-bound `x-csrf-token` (`hmac(secret, "csrf:" + jti)`).
 * 5. Complete rejection of untrusted client headers (`x-user-role`, `x-organization-id`, `x-user-id`).
 */

import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/store.ts';
import { ROLE_PERMISSIONS } from './rbac.ts';
import { AuditLogger } from './audit.ts';
import { adminAuth } from '../../src/lib/firebase-admin.ts';
import firebaseConfig from '../../firebase-applet-config.json';

export interface VerifiedActorContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  role: string;
  baseRole: string;
  name: string;
  email: string;
  phoneNumber: string;
  csrfToken: string;
  authenticated: boolean;
  authMethod: 'session_token' | 'session_cookie' | 'firebase_id_token';
}

export interface SessionTokenPayload {
  jti: string;
  sub: string;
  org: string;
  baseRole: string;
  activeRole: string;
  iat: number;
  exp: number;
}

interface ServerSessionRecord {
  jti: string;
  userId: string;
  organizationId: string;
  baseRole: string;
  activeRole: string;
  csrfToken: string;
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
}

const WEAK_SECRETS = new Set([
  'default',
  'secret',
  'changeme',
  'password',
  'omniflow-session-secret',
  '12345678901234567890123456789012',
]);

/**
 * Validates whether the provided session secret satisfies production security requirements.
 * In production mode, SESSION_SECRET must be explicitly configured and >= 32 characters.
 */
export function validateSessionSecretConfig(
  envMode: string = process.env.NODE_ENV || 'development',
  rawSecret: string | undefined = process.env.SESSION_SECRET
): { valid: boolean; reason?: string } {
  if (envMode === 'production') {
    if (!rawSecret || typeof rawSecret !== 'string' || rawSecret.trim().length === 0) {
      return { valid: false, reason: 'SESSION_SECRET environment variable is missing in production' };
    }
    const trimmed = rawSecret.trim();
    if (trimmed.length < 32) {
      return { valid: false, reason: 'SESSION_SECRET must be at least 32 characters in production' };
    }
    if (WEAK_SECRETS.has(trimmed.toLowerCase())) {
      return { valid: false, reason: 'SESSION_SECRET uses a forbidden weak/default value' };
    }
  }
  return { valid: true };
}

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

function getActiveHmacSecret(): string {
  const check = validateSessionSecretConfig();
  if (!check.valid) {
    throw Object.assign(new Error(check.reason || 'Invalid SESSION_SECRET configuration'), {
      status: 503,
      code: 'SESSION_SECRET_MISCONFIGURED',
    });
  }
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_DEV_SECRET;
}

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const activeSessions = new Map<string, ServerSessionRecord>();

export const actorContextStorage = new AsyncLocalStorage<VerifiedActorContext>();

const unauthenticatedFallbackContext: VerifiedActorContext = {
  sessionId: 'unauthenticated',
  userId: 'anonymous',
  organizationId: 'unauthenticated',
  role: 'None',
  baseRole: 'None',
  name: 'Unauthenticated Caller',
  email: '',
  phoneNumber: '',
  csrfToken: '',
  authenticated: false,
  authMethod: 'session_token',
};

/**
 * Proxy exposing the isolated AsyncLocalStorage VerifiedActorContext for the current request.
 */
export const currentActor: VerifiedActorContext = new Proxy(unauthenticatedFallbackContext, {
  get(_target, prop: keyof VerifiedActorContext) {
    const store = actorContextStorage.getStore();
    if (!store) {
      return unauthenticatedFallbackContext[prop];
    }
    return store[prop];
  },
  set(_target, prop: keyof VerifiedActorContext, value: any) {
    const store = actorContextStorage.getStore();
    if (store) {
      (store as any)[prop] = value;
      return true;
    }
    return false;
  },
});

function signPayloadB64(payloadB64: string): string {
  const secret = getActiveHmacSecret();
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function deriveCsrfToken(jti: string): string {
  const secret = getActiveHmacSecret();
  return crypto.createHmac('sha256', secret).update(`csrf:${jti}`).digest('base64url');
}

type FirebaseVerifierFn = (token: string, checkRevoked?: boolean) => Promise<any>;
let testFirebaseVerifierOverride: FirebaseVerifierFn | null = null;

/**
 * Allows automated integration tests (in non-production mode only) to inject a deterministic
 * Firebase token verifier while testing the full HTTP `/api/v1/auth/login` route.
 * Ignored completely if `NODE_ENV === 'production'`.
 */
export function setFirebaseVerifierForTesting(verifier: FirebaseVerifierFn | null): void {
  if (process.env.NODE_ENV === 'production') {
    testFirebaseVerifierOverride = null;
    return;
  }
  testFirebaseVerifierOverride = verifier;
}

/**
 * Verifies a Firebase ID Token using Firebase Admin SDK (`adminAuth.verifyIdToken(idToken, true)`),
 * enforcing project audience, issuer, expiration, primary `uid` / `firebaseUid` binding,
 * `email_verified === true` on initial email binding, and active User & Organization checks.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  customVerifier?: FirebaseVerifierFn
): Promise<{
  uid: string;
  email: string;
  userId: string;
  organizationId: string;
}> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw Object.assign(new Error('Firebase ID token is required'), {
      status: 401,
      code: 'FIREBASE_ID_TOKEN_REQUIRED',
    });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const verifier: FirebaseVerifierFn =
    (!isProd && (customVerifier || testFirebaseVerifierOverride)) ||
    ((tok: string, rev?: boolean) => adminAuth.verifyIdToken(tok, rev ?? true));

  let decoded: any;
  try {
    decoded = await verifier(idToken.trim(), true);
  } catch (err: any) {
    const msg = err?.message || 'Firebase ID token verification failed';
    const isExpired = msg.toLowerCase().includes('expired') || err?.code === 'auth/id-token-expired';
    const isUnavailable =
      err?.code === 'auth/internal-error' ||
      msg.toLowerCase().includes('network') ||
      msg.toLowerCase().includes('unavailable');
    throw Object.assign(new Error(msg), {
      status: isUnavailable ? 503 : 401,
      code: isUnavailable
        ? 'FIREBASE_AUTH_UNAVAILABLE'
        : isExpired
        ? 'FIREBASE_TOKEN_EXPIRED'
        : 'INVALID_FIREBASE_ID_TOKEN',
    });
  }

  const expectedProjectId = firebaseConfig.projectId;
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;

  if (!decoded || typeof decoded !== 'object' || typeof decoded.uid !== 'string' || decoded.uid.trim().length === 0) {
    throw Object.assign(new Error('Decoded Firebase token missing valid uid'), {
      status: 401,
      code: 'INVALID_FIREBASE_TOKEN_CLAIMS',
    });
  }

  if (decoded.aud !== expectedProjectId) {
    throw Object.assign(
      new Error(`Firebase token audience [${decoded.aud}] does not match project [${expectedProjectId}]`),
      { status: 401, code: 'FIREBASE_TOKEN_AUDIENCE_MISMATCH' }
    );
  }

  if (decoded.iss !== expectedIssuer) {
    throw Object.assign(
      new Error(`Firebase token issuer [${decoded.iss}] does not match [${expectedIssuer}]`),
      { status: 401, code: 'FIREBASE_TOKEN_ISSUER_MISMATCH' }
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof decoded.exp !== 'number' || decoded.exp < nowSec) {
    throw Object.assign(new Error('Firebase ID token has expired'), {
      status: 401,
      code: 'FIREBASE_TOKEN_EXPIRED',
    });
  }

  const cleanUid = decoded.uid.trim();

  // 1. Primary lookup: match by authoritative user.id or bound user.firebaseUid
  let matchedUser =
    db.users.get(cleanUid) ||
    Array.from(db.users.values()).find((u) => u.firebaseUid && u.firebaseUid === cleanUid);

  // 2. Secondary lookup (initial provisioning link): match by email ONLY if email_verified === true
  if (!matchedUser) {
    const emailLower = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    if (emailLower) {
      if (decoded.email_verified !== true) {
        throw Object.assign(
          new Error(`Firebase identity email [${emailLower}] is not verified (email_verified !== true)`),
          { status: 403, code: 'FIREBASE_EMAIL_NOT_VERIFIED' }
        );
      }
      const candidate = Array.from(db.users.values()).find(
        (u) => u.email.toLowerCase() === emailLower
      );
      if (candidate) {
        if (candidate.firebaseUid && candidate.firebaseUid !== cleanUid) {
          throw Object.assign(
            new Error(`Directory user [${candidate.id}] is already bound to a different Firebase UID`),
            { status: 403, code: 'FIREBASE_UID_CONFLICT' }
          );
        }
        candidate.firebaseUid = cleanUid;
        matchedUser = candidate;
      }
    }
  }

  if (!matchedUser || !matchedUser.isActive) {
    throw Object.assign(
      new Error(`Verified Firebase identity [${cleanUid}] is not provisioned or active in organization directory`),
      { status: 403, code: 'FIREBASE_USER_NOT_PROVISIONED' }
    );
  }

  const org = db.organizations.get(matchedUser.organizationId);
  if (!org || !org.isActive) {
    throw Object.assign(
      new Error(`Organization [${matchedUser.organizationId}] is inactive or suspended`),
      { status: 403, code: 'ORG_INACTIVE_OR_DELETED' }
    );
  }

  return {
    uid: cleanUid,
    email: matchedUser.email,
    userId: matchedUser.id,
    organizationId: matchedUser.organizationId,
  };
}

/**
 * Issues a cryptographically signed session token for an authoritative user in `db.users`.
 */
export function issueSessionToken(options: {
  userId: string;
  activeRoleOverride?: string;
  ttlMs?: number;
  existingJti?: string;
}): {
  token: string;
  csrfToken: string;
  session: ServerSessionRecord;
  actor: VerifiedActorContext;
} {
  // Fail-closed check for SESSION_SECRET in production
  getActiveHmacSecret();

  const user = db.users.get(options.userId);
  if (!user || !user.isActive) {
    throw Object.assign(new Error(`User [${options.userId}] not found or inactive`), {
      status: 401,
      code: 'USER_NOT_FOUND_OR_INACTIVE',
    });
  }

  const org = db.organizations.get(user.organizationId);
  if (!org || !org.isActive) {
    throw Object.assign(new Error(`Organization [${user.organizationId}] not found or inactive`), {
      status: 401,
      code: 'ORG_NOT_FOUND_OR_INACTIVE',
    });
  }

  const baseRole = user.role;
  const activeRole = options.activeRoleOverride || baseRole;
  if (!(activeRole in ROLE_PERMISSIONS)) {
    throw Object.assign(new Error(`Invalid role [${activeRole}]`), {
      status: 400,
      code: 'INVALID_ROLE',
    });
  }

  const now = Date.now();
  const ttl = options.ttlMs !== undefined ? options.ttlMs : DEFAULT_TTL_MS;
  const jti = options.existingJti || `sess-${crypto.randomBytes(12).toString('hex')}`;
  const csrfToken = deriveCsrfToken(jti);

  const payload: SessionTokenPayload = {
    jti,
    sub: user.id,
    org: user.organizationId,
    baseRole,
    activeRole,
    iat: now,
    exp: now + ttl,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = signPayloadB64(payloadB64);
  const token = `omf1.${payloadB64}.${signature}`;

  const sessionRecord: ServerSessionRecord = {
    jti,
    userId: user.id,
    organizationId: user.organizationId,
    baseRole,
    activeRole,
    csrfToken,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    revoked: false,
  };
  activeSessions.set(jti, sessionRecord);

  const actor: VerifiedActorContext = {
    sessionId: jti,
    userId: user.id,
    organizationId: user.organizationId,
    role: activeRole,
    baseRole,
    name: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber || '01018108979',
    csrfToken,
    authenticated: true,
    authMethod: 'session_token',
  };

  return { token, csrfToken, session: sessionRecord, actor };
}

/**
 * Verifies an `omf1.<payload>.<sig>` token and resolves the authoritative User & Organization.
 */
export function verifySessionToken(
  rawToken: string,
  authMethod: 'session_token' | 'session_cookie' = 'session_token'
): VerifiedActorContext {
  getActiveHmacSecret();

  if (!rawToken || typeof rawToken !== 'string') {
    throw Object.assign(new Error('Authentication token is missing'), {
      status: 401,
      code: 'AUTH_TOKEN_REQUIRED',
    });
  }

  const parts = rawToken.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'omf1') {
    throw Object.assign(new Error('Malformed authentication token format'), {
      status: 401,
      code: 'INVALID_TOKEN_FORMAT',
    });
  }

  const [, payloadB64, providedSig] = parts;
  const expectedSig = signPayloadB64(payloadB64);

  const providedBuf = Buffer.from(providedSig, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    throw Object.assign(new Error('Token cryptographic signature verification failed'), {
      status: 401,
      code: 'INVALID_TOKEN_SIGNATURE',
    });
  }

  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    throw Object.assign(new Error('Invalid token payload encoding'), {
      status: 401,
      code: 'INVALID_TOKEN_PAYLOAD',
    });
  }

  const now = Date.now();
  if (!payload.exp || now > payload.exp) {
    throw Object.assign(new Error('Authentication session token has expired'), {
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
  }

  const sessionRecord = activeSessions.get(payload.jti);
  if (!sessionRecord || sessionRecord.revoked) {
    throw Object.assign(new Error('Session has been revoked or does not exist on server'), {
      status: 401,
      code: 'SESSION_REVOKED_OR_UNKNOWN',
    });
  }

  if (now > sessionRecord.expiresAt) {
    throw Object.assign(new Error('Server session has expired'), {
      status: 401,
      code: 'SESSION_EXPIRED',
    });
  }

  const user = db.users.get(sessionRecord.userId);
  if (!user || !user.isActive) {
    throw Object.assign(new Error('Authenticated user no longer exists or is disabled'), {
      status: 401,
      code: 'USER_INACTIVE_OR_DELETED',
    });
  }

  if (user.organizationId !== sessionRecord.organizationId) {
    throw Object.assign(new Error('User organization binding mismatch'), {
      status: 401,
      code: 'ORG_BINDING_MISMATCH',
    });
  }

  const org = db.organizations.get(sessionRecord.organizationId);
  if (!org || !org.isActive) {
    throw Object.assign(new Error('Authenticated organization is inactive or suspended'), {
      status: 401,
      code: 'ORG_INACTIVE_OR_DELETED',
    });
  }

  return {
    sessionId: sessionRecord.jti,
    userId: user.id,
    organizationId: user.organizationId,
    role: sessionRecord.activeRole,
    baseRole: user.role,
    name: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber || '01018108979',
    csrfToken: sessionRecord.csrfToken,
    authenticated: true,
    authMethod,
  };
}

export function revokeSessionToken(jti: string): boolean {
  const rec = activeSessions.get(jti);
  if (!rec) return false;
  rec.revoked = true;
  return true;
}

/**
 * Formats Set-Cookie header with HttpOnly, Path=/, Max-Age, and CHIPS Partitioned attribute on HTTPS.
 */
export function formatSessionCookie(req: Request, token: string, maxAgeSec = 43200): string {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSiteAndSecure = isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
  return `omniflow_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${sameSiteAndSecure}; Max-Age=${maxAgeSec}`;
}

/**
 * Formats matching Set-Cookie header to clear the session cookie upon logout.
 */
export function formatClearSessionCookie(req: Request): string {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSiteAndSecure = isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
  return `omniflow_session=; Path=/; HttpOnly; ${sameSiteAndSecure}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      result[k] = decodeURIComponent(v);
    }
  }
  return result;
}

function extractRawToken(req: Request): { token: string | null; method: 'session_token' | 'session_cookie' } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return { token: authHeader.slice('Bearer '.length).trim(), method: 'session_token' };
  }

  const cookies = parseCookies(req.headers.cookie);
  if (cookies.omniflow_session) {
    return { token: cookies.omniflow_session, method: 'session_cookie' };
  }

  if (req.path === '/stream' && typeof req.query.sessionToken === 'string') {
    return { token: req.query.sessionToken, method: 'session_token' };
  }

  return { token: null, method: 'session_token' };
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const DEFAULT_CLOUD_RUN_ORIGINS = [
  'https://ais-dev-gqer3k5difwfcjdekzfmz2-100774856489.europe-west1.run.app',
  'https://ais-pre-gqer3k5difwfcjdekzfmz2-100774856489.europe-west1.run.app',
];

/**
 * Computes the server-authoritative allowlist of trusted Origins for CSRF validation.
 * Never trusts client-supplied `Host` or `X-Forwarded-Host` headers.
 */
export function getTrustedOrigins(req: Request): Set<string> {
  const allowed = new Set<string>(DEFAULT_CLOUD_RUN_ORIGINS);

  const envUrls = [process.env.APP_URL, process.env.SHARED_APP_URL];
  for (const rawUrl of envUrls) {
    if (rawUrl && typeof rawUrl === 'string') {
      try {
        allowed.add(new URL(rawUrl.trim()).origin.toLowerCase());
      } catch {
        // ignore invalid URL
      }
    }
  }

  if (process.env.ALLOWED_ORIGINS) {
    for (const part of process.env.ALLOWED_ORIGINS.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        try {
          allowed.add(new URL(trimmed).origin.toLowerCase());
        } catch {
          // ignore
        }
      }
    }
  }

  // In non-production local development/test mode, allow loopback origins bound to the actual listening socket port
  if (process.env.NODE_ENV !== 'production') {
    const localPort = req.socket?.localPort || Number(process.env.PORT) || 3000;
    allowed.add(`http://127.0.0.1:${localPort}`);
    allowed.add(`http://localhost:${localPort}`);
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://localhost:3000');
  }

  return allowed;
}

/**
 * Verifies CSRF protection for state-changing requests authenticated via Cookie (`session_cookie`).
 * Enforces:
 * 1. Mandatory presence of `Origin` or `Referer` header (`403 CSRF_ORIGIN_REQUIRED` if both missing).
 * 2. Strict validation of `Origin`/`Referer` against the server-controlled `getTrustedOrigins(req)` allowlist
 *    (immune to `Host` and `X-Forwarded-Host` header spoofing).
 * 3. Constant-time comparison of `x-csrf-token` header against the session-specific `verifiedActor.csrfToken`.
 */
function verifyCsrfForCookieMutation(
  req: Request,
  verifiedActor: VerifiedActorContext
): { valid: boolean; code?: string; message?: string } {
  if (verifiedActor.authMethod !== 'session_cookie' || !MUTATING_METHODS.has(req.method.toUpperCase())) {
    return { valid: true };
  }

  const originHeader = (req.headers.origin || req.headers.referer) as string | undefined;
  if (!originHeader || typeof originHeader !== 'string' || originHeader.trim().length === 0) {
    return {
      valid: false,
      code: 'CSRF_ORIGIN_REQUIRED',
      message: 'Cookie-authenticated mutating request requires a valid Origin or Referer header.',
    };
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originHeader.trim());
  } catch {
    return {
      valid: false,
      code: 'CSRF_INVALID_ORIGIN',
      message: 'Malformed Origin or Referer header on cookie-authenticated mutation.',
    };
  }

  const normalizedOrigin = parsedOrigin.origin.toLowerCase();
  const trustedOrigins = getTrustedOrigins(req);
  if (!trustedOrigins.has(normalizedOrigin)) {
    return {
      valid: false,
      code: 'CSRF_ORIGIN_MISMATCH',
      message: `Cross-site request blocked: Origin [${normalizedOrigin}] is not in the server's trusted origins allowlist.`,
    };
  }

  const providedCsrf = (req.headers['x-csrf-token'] as string | undefined)?.trim();
  if (!providedCsrf || !verifiedActor.csrfToken) {
    return {
      valid: false,
      code: 'CSRF_TOKEN_MISSING',
      message: 'Cookie-authenticated mutating request requires a valid x-csrf-token header.',
    };
  }

  const a = Buffer.from(providedCsrf, 'utf-8');
  const b = Buffer.from(verifiedActor.csrfToken, 'utf-8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      valid: false,
      code: 'CSRF_TOKEN_INVALID',
      message: 'CSRF token verification failed (invalid or belongs to a different session).',
    };
  }

  return { valid: true };
}

const PUBLIC_UNAUTHENTICATED_PATHS = new Set([
  '/auth/login',
  '/platforms/download/android',
  '/platforms/download/windows',
]);

/**
 * Express Middleware enforcing Cryptographic Session Authentication, CSRF protection for cookies,
 * and blocking untrusted header spoofing (`x-user-role`, `x-organization-id`, `x-user-id`).
 */
export function authenticateApiRequest(req: Request, res: Response, next: NextFunction): void {
  if (PUBLIC_UNAUTHENTICATED_PATHS.has(req.path)) {
    next();
    return;
  }

  const { token, method } = extractRawToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_TOKEN_REQUIRED',
        message: 'Unauthenticated request rejected: valid Bearer session token or omniflow_session cookie is required.',
      },
    });
    return;
  }

  let verifiedActor: VerifiedActorContext;
  try {
    verifiedActor = verifySessionToken(token, method);
  } catch (err: any) {
    res.status(err?.status || 401).json({
      success: false,
      error: {
        code: err?.code || 'INVALID_AUTH_TOKEN',
        message: err?.message || 'Authentication token verification failed.',
      },
    });
    return;
  }

  // Enforce CSRF protection on cookie-authenticated state-changing requests
  const csrfCheck = verifyCsrfForCookieMutation(req, verifiedActor);
  if (!csrfCheck.valid) {
    AuditLogger.log({
      organizationId: verifiedActor.organizationId,
      actorId: verifiedActor.userId,
      actorType: 'user',
      action: 'security.csrf_blocked',
      entityType: 'request',
      entityId: req.path,
      afterState: {
        code: csrfCheck.code,
        origin: req.headers.origin || req.headers.referer || 'none',
      },
    });
    res.status(403).json({
      success: false,
      error: {
        code: csrfCheck.code || 'CSRF_VIOLATION',
        message: csrfCheck.message || 'CSRF validation failed.',
      },
    });
    return;
  }

  // Detect and reject untrusted header spoofing attempts against verified identity
  const spoofedOrgHeader = req.headers['x-organization-id'] as string | undefined;
  if (spoofedOrgHeader && spoofedOrgHeader.trim() !== verifiedActor.organizationId) {
    AuditLogger.log({
      organizationId: verifiedActor.organizationId,
      actorId: verifiedActor.userId,
      actorType: 'user',
      action: 'security.tenant_spoofing_blocked',
      entityType: 'request',
      entityId: req.path,
      afterState: {
        authenticatedOrganizationId: verifiedActor.organizationId,
        spoofedOrganizationHeader: spoofedOrgHeader.trim(),
      },
    });
    res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_SPOOFING_DENIED',
        message: `Header x-organization-id [${spoofedOrgHeader.trim()}] conflicts with authenticated session organization [${verifiedActor.organizationId}].`,
      },
    });
    return;
  }

  const spoofedRoleHeader = req.headers['x-user-role'] as string | undefined;
  if (
    spoofedRoleHeader &&
    spoofedRoleHeader.trim().toLowerCase() !== verifiedActor.role.toLowerCase()
  ) {
    AuditLogger.log({
      organizationId: verifiedActor.organizationId,
      actorId: verifiedActor.userId,
      actorType: 'user',
      action: 'security.role_spoofing_blocked',
      entityType: 'request',
      entityId: req.path,
      afterState: {
        authenticatedRole: verifiedActor.role,
        spoofedRoleHeader: spoofedRoleHeader.trim(),
      },
    });
    res.status(403).json({
      success: false,
      error: {
        code: 'ROLE_SPOOFING_DENIED',
        message: `Untrusted header x-user-role [${spoofedRoleHeader.trim()}] cannot override verified session role [${verifiedActor.role}].`,
      },
    });
    return;
  }

  const spoofedUserHeader = req.headers['x-user-id'] as string | undefined;
  if (spoofedUserHeader && spoofedUserHeader.trim() !== verifiedActor.userId) {
    AuditLogger.log({
      organizationId: verifiedActor.organizationId,
      actorId: verifiedActor.userId,
      actorType: 'user',
      action: 'security.user_spoofing_blocked',
      entityType: 'request',
      entityId: req.path,
      afterState: {
        authenticatedUserId: verifiedActor.userId,
        spoofedUserHeader: spoofedUserHeader.trim(),
      },
    });
    res.status(403).json({
      success: false,
      error: {
        code: 'USER_SPOOFING_DENIED',
        message: `Untrusted header x-user-id [${spoofedUserHeader.trim()}] cannot override verified session user [${verifiedActor.userId}].`,
      },
    });
    return;
  }

  actorContextStorage.run(verifiedActor, () => next());
}

/**
 * Permanently closes legacy non-v1 user endpoints (`GET /api/users` and `POST /api/users/sync`)
 * with an explicit `410 Gone` JSON response without invoking `requireAuth`, `getUsers()`,
 * or `getOrCreateUser()`, and registers a fail-closed `/api` 404 JSON catch-all before any
 * Vite or production `index.html` SPA fallback can intercept `/api/*` paths.
 */
export function mountLegacyUserRouteClosuresAndApiFallback(router: {
  all: (path: any, handler: (req: Request, res: Response) => void) => any;
  use: (path: any, handler: (req: Request, res: Response) => void) => any;
}): void {
  const handleClosedLegacyUserRoute = (req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: {
        code: 'LEGACY_ROUTE_GONE',
        message: `Legacy endpoint ${req.method} ${req.originalUrl || req.path} is permanently closed. Use authenticated /api/v1 routes.`,
      },
    });
  };

  router.all(['/api/users', '/api/users/sync'], handleClosedLegacyUserRoute);
  router.use('/api/users', handleClosedLegacyUserRoute);

  router.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: `API route ${req.method} ${req.originalUrl || req.path} not found.`,
      },
    });
  });
}

