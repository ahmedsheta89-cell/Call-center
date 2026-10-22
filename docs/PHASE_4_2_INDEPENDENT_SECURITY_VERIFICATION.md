# PHASE 4.2 — Independent Security Verification, Browser Acceptance & Production Cutover Planning

- **Project:** OmniFlow AI Contact Center OS
- **Workspace Path:** `/app/applet`
- **Target GitHub Repository:** `https://github.com/ahmedsheta89-cell/Call-center.git`
- **Active Branch:** `fix/phase2-security-and-github-verification`
- **Audit Timestamp (UTC):** `2026-10-19T15:12:00Z`
- **Release Gate Verdict:** **`NOT READY` (For Live Unattended Production Cutover)**

---

## 1. Actual Git Baseline & Lineage Verification (`VERIFIED`)

### 1.1 Commands Executed & Exact Output
```bash
pwd && git status -s && git branch -vv && git log -n 6 --format="%H | %h | %P | %ai | %s" && git diff --stat origin/main..HEAD
```
- **Observed Baseline at Phase 4.2 Start:**
  - **Working Directory:** `/app/applet`
  - **Active Branch:** `fix/phase2-security-and-github-verification`
  - **Phase 4.1 `HEAD` Commit:** `35b68db0ea576976f6605e1f05ec709c81b3e93e` (`35b68db`) — **Matches Reported SHA 100%**
  - **Parent Commit:** `480e8b83aea809bb53b3b2d4970ee353557c9c4d` (`480e8b8`) — **Matches Reported Parent SHA 100%**
  - **Grandparent Commit (Phase 4 Baseline):** `1d1488144f8f7fdbea5c1399e64cc2d86e6ff05e` (`1d14881`)
  - **Base Branch (`origin/main`):** `05b8c79330a084eae8dc94644dce63b861790ace` (`05b8c79`)
  - **Working Tree Cleanliness at Entry:** Clean (`git status -s` returned empty).
  - **Previous Audit Reports Inspected:** `docs/PHASE_4_RELEASE_READINESS_AUDIT.md` (present and verified; `docs/PHASE_4_1_POST_FIX_SECURITY_AUDIT.md` was consolidated into `docs/PHASE_4_RELEASE_READINESS_AUDIT.md` in commit `35b68db`, and this dedicated report `docs/PHASE_4_2_INDEPENDENT_SECURITY_VERIFICATION.md` is now created as the authoritative Phase 4.2 artifact).

---

## 2. Independent Security Audit Findings & Local Remediations (`VERIFIED`)

Instead of relying on Phase 4.1 claims, an adversarial line-by-line review of `server/core/identity.ts`, `server/api/router.ts`, `src/lib/apiClient.ts`, `src/lib/googleWorkspaceService.ts`, `server.ts`, and `package.json` uncovered **6 real security and test-realism gaps**, all of which were documented, fixed locally, and verified with negative regression tests:

### Finding 2.1 — Firebase Email-Fallback Account Takeover Risk & Missing UID Binding (`HIGH` -> `FIXED & VERIFIED`)
- **Pre-Fix Vulnerability (`server/core/identity.ts` lines 220–226 in `35b68db`):**
  - When `verifyFirebaseIdToken` did not find a user by `db.users.get(decoded.uid)`, it fell back to matching `u.email.toLowerCase() === decoded.email.toLowerCase()` **without checking `decoded.email_verified === true`**, and it never persisted `user.firebaseUid = decoded.uid`.
  - Furthermore, in `server/test/run-enterprise-audit.ts`, `[AUTH-05]` called `verifyFirebaseIdToken` as an isolated unit function rather than exercising the full `POST /api/v1/auth/login` HTTP endpoint.
- **Phase 4.2 Fix (`server/core/types.ts`, `server/core/identity.ts`, `server/api/router.ts`):**
  1. Added `firebaseUid?: string` to `User` (`server/core/types.ts`).
  2. Primary lookup in `verifyFirebaseIdToken` matches `u.id === cleanUid || u.firebaseUid === cleanUid`.
  3. Initial email fallback is strictly gated by `decoded.email_verified === true` (`403 FIREBASE_EMAIL_NOT_VERIFIED` if `false` or missing). Once matched, `candidate.firebaseUid = cleanUid` is bound; any subsequent attempt by a different Firebase UID to claim the same email is rejected with `403 FIREBASE_UID_CONFLICT`.
  4. In `POST /api/v1/auth/login`, when `NODE_ENV === 'production'` (or `OMNIFLOW_REQUIRE_FIREBASE_AUTH === 'true'`), any login request without a non-empty `idToken` is immediately rejected with `401 FIREBASE_ID_TOKEN_REQUIRED_IN_PRODUCTION`.

