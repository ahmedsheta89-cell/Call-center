# PHASE 4 & 4.1 — Post-Fix Forensic Verification, Identity Trust, Durable Storage & Production Security Gate

- **Project:** OmniFlow AI Contact Center OS
- **Workspace Path:** `/app/applet`
- **Target GitHub Repository:** `https://github.com/ahmedsheta89-cell/Call-center.git`
- **Active Branch:** `fix/phase2-security-and-github-verification`
- **Audit Timestamp (UTC):** `2026-10-19T14:38:00Z`

---

## 1. Phase A — Actual Git State, Lineage & File Integrity (`VERIFIED`)

### 1.1 Git State & Commit Chain Verification
- **Command Executed:**
  ```bash
  pwd && git status -s && git branch -vv && git log -n 8 --format="%H | %h | %P | %ai | %s" && git remote -v
  ```
- **Verified Commit Chain Prior to Phase 4.1 Hardening Commit:**
  1. **Commit `480e8b8` (`HEAD` at Phase 4.1 entry):**
     - **Full SHA:** `480e8b83aea809bb53b3b2d4970ee353557c9c4d`
     - **Parent SHA:** `1d1488144f8f7fdbea5c1399e64cc2d86e6ff05e`
     - **Author & Date:** `Eng. Ahmed Sheta <ahmedsheta89@gmail.com> | 2026-10-19 13:46:41 +0000`
     - **Message:** `fix(ui): guard window.fetch descriptor in src/main.tsx and set SameSite=None; Secure session cookie for iframe preview`
     - **Changed Files (`git show --stat 480e8b8`):** `server.ts` (+24), `server/api/router.ts` (+10/-2), `src/main.tsx` (+47/-36)
  2. **Commit `1d14881` (Phase 4 Baseline Commit):**
     - **Full SHA:** `1d1488144f8f7fdbea5c1399e64cc2d86e6ff05e`
     - **Parent SHA (`origin/main`):** `05b8c79330a084eae8dc94644dce63b861790ace`
     - **Message:** `fix(phase4): HMAC-SHA256 session identity engine, untrusted header spoofing block, atomic staging restore & Phase 4 release readiness audit`
  3. **Container Lifecycle Note:**
     - As documented in Section 1.1 of the Phase 4 report, an overnight container hibernation between `2026-10-18T20:20Z` and `2026-10-19T06:33Z` recycled the ephemeral `.git` folder while preserving 100% of workspace files (verified via SHA-256 hashes). The repository was non-destructively re-anchored onto `origin/main` (`05b8c79330a084eae8dc94644dce63b861790ace`), producing commit `1d1488144f8f7fdbea5c1399e64cc2d86e6ff05e` followed by `480e8b83aea809bb53b3b2d4970ee353557c9c4d`.
- **Secret Scan (`git diff` & `origin/main..HEAD`):** `VERIFIED` — `CLEAN_DIFF_NO_SECRETS` (zero tokens, keys, or secrets in tracked files or commit diffs).

