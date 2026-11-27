# OmniFlow OS — Local Authentication & Authorization Architecture
**Project Identity:** `OMNIFLOW_OS`  
**Security Module:** `server/core/localAuth.ts` & `server/core/identity.ts`  
**Specification:** Local-First Zero-Cost Identity Architecture  

---

## 1. Overview & Architectural Goals

In enterprise contact centers, local-first environments must not sacrifice identity security for local development convenience. OmniFlow OS enforces a dual identity architecture:
1. **Cloud-Connected Mode (Optional):** Validates Firebase ID tokens via `adminAuth.verifyIdToken(token, true)` with project audience, issuer, expiration, and verified email binding.
2. **Local-First Zero-Cost Mode (Default):** Functions 100% offline without Firebase, Auth0, or any external identity provider, utilizing a self-contained local Owner bootstrap, scrypt password hashing, and server-side HMAC session management.

---

## 2. Local Owner Bootstrap Lifecycle

To eliminate hardcoded passwords, default credentials, or static installation secrets, OmniFlow OS implements an automated, cryptographically secure first-run bootstrap:

### 2.1 State 1: `BOOTSTRAP_PENDING`
- Upon cold boot without an existing `.local_owner_auth.json` in `F:\Dev_Workspace\Data\OMNIFLOW_OS\`:
  1. The server checks for `F:\Dev_Workspace\Data\OMNIFLOW_OS\.owner_bootstrap_token`.
  2. If missing, it generates a 256-bit CSPRNG token (`crypto.randomBytes(32).toString('hex')`).
  3. Writes the token exclusively to disk (`wx` flag, mode `0o600`).
  4. Exposes `GET /api/v1/auth/local-owner/status` which returns:
     ```json
     { "success": true, "data": { "configured": false, "status": "BOOTSTRAP_PENDING" } }
     ```

### 2.2 State 2: One-Time Provisioning (`POST /api/v1/auth/local-owner/bootstrap`)
- The operator reads the one-time token from the filesystem and submits:
  ```json
  {
    "bootstrapToken": "<64_hex_characters>",
    "username": "localowner",
    "password": "<ComplexPassword#2026>",
    "email": "owner@omniflow.local",
    "fullName": "System Owner Administrator"
  }
  ```
- **Validation Steps:**
  1. Constant-time token comparison: `crypto.timingSafeEqual` prevents timing attacks.
  2. Password complexity enforcement: Minimum 10 characters, at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character.
  3. Key Derivation: Generates a 32-byte CSPRNG salt and computes an scrypt hash:
     - $N = 16384$ (CPU/memory cost parameter)
     - $r = 8$ (Block size parameter)
     - $p = 1$ (Parallelization parameter)
     - $\text{keyLen} = 64$ bytes (512 bits output)
  4. Atomic Storage: Credentials written to `.local_owner_auth.json` atomically via `.tmp` write and rename.
  5. Destruction: The `.owner_bootstrap_token` file is immediately deleted from disk.
  6. User Provisioning: Updates `db.users` ensuring `usr-owner-01` has authoritative role `Owner` and `isActive: true`.

---

## 3. Local Owner Authentication & Session Management

### 3.1 Authentication Endpoint (`POST /api/v1/auth/local-owner/login`)
- Accepts `{ "username": "...", "password": "...", "ttlMs": 43200000 }`.
- Extracts client IP address and enforces brute-force protection.
- Validates password using `crypto.timingSafeEqual` on the scrypt output.
- On success:
  - Generates a unique session ID: `sess-<24_hex_chars>`.
  - Derives a session-bound CSRF token: `HMAC-SHA256(secret, "csrf:" + jti)`.
  - Signs an `omf1.<payload>.<sig>` token using server HMAC secret.
  - Sets HttpOnly, SameSite cookie (`omniflow_session`).
  - Emits an immutable audit record: `auth.local_owner_session_issued`.

### 3.2 Brute-Force Rate Limiting Defense
- Tracked per client IP in a 15-minute sliding window.
- Maximum 5 failed attempts allowed.
- On the 6th failed attempt:
  - Rejection with HTTP 429 `TOO_MANY_FAILED_ATTEMPTS`.
  - Blocks further authentication requests from that IP for 15 minutes.
  - Logs `auth.local_owner_failed` audit events.

---

## 4. Anti-Spoofing & Privilege Escalation Defenses

### 4.1 Loopback Isolation
- In previous development builds, `OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN === 'true'` allowed arbitrary logins from `127.0.0.1` without a password.
- **Hardened Invariant:** `allowLocalTestLogin` is restricted strictly to `process.env.NODE_ENV === 'test'`. In `development` or `production` runtime, loopback unauthenticated calls return HTTP 401.

### 4.2 Untrusted Header Neutralization
- The authentication middleware (`authenticateApiRequest`) inspects every authenticated request:
  - Header `x-user-role` cannot override session role. Conflicting values return HTTP 403 `ROLE_SPOOFING_DENIED`.
  - Header `x-organization-id` cannot override session tenant. Conflicting values return HTTP 403 `TENANT_SPOOFING_DENIED`.
  - Header `x-user-id` cannot override session user. Conflicting values return HTTP 403 `USER_SPOOFING_DENIED`.

### 4.3 Session Demotion Guard
- On every request, `verifySessionToken` verifies:
  1. User `isActive === true`.
  2. Organization `isActive === true`.
  3. Base role rank $\ge$ active role rank.
  4. If user's base role was demoted in `db.users` while session is active, the session is instantly revoked and the request returns HTTP 403 `SESSION_ROLE_INVALIDATED_BY_DEMOTION`.

---

## 5. Verification Matrix

| Verification ID | Attack / Test Scenario | Expected Outcome | Actual Result |
| :--- | :--- | :--- | :--- |
| **AUTH-SEC-01** | First run without credentials | Returns `BOOTSTRAP_PENDING`, writes 256-bit token | **PASS** |
| **AUTH-SEC-02** | Bootstrap with weak password (`short`) | Rejected with HTTP 400 `WEAK_PASSWORD` | **PASS** |
| **AUTH-SEC-03** | Bootstrap with wrong token | Rejected with HTTP 400 `INVALID_BOOTSTRAP_TOKEN` | **PASS** |
| **AUTH-SEC-04** | Valid bootstrap completion | Token file deleted, scrypt hash created, status `CONFIGURED` | **PASS** |
| **AUTH-SEC-05** | Login with wrong password | Constant-time check fails, returns HTTP 401 | **PASS** |
| **AUTH-SEC-06** | 5 consecutive wrong passwords | 6th attempt blocked with HTTP 429 `TOO_MANY_FAILED_ATTEMPTS` | **PASS** |
| **AUTH-SEC-07** | Loopback call without credentials | Rejected with HTTP 401 `AUTH_TOKEN_REQUIRED` | **PASS** |
| **AUTH-SEC-08** | Client spoofing `x-user-role: Owner` | Rejected with HTTP 403 `ROLE_SPOOFING_DENIED` | **PASS** |
| **AUTH-SEC-09** | Tampered session token signature | Rejected with HTTP 401 `INVALID_TOKEN_SIGNATURE` | **PASS** |