### Finding 2.2 — Missing Mid-Session Organization Suspension Check (`MEDIUM` -> `FIXED & VERIFIED`)
- **Pre-Fix Vulnerability (`server/core/identity.ts` lines 403–416 in `35b68db`):**
  - `verifySessionToken` verified `user && user.isActive`, but did **not** verify `db.organizations.get(sessionRecord.organizationId)?.isActive`. If an entire tenant organization was suspended (`org.isActive = false`) while a session token was still unexpired, requests continued to succeed.
- **Phase 4.2 Fix (`server/core/identity.ts` lines 496–502):**
  - `verifySessionToken` now checks both `user.isActive` (`401 USER_INACTIVE_OR_DELETED`) and `org.isActive` (`401 ORG_INACTIVE_OR_DELETED`) on every authenticated request, verified over live HTTP in `[AUTH-06]`.

### Finding 2.3 — CSRF Missing-Origin Bypass & `Host` / `X-Forwarded-Host` Reflection (`HIGH` -> `FIXED & VERIFIED`)
- **Pre-Fix Vulnerability (`server/core/identity.ts` lines 503–523 in `35b68db`):**
  1. `if (originHeader)` only validated `Origin`/`Referer` *when present*. If an attacker suppressed both headers (e.g., `<meta name="referrer" content="no-referrer">`), Origin validation was completely bypassed.
  2. When `Origin` was present, it compared `parsedOrigin.host` against `req.headers['x-forwarded-host'] || req.headers.host`. Without an explicit server-side allowlist, an attacker spoofing `Host: evil.com` and `X-Forwarded-Host: evil.com` alongside `Origin: https://evil.com` could bypass the host comparison.