### 1.2 Authoritative SHA-256 Checksums (Phase 4.1 Final State)
| File Path | SHA-256 Hash | Status |
| :--- | :--- | :--- |
| `src/lib/apiClient.ts` | `cbc0bd50dd7a3dfbe3d0c0e7293753e1ce88f69bf2dccf46f9140e4740adfab3` | `VERIFIED` (Phase 4.1 Session Client & Descriptor Guard) |
| `src/main.tsx` | `b68028bec2c95e7640e29f8110b5e8aba6a7349e893b50e825e66569b19f5360` | `VERIFIED` (Clean Bootstrap via `apiClient.ts`) |
| `src/App.tsx` | `d570800c8ad6842cdab9edb05bded02e89de8a94e6b1f43ed25025f53479adf7` | `VERIFIED` (Removed Synthetic `200 OK` on Failed Calls) |
| `server.ts` | `df11f5e7a70222e99c2b35d09619c643f072b2193225923c18190e2c698505d9` | `VERIFIED` (Removed Inline HTML Script Monkey-Patch) |
| `server/core/identity.ts` | `c978226774f1e11ddf2204d53e654c77490a3e3a0b93128c36320d2ea3f12133` | `VERIFIED` (Firebase ID Token + `SESSION_SECRET` + CSRF Engine) |
| `server/api/router.ts` | `526b816bf2fdb1ff136d6892bb73c95352e2e777caeefe544e5b03f3293e2bbe` | `VERIFIED` (`POST /auth/login` Firebase Auth + Cookie Clear) |
| `server/db/store.ts` | `f590349b543dccc2184d07c17ce6820d2f0b4ca71bfe94dbf8a7fc8a15a81381` | `VERIFIED` (Atomic `fsync` & Transactional Staging Restore) |
| `DRAFT_firestore.rules` | `b9517acd2c8bdaa21ff52c762a29d01e1fdfc92d2b86c59f46849874e291c71d` | `VERIFIED` |
| `firestore.rules` | `c0f1f1a2bc1f0dec5c220dbf4327c74a0ab4a6c3433c871f9fafc611ff6ed660` | `VERIFIED` (Unmodified Live Rules) |
| `src/db/schema.ts` | `81e61098dcc98abeff3d98b6bfdefa76ee6ec3630ca42c131dd40b0f84200598` | `VERIFIED` (6 Tables / 81 Columns) |
| `server/test/run-enterprise-audit.ts` | `614b3b89a9e3259e284840ab6d35326eba8a667a5edad98cd1e53d8a1364edd8` | `VERIFIED` (Includes `[AUTH-05..07]` & `[FETCH-01]`) |

---

## 2. Phase B — Forensic Audit of `window.fetch` Fix (`480e8b8`) & Phase 4.1 Hardening (`VERIFIED`)

### 2.1 Root Cause of Original Error & Audit of Commit `480e8b8`
1. **Why `TypeError: Cannot set property fetch of #<Window> which has only a getter` occurred (`1d14881`):**
   - In the AI Studio preview iframe environment, `window.fetch` is defined with a getter descriptor (`{ get: [Function], set: undefined, configurable: true }`). Executing `window.fetch = async (...) => ...` in ES module strict mode throws `TypeError: Cannot set property fetch of #<Window> which has only a getter` at module evaluation time before React mounts.
2. **Forensic Defects Identified in Quick-Fix Commit `480e8b8`:**
   - **Defect 1 — Intrusive HTML `<head>` Script Injection (`server.ts` lines 47–70 in `480e8b8`):** `server.ts` injected an inline `<script>` via string replacement on `<head>` to run `Object.defineProperty(window, 'fetch', ...)` before Vite scripts. This duplicated descriptor logic across `server.ts` and `src/main.tsx` and would break under strict Content Security Policy (CSP).
   - **Defect 2 — Missing Timeout & Silent Failure Continuation (`src/main.tsx` lines 25–43 in `480e8b8`):** `ensureSessionToken()` had no `AbortController` timeout on `/api/v1/auth/login`, and if `/api/v1/auth/login` failed or returned `null`, `wrappedFetch` still forwarded the unauthenticated request to the backend instead of failing closed.
   - **Defect 3 — Synthetic `200 OK` Masking in `src/App.tsx` (`src/App.tsx` lines 610–621 & 627–645):**
     - In `handleExecuteModuleFunction`, the `catch` block recorded `status: '200 OK'` even when the network call failed, and `handleRoleChange` unconditionally called `setCurrentRole(role)` and logged `status: '200 OK'` before checking whether `POST /api/v1/auth/switch-role` returned `403 FORBIDDEN`.

### 2.2 Phase 4.1 Clean Architectural Solution (`src/lib/apiClient.ts`, `src/main.tsx`, `server.ts`, `src/App.tsx`)
1. **Removed Inline `<head>` Monkey-Patch from `server.ts`:** Restored `server.ts` to clean HTML serving without inline script injection.
2. **Dedicated Session-Aware Client (`src/lib/apiClient.ts`):**
   - Preserves native `Request`, `Headers`, `AbortSignal` (checking `callerSignal.aborted` before and during execution), and `this` binding (`rawFetch.call(globalThisTarget, input, init)`).
   - Coalesces concurrent pre-bootstrap `/api/v1/*` requests into **a single in-flight `POST /api/v1/auth/login` request** (`loginInFlight` singleton promise).
   - Enforces a deterministic timeout (`loginTimeoutMs`, default `6000ms`) via `AbortController`.
   - **Fails Closed (`HTTP 401 SESSION_BOOTSTRAP_FAILED`):** If session initialization fails or times out, protected `/api/v1/*` requests immediately receive an authentic `401 Unauthorized` response (`SESSION_BOOTSTRAP_FAILED`) rather than sending unauthenticated requests or hanging.
   - **Descriptor-Safe Global Installation (`installDescriptorSafeFetch`):** Inspects `Object.getOwnPropertyDescriptor(target, 'fetch')` and prototype descriptors. Handles writable value descriptors, configurable getter-only descriptors (iframe preview), and non-configurable locked descriptors without ever throwing a `TypeError`.