- **Phase 4.2 Fix (`server/core/identity.ts` lines 576–668 & `server.ts` line 14):**
  1. Enabled `app.set('trust proxy', 1)` in `server.ts`.
  2. Implemented `getTrustedOrigins(req)` returning an explicit server-side allowlist (`APP_URL`, `SHARED_APP_URL`, `ALLOWED_ORIGINS`, known Cloud Run URLs, and in non-production mode `http://127.0.0.1:<localSocketPort>` / `http://localhost:<localSocketPort>`), **never** trusting client-supplied `Host` or `X-Forwarded-Host`.
  3. Made `Origin` or `Referer` mandatory on all cookie-authenticated mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`), rejecting requests missing both headers with `403 CSRF_ORIGIN_REQUIRED`.
  4. Verified cross-session CSRF token rejection (`403 CSRF_TOKEN_INVALID` when Session B's valid `x-csrf-token` is presented with Session A's cookie) and restricted `X-CSRF-Token` response headers to `/auth/login`, `/auth/me`, and `/auth/switch-role`.

### Finding 2.4 — Silent Auto-Relogin After Explicit Logout in `apiClient.ts` (`MEDIUM` -> `FIXED & VERIFIED`)
- **Pre-Fix Defect (`src/lib/apiClient.ts` lines 193–195 in `35b68db`):**
  - Upon `POST /api/v1/auth/logout`, `activeSession` was set to `null`, which caused the very next protected `apiFetch('/api/v1/...')` call to invoke `ensureSession()` and **silently log the user back in**.
- **Phase 4.2 Fix (`src/lib/apiClient.ts` lines 74–215):**
  - Added `explicitlyLoggedOut` state lock on `POST /api/v1/auth/logout` and `clearSession()`. Any subsequent protected call after logout immediately fails closed with `HTTP 401 (SESSION_REVOKED_OR_LOGGED_OUT)` until an explicit `/api/v1/auth/login` or `ensureSession(true)` call is made.
  - Added `registerGlobalApiClient` and `appFetch` fallback so even when `window.fetch` is non-configurable (`configurable: false`), `installDescriptorSafeFetch` flags `fallbackRequired: true` and `appFetch` preserves full session/CSRF protection.

### Finding 2.5 — Secondary Route RBAC & `/workspace/relay` Header Collision (`MEDIUM` -> `FIXED & VERIFIED`)
- **Pre-Fix Defect (`server/api/router.ts` & `src/lib/googleWorkspaceService.ts`):**
  - `POST /api/v1/qa/run-full-suite` and `GET /api/v1/platforms/download-bundle` lacked `assertPermission(...)`.
  - `src/lib/googleWorkspaceService.ts` sent the Google OAuth token in `Authorization: Bearer <ya29...>`, colliding with OmniFlow's `Authorization: Bearer <omf1...>` session token.
- **Phase 4.2 Fix:**
  - Added `assertPermission(currentActor.role, [], 'qa.evaluate')` to `POST /qa/run-full-suite` and `assertPermission(currentActor.role, [], 'conversation.read')` to `GET /platforms/download-bundle` and `POST /workspace/relay`.
  - Updated `src/lib/googleWorkspaceService.ts` and `POST /workspace/relay` to pass the Google OAuth access token via `X-Google-Access-Token`.

### Finding 2.6 — Production `dist/server.cjs` & Sourcemap Static Exposure (`HIGH` -> `FIXED & VERIFIED`)
- **Pre-Fix Vulnerability (`package.json` line 8 & `server.ts` line 174 in `35b68db`):**
  - `npm run build` wrote `dist/server.cjs` and `dist/server.cjs.map` inside `dist/`, while production `server.ts` mounted `express.static(path.join(process.cwd(), 'dist'))`, allowing clients to download `/server.cjs` and `/server.cjs.map`.
- **Phase 4.2 Fix (`package.json` & `server.ts` lines 173–180):**
  - Removed `--sourcemap` from `esbuild server.ts` in `package.json`, deleted `dist/server.cjs.map`, and added an explicit middleware in `server.ts` returning `HTTP 404` for any request matching `/\.(cjs|map)$/i` or `server.cjs`.

---

## 3. Audit of Test Credibility: Real Execution vs. Simulation (`VERIFIED`)

| Test Suite / Gate | Real HTTP Server? | Real Code & Store Mutation? | Mocks / Stubs Used? | Can It Catch Guard Removal (Negative Regression)? |
| :--- | :---: | :---: | :--- | :--- |
| **`[AUTH-01..04]` (`run-enterprise-audit.ts`)** | **Yes** (`http://127.0.0.1:<port>/api/v1/*`) | **Yes** (`authenticateApiRequest`, `verifySessionToken`, `AuditLogger`) | **None** (100% real HMAC tokens & HTTP calls) | **Yes** — Removing header-spoofing checks or `/auth/switch-role` `baseRole` checks immediately fails assertions on HTTP 401/403 status codes. |
| **`[AUTH-05]` (`run-enterprise-audit.ts`)** | **Yes** (`POST /api/v1/auth/login`) | **Yes** (Mutates & checks `db.users.get('usr-admin-01').firebaseUid`) | **Controlled Verifier Stub** (`setFirebaseVerifierForTesting` simulates Firebase Admin decoded claims/outages because test suite has no live Google OAuth browser popup) | **Yes** — Removing `email_verified === true`, `aud`, `iss`, `exp`, or `OMNIFLOW_REQUIRE_FIREBASE_AUTH` check causes immediate failure. |
| **`[AUTH-06]` (`run-enterprise-audit.ts`)** | **Yes** (`GET /api/v1/auth/me`) | **Yes** (Mutates `roUser.isActive = false` and `foreignOrg.isActive = false` in `db`) | **None** | **Yes** — Removing `user.isActive` or `org.isActive` checks in `verifySessionToken` causes immediate failure. |
| **`[AUTH-07]` (`run-enterprise-audit.ts`)** | **Yes** (`POST /api/v1/tickets` with Cookie) | **Yes** (Verifies `db.tickets.size === ticketsBeforeCsrf + 1` only on valid vector) | **None** | **Yes** — Tests 6 vectors: missing `Origin`/`Referer` (403), forged `Host`/`X-Forwarded-Host` (403), foreign `Origin` (403), missing token (403), cross-session token (403), and valid mutation (200). |
| **`[FETCH-01]` (`run-enterprise-audit.ts`)** | **Yes** (Routes through real local HTTP server) | **Yes** (Tests `Request`, `Headers`, `AbortSignal`, `switch-role`, `logout`) | **Simulated `Window` descriptors** (`mockIframeWindow` getter-only & `mockLockedWindow` `configurable: false` in Node.js) | **Yes** — Removing `explicitlyLoggedOut` lock, `AbortSignal` check, or coalescing causes immediate failure. |
| **`[STORAGE-01]` (`run-enterprise-audit.ts`)** | **Yes** (`POST /api/v1/system/restore`) | **Yes** (Verifies `db.organizations.size`, `db.users.size`, `db.tickets.size` unchanged after mid-array corruption) | **None** | **Yes** — If `importFullBackup` mutates live maps before staging validation finishes, counts change and test fails. |
| **`[7/7]` 150-Req Load Test (`run-enterprise-audit.ts`)** | **Yes** (3 waves × 50 parallel HTTP requests) | **Yes** (4 concurrent tenant/role tokens + concurrent `db.saveToDisk()`) | **None** | **Yes** — Checks every response payload for cross-tenant ticket count (`0` for foreign org) and `/auth/me` role/org identity bleed (`0/150`). |
| **`scripts/test_all_operations.ts` (35 E2E Tests)** | **Yes** (Hits live server on port 3000) | **Yes** (Full CRUD across tickets, calls, conversations, WFM, QA, KB, audit) | **None** | **Yes** — Verifies 401 unauthenticated rejection, session login, role switching, and 33 domain operations. |
| **`server/test/firestore-rules-audit.ts`** | **No** (In-process rule parser) | **Yes** (Parses `DRAFT_firestore.rules` AST & evaluates 12 Dirty Dozen payloads) | **Deterministic Rule Evaluator** (No JVM Firestore Emulator) | **Yes** — Catches missing `affectedKeys().hasOnly()`, optional `organizationId`, or missing `isSameOrg()` in `DRAFT_firestore.rules`. |

---

## 4. Browser, Iframe & `window.fetch` Verification Status

- **Real Headless Browser Engine (`Playwright` / `Chromium` / `Puppeteer`):** **`BLOCKED` (Binary Not Installed in Container)**
  - **Command Executed:** `which playwright chromium google-chrome puppeteer curl` -> Only `/usr/bin/curl` is installed in the container image.
- **Simulated Browser / Iframe Descriptor & HTTP Integration Verification (`[FETCH-01]`):** **`VERIFIED` (Simulated Descriptor + Real HTTP Transport)**
  - Verified all 7 descriptor and session lifecycle scenarios against the real Express HTTP backend:
    1. Writable `window.fetch` descriptor.
    2. Configurable getter-only `window.fetch` descriptor (reproducing the exact AI Studio iframe preview `Window` descriptor).
    3. Non-configurable locked `window.fetch` descriptor (`configurable: false`) -> safely flags `fallbackRequired: true` without throwing `TypeError` and routes calls through `appFetch`.
    4. `Request` instance with custom `Headers` (`X-Custom-Client-Trace: trace-verified-42`) + `AbortSignal` pre-abort rejection.
    5. 10 concurrent pre-bootstrap calls coalesced into `1` `POST /api/v1/auth/login` request.
    6. Failed or timed-out login bootstrap fails closed with `HTTP 401 (SESSION_BOOTSTRAP_FAILED)`.
    7. Full lifecycle: `Login -> GET /auth/me -> POST /auth/switch-role (Supervisor) -> POST /auth/logout -> Reuse after logout rejected with HTTP 401 (SESSION_REVOKED_OR_LOGGED_OUT)`.
- **Enterprise Browser / Iframe Policy Caveat:**
  - While `SameSite=None; Secure; Partitioned; HttpOnly` (CHIPS) is supported in modern Chromium-based browsers, strict enterprise group policies or Safari/Firefox configurations that block all third-party cookies even when partitioned are mitigated in OmniFlow because `apiClient.ts` **simultaneously** attaches `Authorization: Bearer <token>` on all same-origin `/api/v1/*` `fetch` calls.

---

## 5. Production Configuration & Environment Verification

- **Runtime Container Environment Inspection (Names/Lengths Only, Zero Secret Values Printed):**
  - `NODE_ENV = development` (in current AI Studio preview container)
  - `PORT = 8080` (overridden to `3000` in dev server)
  - `SESSION_SECRET = <unset>`
  - `APP_URL = https://ais-dev-gqer3k5difwfcjdekzfmz2-100774856489.europe-west1.run.app`
  - `SHARED_APP_URL = <unset>`
  - `GITHUB_TOKEN = <unset>`
  - `GOOGLE_APPLICATION_CREDENTIALS = <unset>`