3. **Eliminated Synthetic `200 OK` Fallbacks in `src/App.tsx`:**
   - `handleExecuteModuleFunction` and `handleRoleChange` now inspect `res.ok` and `data?.success`. On `401`/`403`/`500` or network errors, `src/App.tsx` logs the real error status (`403 FORBIDDEN`, `NETWORK_ERROR`, etc.) and does **not** mutate `currentRole` when `POST /api/v1/auth/switch-role` is rejected.

### 2.3 Reproducible Verification of All 7 `window.fetch` Scenarios (`[FETCH-01]` in `server/test/run-enterprise-audit.ts`)
- **Scenario 1 (Normal writable `fetch`):** Wrapped and authenticated -> `VERIFIED`
- **Scenario 2 (Read-only configurable getter `fetch` on iframe `Window`):** Installed via getter descriptor without `TypeError` -> `VERIFIED`
- **Scenario 3 (Non-configurable locked `fetch`):** Safely detected (`installedOnGlobal: false, descriptorMode: 'non_configurable_locked'`) with zero `TypeError` -> `VERIFIED`
- **Scenario 4 (Failed `/api/v1/auth/login` returning `401`):** Protected call fails closed with `HTTP 401 (SESSION_BOOTSTRAP_FAILED)` -> `VERIFIED`
- **Scenario 5 (Timed-out `/api/v1/auth/login` exceeding `loginTimeoutMs`):** `AbortController` aborts login and fails closed with `HTTP 401` -> `VERIFIED`
- **Scenario 6 (10 concurrent `/api/v1/auth/me` calls before bootstrap completes):** All 10 coalesce into exactly `1` login call (`getLoginCallCount() === 1`) and all 10 succeed with `HTTP 200` -> `VERIFIED`
- **Scenario 7 (Authenticated request hitting `403 FORBIDDEN` RBAC denial):** Preserves exact `HTTP 403` status code without retry loop or fake `200 OK` -> `VERIFIED`

---

## 3. Phase C — Session Cookie, Iframe & CSRF Security Audit (`VERIFIED`)

### 3.1 Cookie Security Attributes (`formatSessionCookie` & `formatClearSessionCookie` in `server/core/identity.ts`)
- **HTTPS / Cloud Run Preview (`req.secure || req.headers['x-forwarded-proto'] === 'https'`):**
  - Sets `omniflow_session=<token>; Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=43200`.
  - Uses CHIPS (`Partitioned`) + `SameSite=None; Secure; HttpOnly` so third-party iframe contexts in AI Studio cannot leak cookies across top-level sites while remaining inaccessible to `document.cookie` XSS.
- **HTTP Localhost Testing:**
  - Sets `omniflow_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`.
- **Logout (`POST /api/v1/auth/logout`):**
  - Revokes the server session (`sessionRecord.revoked = true`) and clears the cookie with matching attributes (`Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`).

### 3.2 Double-Submit CSRF & Origin Verification (`verifyCsrfForCookieMutation` in `server/core/identity.ts`)
- Because `SameSite=None` cookies are sent on cross-site requests unless partitioned/guarded, `authenticateApiRequest` enforces strict **CSRF protection** on every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated via `session_cookie`:
  1. **Origin / Referer Host Alignment:** When `Origin` or `Referer` is present, its host must match the server's `Host` / `X-Forwarded-Host`, or the request is blocked with `HTTP 403 (CSRF_ORIGIN_MISMATCH)` and logged in `AuditLogger` (`security.csrf_blocked`).
  2. **Cryptographic CSRF Token Verification:** Each session derives an HMAC-SHA256 `csrfToken` bound to the session `jti`. Any cookie-authenticated mutation lacking a matching `X-CSRF-Token` header (compared via `crypto.timingSafeEqual`) is blocked with `HTTP 403 (CSRF_TOKEN_MISSING / CSRF_TOKEN_INVALID)`.