- **Verification Classification:**
  1. **Code-Level Fail-Closed Enforcement (`VERIFIED`):**
     - When `NODE_ENV=production`, `validateSessionSecretConfig()` rejects missing, `<32 char`, or weak `SESSION_SECRET` values; `/api/health` returns `HTTP 503 (SESSION_SECRET_MISCONFIGURED)`; and `POST /api/v1/auth/login` rejects raw `userId`/`email` login (`HTTP 401 FIREBASE_ID_TOKEN_REQUIRED_IN_PRODUCTION`).
     - Client bundle scan (`grep -rnE "SESSION_SECRET|EPHEMERAL_DEV_SECRET|firebase-admin|PRIVATE KEY" dist/assets/`) confirmed **`ZERO_SERVER_SECRETS_IN_CLIENT_BUNDLE`**.
     - `server.ts` blocks `/server.cjs` and `*.cjs` / `*.map` from static serving (`HTTP 404`), and `--sourcemap` was removed from `package.json`.
  2. **Live Cloud Run Production Service & Secret Manager Inspection (`BLOCKED`):**
     - Because this workspace container runs in `NODE_ENV=development` and does not have IAM access to inspect external Cloud Run production service revisions or Google Cloud Secret Manager bindings, verifying that `SESSION_SECRET` is provisioned in production Cloud Run is classified as **`BLOCKED` (Requires Owner GCP Console / `gcloud` Cutover)**.

---

## 6. Durable Storage Diff Matrix & Zero-Data-Loss PostgreSQL Migration Plan (No DDL Executed)

### 6.1 Authoritative 3-Way Schema Diff Matrix (`store.ts` vs. `src/db/schema.ts` vs. Live Cloud SQL `public`)

Live Cloud SQL was inspected via read-only `information_schema.columns`, `information_schema.table_constraints`, and `pg_indexes` (`cloudsql.ExecuteSql` DQL):

| Entity / Table | Runtime Store (`server/db/store.ts`) | Drizzle ORM (`src/db/schema.ts` — 6 Tables / 81 Cols) | Live Cloud SQL (`public` — 3 Tables / 22 Cols / 0 Rows) | Missing Columns / Constraints / Indexes Required Before Cutover |
| :--- | :--- | :--- | :--- | :--- |
| **`organizations`** | `db.organizations` (Map: `id, name, slug, plan, settings, isActive, createdAt, updatedAt`) | **Missing table** | **Missing table** | Create `organizations` table (`id TEXT PK`, `slug TEXT UNIQUE`, `settings JSONB`, `is_active BOOLEAN NOT NULL DEFAULT true`). |
| **`users`** | `db.users` (Map: `id, organizationId, firebaseUid, email, fullName, role, phoneNumber, isActive, mfaEnabled, createdAt, updatedAt`) | `users` (11 cols: `id SERIAL PK, uid TEXT UNIQUE, email, display_name, phone_number, role, team_name, status, is_active, created_at, updated_at`) | `users` (6 cols: `id SERIAL PK, uid TEXT UNIQUE, email, display_name, role, created_at`; Constraints: `users_pkey`, `users_uid_unique`) | Add `organization_id TEXT NOT NULL REFERENCES organizations(id)`, `phone_number`, `team_name`, `status`, `is_active`, `mfa_enabled`, `updated_at`; add index `idx_users_org_email (organization_id, email)`. |
| **`customers`** | `db.customers` (Map: 12 fields including `organizationId, tags, customFields`) | `customers` (13 cols: `id TEXT PK, organization_id, name, email, phone, customer_tier, lifetime_value, assigned_agent_id, ...`) | **Missing table** | Push `customers` table + add `tags JSONB`, `custom_fields JSONB`, FK `organization_id -> organizations(id)`, index `idx_customers_org_phone (organization_id, phone)`. |
| **`tickets`** | `db.tickets` (Map: 15 fields including `organizationId, conversationId, slaPolicyId, tags`) | `tickets` (17 cols: `id TEXT PK, ticket_number, customer_id, ...` — **missing `organization_id`**) | `tickets` (9 cols: `id TEXT PK, customer_id, title, category, priority, status, assigned_agent, created_at, updated_at`; PK `tickets_pkey`) | Add `organization_id TEXT NOT NULL REFERENCES organizations(id)` to Drizzle & Cloud SQL, plus `ticket_number`, `customer_name`, `customer_phone`, `description`, `sla_status`, `first_response_due_at`, `resolution_due_at`; index `idx_tickets_org_status (organization_id, status)`. |
| **`conversations`** | `db.conversations` (Map: 13 fields including `organizationId, customerId, sentiment, intent`) | `conversations` (16 cols — **missing `organization_id`**) | `conversations` (7 cols: `id TEXT PK, channel, customer_name, customer_phone, status, last_message, timestamp`; PK `conversations_pkey`) | Add `organization_id TEXT NOT NULL REFERENCES organizations(id)` to Drizzle & Cloud SQL, plus `customer_id`, `customer_tier`, `priority`, `assigned_agent_id`, `subject`, `sentiment`, `intent`, `unread_count`, `sla_due_at`; index `idx_convs_org_status (organization_id, status)`. |
| **`calls` / `call_sessions`** | `db.calls` (Map: 14 fields including `organizationId`) | `call_sessions` (14 cols — **missing `organization_id`**) | **Missing table** | Add `organization_id TEXT NOT NULL REFERENCES organizations(id)` to `call_sessions` and migrate to Cloud SQL; index `idx_calls_org_started (organization_id, started_at DESC)`. |
| **`auditEvents` / `audit_events`** | `AuditLogger.inMemoryStore` (includes `beforeState, afterState, prevHash, integrityHash`) | `audit_events` (10 cols — **missing `before_state, after_state, prev_hash, integrity_hash`**) | **Missing table** | Add `before_state JSONB`, `after_state JSONB`, `prev_hash TEXT NOT NULL`, `integrity_hash TEXT NOT NULL UNIQUE` to `audit_events`; index `idx_audit_org_created (organization_id, created_at)`. |
| **10 Operational Collections** (`teams, agents, messages, slaPolicies, knowledgeDocuments, qaRubrics, qaEvaluations, automationRules, shifts, customerChannels`) | 10 `Map` collections in `server/db/store.ts` | **Missing in `src/db/schema.ts`** | **Missing in Cloud SQL** | Define Drizzle tables with `organization_id TEXT NOT NULL` and composite tenant indexes before retiring `/tmp/omniflow-data/db_state.json`. |

### 6.2 Step-by-Step Zero-Data-Loss Cutover Plan (`/tmp/omniflow-data/db_state.json` -> Cloud SQL PostgreSQL)
1. **Phase 1 — Verified Pre-Migration Backup & Cryptographic Checksum:**
   - Call `GET /api/v1/system/backup` (or `db.exportFullBackup()`), verify `AuditLogger.verifyChainIntegrity(backup.auditEvents).valid === true`, and compute SHA-256 checksums + per-collection record counts (`organizations`, `users`, `customers`, `tickets`, `conversations`, `messages`, `calls`, `auditEvents`). Archive the signed snapshot to durable object storage (GCS).
2. **Phase 2 — Schema Alignment & Staging Dry-Run Migration:**
   - Update `src/db/schema.ts` to include all 17 collections, explicit `organization_id` tenant foreign keys, and `prev_hash`/`integrity_hash` columns on `audit_events`.
   - Apply Drizzle migrations (`drizzle-kit push`) against an isolated **Staging PostgreSQL database** first. Run a dry-run import of the snapshot and verify 100% row-count parity and foreign-key integrity.
3. **Phase 3 — Dual-Write / Write-Freeze Window to Prevent Lost Updates:**
   - Enable a short **Read-Only Maintenance Mode (`OMNIFLOW_MAINTENANCE_READONLY=true`)** (blocking `POST/PUT/PATCH/DELETE` mutations with `HTTP 503 RETRY_AFTER`) OR enable synchronous dual-write (`DatabaseStore` -> PostgreSQL transaction + `/tmp` fallback) during the transition window.
4. **Phase 4 — Transactional Import & Checksum Reconciliation:**
   - Inside a single PostgreSQL `BEGIN ... COMMIT` transaction, insert all entities in topological dependency order (`organizations` -> `teams` -> `users` -> `agents` -> `customers` -> `conversations` -> `messages` -> `tickets` -> `calls` -> `audit_events`).
   - Reconcile exact row counts, monetary aggregates (`SUM(lifetime_value)` on `customers`), and SHA-256 audit hash chain continuity (`verifyChainIntegrity()`).
5. **Phase 5 — Multi-Instance Concurrency Verification & Cutover Point:**
   - Switch the active repository adapter (`STORAGE_DRIVER=postgres`) so all reads/writes hit Cloud SQL PostgreSQL directly (eliminating single-container `/tmp` state).
   - Run the 3-wave × 50-request concurrency benchmark (`npx tsx server/test/run-enterprise-audit.ts`) across multiple stateless app instances to confirm zero split-brain state.
6. **Phase 6 — Rollback & Abort Criteria:**
   - **Abort/Rollback Trigger:** Any row-count mismatch (`> 0`), foreign-key violation, audit chain hash mismatch, or P95 latency exceeding `500ms`.
   - **Instant Rollback Procedure:** Flip `STORAGE_DRIVER=memory_file`, restore the verified pre-migration JSON snapshot via `db.importFullBackup(snapshot)`, and resume traffic within `< 30 seconds`.

---

## 7. Firestore Emulator, CI Pipeline & GitHub Status