- **Reproducible Proof (`[AUTH-07]` in `server/test/run-enterprise-audit.ts`):**
  - Cookie `POST /api/v1/tickets` without `x-csrf-token` -> `HTTP 403 (CSRF_TOKEN_MISSING)` (`VERIFIED`)
  - Cookie `POST /api/v1/tickets` with `Origin: https://evil-attacker.example.com` -> `HTTP 403 (CSRF_ORIGIN_MISMATCH)` (`VERIFIED`)
  - Cookie `POST /api/v1/tickets` with matching `Origin` + valid `x-csrf-token` -> `HTTP 200` (`VERIFIED`)

---

## 4. Phase D — Closing the Production Identity Gap (`VERIFIED`)

### 4.1 Firebase ID Token Verification & Production Lock (`server/core/identity.ts` & `server/api/router.ts`)
1. **`verifyFirebaseIdToken(idToken)` (`server/core/identity.ts` lines 159–241):**
   - Verifies Firebase ID tokens via `adminAuth.verifyIdToken(idToken, true)`.
   - Validates `aud === firebaseConfig.projectId`, `iss === https://securetoken.google.com/${firebaseConfig.projectId}`, `exp > now`, and maps the verified `uid`/`email` to an active user in `db.users` and their authoritative `organizationId`.
2. **Production Lockdown of Demo `userId` Login (`server/api/router.ts` lines 202–245):**
   - If `process.env.NODE_ENV === 'production'` (or `OMNIFLOW_REQUIRE_FIREBASE_AUTH === 'true'`), `POST /api/v1/auth/login` **rejects** any login attempt without a valid `idToken` with `HTTP 403 (DEMO_LOGIN_DISABLED_IN_PRODUCTION)`.
   - Unverified `userId` selection is strictly restricted to non-production local/preview environments.
3. **Fail-Closed `SESSION_SECRET` Enforcement (`validateSessionSecretConfig` in `server/core/identity.ts` lines 72–89):**
   - In `NODE_ENV === 'production'`, `SESSION_SECRET` must be explicitly provided, at least 32 characters long, and not match known weak defaults (`default`, `secret`, `changeme`, etc.). Missing or weak secrets cause token issuance/verification to fail closed (`HTTP 503 SESSION_SECRET_MISCONFIGURED`).
4. **Reproducible Proof (`[AUTH-05]` & `[AUTH-06]` in `server/test/run-enterprise-audit.ts`):**
   - Valid Firebase token claims bound to `usr-admin-01` (`org-madar-enterprise-001`) -> `VERIFIED`
   - Malformed Firebase ID token (`POST /auth/login`) -> `HTTP 401` (`VERIFIED`)
   - Expired Firebase ID token -> `HTTP 401 (FIREBASE_TOKEN_EXPIRED)` (`VERIFIED`)
   - Wrong-project audience token (`aud: 'wrong-firebase-project-id'`) -> `HTTP 401 (FIREBASE_TOKEN_AUDIENCE_MISMATCH)` (`VERIFIED`)
   - Production `SESSION_SECRET` missing/short/weak rejected, `>=32-char` high-entropy accepted -> `VERIFIED`

---

## 5. Phase E — Firestore Rules, Durable Storage & Schema Status

1. **Java Firestore Local Emulator (`BLOCKED` by Container Image):**
   - `java -version` returns `sh: java: not found` and `find /usr -name "java"` returns empty. Because the container lacks a JVM binary, `@firebase/rules-unit-testing` cannot spawn the Java Firestore emulator locally.
   - `npx tsx server/test/firestore-rules-audit.ts` (`VERIFIED` Static AST & Deterministic Evaluator): `7/7` structural AST checks passed, `12/12` Dirty Dozen attacks blocked (`PERMISSION_DENIED`), `3/3` authorized tenant flows allowed on `DRAFT_firestore.rules`.
   - Live `firestore.rules` remains unmodified per the No-Production-Change policy (`BLOCKED` until owner cutover).