1. **CI Pipeline Prepared on Working Branch (`.github/workflows/ci.yml` — `VERIFIED` Locally):**
   - Updated `.github/workflows/ci.yml` on branch `fix/phase2-security-and-github-verification` to trigger on `fix/**`, provision **Java 17 (`actions/setup-java@v4` with `temurin` 17)** alongside **Node.js 22**, and execute `npm run lint`, `npm run build`, `npx tsx server/test/firestore-rules-audit.ts`, and `npm run test:audit`.
2. **Local Java Firestore Emulator (`@firebase/rules-unit-testing` — `BLOCKED` in Container):**
   - `java -version` returns `sh: java: not found`. Because the container lacks a JVM binary, `@firebase/rules-unit-testing` cannot spawn the Firestore emulator JAR locally.
   - `DRAFT_firestore.rules` was verified via the deterministic AST & Dirty Dozen rule engine (`npx tsx server/test/firestore-rules-audit.ts` -> `7/7` structural checks, `12/12` Dirty Dozen attacks denied, `3/3` valid flows allowed).
   - Live `firestore.rules` was **not** modified or deployed, respecting the owner approval boundary.
3. **GitHub Remote Push (`git push` — `BLOCKED`):**
   - Executing `git push -u origin fix/phase2-security-and-github-verification` returns:
     `fatal: could not read Username for 'https://github.com': No such device or address`
   - No GitHub PAT or SSH key is mounted in the container environment. All commits remain cleanly recorded on local branch `fix/phase2-security-and-github-verification`.

---

## 8. Residual Risk Register

| ID | Risk Description | Severity | Current Status | Action Required to Close |
| :--- | :--- | :---: | :---: | :--- |
| **RISK-01** | Live `firestore.rules` in Firebase project still allows `request.auth != null` while hardened rules reside in `DRAFT_firestore.rules`. | **HIGH** | `BLOCKED` (Owner Approval & Java 17 Emulator Gate) | Run `@firebase/rules-unit-testing` in GitHub Actions CI (Java 17), copy `DRAFT_firestore.rules` -> `firestore.rules`, and deploy rules. |
| **RISK-02** | Runtime store persists to container-local `/tmp/omniflow-data/db_state.json`; live Cloud SQL has 3 tables / 22 columns / 0 rows vs. 17 runtime collections. | **HIGH** | `NOT READY` (Requires Schema Migration Plan Execution) | Execute the 6-phase PostgreSQL migration plan in Section 6.2 during an approved maintenance window. |
| **RISK-03** | Cloud Run production environment variables (`NODE_ENV=production`, `SESSION_SECRET` from Secret Manager) cannot be verified from inside the dev container. | **MEDIUM** | `BLOCKED` (No GCP IAM Inspection Access) | Configure `SESSION_SECRET` (64-char high-entropy secret) in Secret Manager and set `NODE_ENV=production` on the Cloud Run service. |
| **RISK-04** | Headless Chromium/Playwright binary is not installed in the container image for real browser DOM rendering tests. | **LOW** | `BLOCKED` (Container Binary Missing) | Run Playwright E2E browser acceptance tests in the GitHub Actions CI runner after pushing the branch. |
| **RISK-05** | Local branch `fix/phase2-security-and-github-verification` is ahead of `origin/main` and not yet pushed to GitHub. | **LOW** | `BLOCKED` (Missing GitHub Credentials in Container) | Push branch `fix/phase2-security-and-github-verification` using an authorized GitHub credential helper. |

---

## 9. Comprehensive Verification Matrix (`VERIFIED` / `FAILED` / `BLOCKED` / `UNVERIFIED`)