2. **Durable Storage & Schema Drift (`VERIFIED` Local Atomic Store / `NOT READY` for Multi-Instance Cloud Run Cutover):**
   - Local `server/db/store.ts` uses unique temp files + `fs.fsyncSync` + atomic POSIX `fs.renameSync` and transactional staging-map validation in `importFullBackup()` (`[STORAGE-01]` verified zero partial state mutation on mid-array corruption).
   - However, `/tmp/omniflow-data/db_state.json` remains an ephemeral container-local file, and live Cloud SQL (`3 tables / 22 columns / 0 rows`) has not yet been migrated to match `src/db/schema.ts` (`6 tables / 81 columns`).

---

## 6. Verification & Quality Gates Matrix (`VERIFIED`)

| Gate | Command | Exit Code | Status | Measured Evidence |
| :--- | :--- | :---: | :---: | :--- |
| **TypeScript Static Check** | `npm run lint` (`tsc --noEmit`) | `0` | `VERIFIED` | Zero TypeScript errors across all client, server, and test files. |
| **Production Build & PWA** | `npm run build` (`vite build`) | `0` | `VERIFIED` | Built `dist/`, `manifest.webmanifest`, and Service Worker `dist/sw.js` in `12.69s`. |
| **Firestore Rules AST Audit** | `npx tsx server/test/firestore-rules-audit.ts` | `0` | `VERIFIED` | `7/7` AST checks, `12/12` Dirty Dozen blocked, `3/3` valid allowed. |
| **Phase 4.1 Enterprise Security & Fetch Matrix** | `npx tsx server/test/run-enterprise-audit.ts` | `0` | `VERIFIED` | Passed `[AUTH-01..07]`, `[FETCH-01]` (7 scenarios), `[RBAC-01..06]`, `[TENANT-01..03]`, `[VALID-01..04]`, `[PII-01..02]`, `[AUDIT-01..03]`, `[STORAGE-01]`, 22 modules, and 150-req load test (`240 req/s`, `0/150` bleed). |
| **End-to-End Operations Suite** | `npx tsx scripts/test_all_operations.ts` | `0` | `VERIFIED` | `TOTAL TESTS: 35 | PASSED: 35 | FAILED: 0`. |
| **Java Firestore Emulator** | `java -version` | `127` | `BLOCKED` | No Java runtime installed in container environment. |
| **GitHub Remote Push** | `git push -u origin fix/phase2-security-and-github-verification` | `128` | `BLOCKED` | No GitHub credentials mounted in container (`could not read Username`). |

---

## 7. Final Release Decision: **`NOT READY` (For Live Production Cutover)**

All **Phase 4.1 local engineering and security gates (`window.fetch` descriptor safety, fail-closed session bootstrap, CHIPS cookie + CSRF double-submit protection, Firebase ID Token verification, fail-closed `SESSION_SECRET` enforcement, RBAC, tenant isolation, and atomic backup/restore)** are **`VERIFIED`**.

However, in strict adherence to evidence-driven release criteria, the overall status for **unattended live production cutover** remains **`NOT READY`** until the 3 external infrastructure cutover steps below are executed in an environment with production credentials and Java 17+:
1. **Firestore Rules Cutover (`BLOCKED` in container):** Run `@firebase/rules-unit-testing` with Java 17+ in CI, then promote `DRAFT_firestore.rules` to `firestore.rules` and deploy to Firebase.
2. **Cloud SQL Durable Storage Cutover:** Migrate `src/db/schema.ts` (adding `organization_id` to `tickets`/`conversations` and hash-chain columns to `audit_events`) to the live Cloud SQL PostgreSQL instance and switch runtime persistence from `/tmp/omniflow-data/db_state.json` to Cloud SQL.
3. **Production Secret & Auth Provisioning:** Set a 64-byte random `SESSION_SECRET` in Cloud Run Secret Manager with `NODE_ENV=production` (so `POST /api/v1/auth/login` strictly requires Firebase ID tokens) and push branch `fix/phase2-security-and-github-verification` to GitHub from an authenticated workstation.