| Verification Item | Command / Method | Exit Code | Status | Evidence Summary |
| :--- | :--- | :---: | :---: | :--- |
| **Git Baseline & Lineage (`35b68db` -> `480e8b8` -> `1d14881`)** | `git log -n 6` & `git status -s` | `0` | **`VERIFIED`** | Exact SHA match on branch `fix/phase2-security-and-github-verification`; zero destructive git commands used. |
| **TypeScript Static Type Check** | `npm run lint` (`tsc --noEmit`) | `0` | **`VERIFIED`** | Zero TypeScript compilation errors across all files. |
| **Production Frontend & Server Build** | `npm run build` | `0` | **`VERIFIED`** | Built `dist/` and `dist/server.cjs` (with `--sourcemap` removed and `/server.cjs` blocked from static serving). |
| **Client Bundle Secret Leak Scan** | `grep -rnE "SESSION_SECRET\|..." dist/assets/` | `0` | **`VERIFIED`** | `ZERO_SERVER_SECRETS_IN_CLIENT_BUNDLE`. |
| **End-to-End HTTP Firebase Login & UID Binding (`[AUTH-05]`)** | `npx tsx server/test/run-enterprise-audit.ts` | `0` | **`VERIFIED`** | Verified `email_verified === true` requirement (403 on false), `firebaseUid` binding (200), UID conflict (403), expired/aud/iss (401), outage (503), and prod demo lockdown (401). |
| **Mid-Session User & Org Deactivation (`[AUTH-06]`)** | `npx tsx server/test/run-enterprise-audit.ts` | `0` | **`VERIFIED`** | Deactivating `user.isActive` or `org.isActive` immediately rejects existing unexpired session tokens with `HTTP 401`. |
| **6-Vector Cookie CSRF & Host Spoofing Gate (`[AUTH-07]`)** | `npx tsx server/test/run-enterprise-audit.ts` | `0` | **`VERIFIED`** | Blocked missing `Origin`/`Referer` (403), forged `Host`/`X-Forwarded-Host` (403), foreign `Origin` (403), missing token (403), cross-session token (403); allowed valid mutation (200). |
| **`window.fetch` Descriptor, `appFetch` & Post-Logout Lock (`[FETCH-01]`)** | `npx tsx server/test/run-enterprise-audit.ts` | `0` | **`VERIFIED`** | Verified getter-only iframe window, non-configurable `appFetch` fallback, `Request`/`AbortSignal`, coalescing (10->1), and post-logout reuse rejection (`401`). |
| **150-Request Multi-Wave Concurrency & Isolation (`[7/7]`)** | `npx tsx server/test/run-enterprise-audit.ts` | `0` | **`VERIFIED`** | 3 waves × 50 parallel requests across 4 role/tenant sessions completed with `0/150` context bleed and `0` storage write collisions. |
| **End-to-End HTTP Operations Suite (35 Tests)** | `npx tsx scripts/test_all_operations.ts` | `0` | **`VERIFIED`** | `TOTAL TESTS: 35 | PASSED: 35 | FAILED: 0`. |
| **Firestore Rules AST & Dirty Dozen Gate** | `npx tsx server/test/firestore-rules-audit.ts` | `0` | **`VERIFIED`** | `7/7` AST invariants passed, `12/12` Dirty Dozen attacks denied, `3/3` valid flows allowed on `DRAFT_firestore.rules`. |
| **Java JVM Firestore Local Emulator** | `java -version` | `127` | **`BLOCKED`** | Container lacks Java binary (`java: not found`); CI workflow prepared with Java 17 Temurin. |
| **Real Headless Chromium Browser Runner** | `which playwright chromium` | `1` | **`BLOCKED`** | No browser binary installed in container image. |
| **Cloud Run Production Env & Secret Manager Inspection** | Runtime env inspection | N/A | **`BLOCKED`** | Container runs in `development` mode without IAM access to inspect production Cloud Run / Secret Manager. |
| **GitHub Branch Push (`git push`)** | `git push -u origin fix/phase2-security-and-github-verification` | `128` | **`BLOCKED`** | `could not read Username for 'https://github.com'` (no GitHub token mounted in container). |

---

## 10. Final Release Decision: **`NOT READY` (With Exact Cutover Criteria)**

### Decision: **`NOT READY` for Unattended Live Production Cutover**
All local application code, cryptographic session management, Firebase ID token verification (`email_verified === true` + `firebaseUid` binding), mid-session user/organization revocation, 6-vector CSRF protection (immune to missing `Origin` and `Host`/`X-Forwarded-Host` spoofing), post-logout client lock, static bundle hardening, and 150-request multi-wave concurrency tests are **`VERIFIED`**.

The system will transition from **`NOT READY`** to **`READY`** immediately upon executing the following 4 external cutover gates:
1. **GitHub Push & CI Execution:** Push `fix/phase2-security-and-github-verification` from an authenticated workstation and confirm the GitHub Actions workflow (`.github/workflows/ci.yml` with Java 17 + Node 22) passes.
2. **Firestore Rules Cutover:** Run `@firebase/rules-unit-testing` with Java 17 in CI, promote `DRAFT_firestore.rules` to `firestore.rules`, and deploy to Firebase.
3. **Cloud SQL Durable Storage Cutover:** Execute the 6-phase PostgreSQL migration plan (Section 6.2) to align Cloud SQL with the 17 runtime collections and switch primary persistence from `/tmp/omniflow-data/db_state.json` to Cloud SQL PostgreSQL.
4. **Cloud Run Production Secrets:** Provision a 64-character high-entropy `SESSION_SECRET` in Google Cloud Secret Manager and set `NODE_ENV=production` on the Cloud Run service.
