# PHASE 2.1 — LOCAL OWNER ACCOUNT ACTIVATION RUNBOOK & SECURITY PROTOCOL
**Project:** OmniFlow OS  
**Component:** Identity Governance & Local Owner Lifecycle  
**Date:** 2026-11-17  
**Security Status:** `OWNER_BOOTSTRAP_READY`  

---

## 1. Overview & Architecture

The OmniFlow OS local-first architecture enforces single-owner local governance without external cloud authentication dependencies. To prevent unauthorized account claiming while protecting credentials from disclosure:

1. A **cryptographically secure one-time bootstrap token** is generated on local disk.
2. The operational data directory contains **zero test credentials**.
3. The Owner establishes their password interactively through a masked CLI utility (`scripts/activate_owner.ts`).
4. Passwords are never echoed to the screen, logged to files, transmitted over network boundaries, or exposed to AI agents.
5. The password is cryptographically transformed using **Scrypt (RFC 7914)** before storage.
6. Upon successful activation, the bootstrap token is permanently destroyed.

```
       [ Local Filesystem ]                         [ Interactive User ]
  .owner_bootstrap_token (256-bit CSPRNG)                     |
                  |                                           |  (Runs: npm run owner:activate)
                  v                                           v
         +---------------------------------------------------------+
         |               scripts/activate_owner.ts                 |
         |  - Reads token from disk                                |
         |  - Prompts for Username & Password (Masked with *)      |
         |  - Validates complexity (>=12 chars, mixed case, symb)  |
         +---------------------------------------------------------+
                                      |
                     [ Complete Local Bootstrap API ]
                 POST /auth/local-owner/bootstrap (Loopback)
                                      |
                                      v
         +---------------------------------------------------------+
         |               server/core/localAuth.ts                  |
         |  - Validates one-time token matches                     |
         |  - Rate-limit check (Max 5 attempts / 15 mins)          |
         |  - Derives Scrypt key (RFC 7914: N=16384, r=8, p=1)     |
         |  - Writes .local_owner_auth.json (salt + hash)          |
         |  - Upserts Owner user in local SQLite database          |
         |  - Unlinks .owner_bootstrap_token (One-time destruction)|
         +---------------------------------------------------------+
                                      |
                                      v
                          State: [ ACTIVE_OWNER ]
```

---

## 2. Cryptographic & Security Lifecycle

### 2.1 One-Time Bootstrap Token
- **Source:** Node.js `crypto.randomBytes(32).toString('hex')` (256 bits of CSPRNG entropy).
- **Location:** `F:\Dev_Workspace\Data\OMNIFLOW_OS\.owner_bootstrap_token`
- **Current State:** Freshly seeded and untouched (`createdAt: 2026-11-17T20:17:46.276Z`).
- **Destruction Policy:** Atomically unlinked from disk (`fs.unlinkSync`) immediately after successful account creation. Replay attacks are impossible.

### 2.2 Password Derivation Specification (RFC 7914)
- **Algorithm:** Scrypt (IETF RFC 7914 standard for password-based key derivation).
- **Parameters:**
  - CPU/Memory Cost Parameter ($N$): `16384` ($2^{14}$)
  - Block Size Parameter ($r$): `8`
  - Parallelization Parameter ($p$): `1`
  - Salt Length: `32 bytes` CSPRNG per password
  - Derived Key Length: `64 bytes` (512 bits)
- **Resistance:** Highly resistant to hardware-accelerated (ASIC/GPU) brute-force dictionary attacks.

### 2.3 Password Complexity Policy
The interactive CLI and API strictly reject passwords that do not meet the following criteria:
- **Minimum Length:** 12 characters.
- **Lowercase Letters:** At least one (`a-z`).
- **Uppercase Letters:** At least one (`A-Z`).
- **Numbers:** At least one digit (`0-9`).
- **Special Characters:** At least one symbol (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

### 2.4 Rate Limiting & Lockout Defense
- Both bootstrap activation and subsequent owner login endpoints are guarded by an in-memory sliding window rate limiter:
  - **Threshold:** Maximum 5 failed attempts per 15-minute window per IP.
  - **Lockout:** HTTP 429 (`Too Many Requests`) with clear error disclosure.
  - **IP Isolation:** Tracked per client IP (`127.0.0.1` on local loopback).

---

## 3. Step-by-Step Activation Instructions for the Owner

> [!IMPORTANT]
> The account must be activated directly by the human user. Do NOT share your password with any AI agent or paste it into chat.

### Step 1: Open PowerShell
Open a standard Windows PowerShell console and navigate to the project directory:
```powershell
Set-Location F:\Dev_Workspace\Call-center
```

### Step 2: Execute the Interactive Activation Command
Run the dedicated npm activation command:
```powershell
npm run owner:activate
```

### Step 3: Interactive Prompt Workflow
The script will display:
```
============================================================
           OMNIFLOW OS — OWNER ACCOUNT ACTIVATION           
============================================================
Found valid bootstrap token in F:\Dev_Workspace\Data\OMNIFLOW_OS\.owner_bootstrap_token

Enter Owner Username: [Type desired username, e.g. admin or owner]
Enter Owner Display Name: [Type desired display name, e.g. Fawzy Sheta]
Enter Owner Password: [PASSWORD WILL NOT ECHO TO SCREEN - KEYS SHOW AS *]
Confirm Owner Password: [Retype password]
```

### Step 4: Verification of Success
Upon entering matching, compliant credentials, the CLI will output:
```
[SUCCESS] Owner account successfully created and activated!
User ID: usr-owner-...
Role: owner
Bootstrap token has been permanently destroyed.
State is now: ACTIVE
```

---

## 4. How to Verify Activation Status (Zero-Leak)

Without exposing passwords or tokens, you or the agent can verify that the owner account is active by inspecting the public status endpoint:

```powershell
# Using PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/auth/local-owner/status" -Method GET
```
**Expected Response:**
```json
{
  "status": "ACTIVE",
  "ownerExists": true,
  "bootstrapPending": false,
  "username": "admin",
  "displayName": "Fawzy Sheta",
  "mfaEnabled": false
}
```

---

## 5. Security & Zero-Leak Guarantees

1. **Zero Secret Retention:** At no point during Phase 1, Phase 2, or Phase 2.1 did any agent record or transmit live Owner credentials.
2. **Purge Verification:** All test credentials (`usr-owner-01` and `.local_owner_auth.json`) used during Phase 2 validation have been completely purged from operational databases.
3. **Log Sanitization:** Server logs intercept and redact sensitive fields (`password`, `token`, `secret`, `authorization`).
4. **Git Isolation:** `.owner_bootstrap_token`, `.local_owner_auth.json`, and `.omniflow-dev-keys.json` are strictly ignored by `.gitignore` and reside outside version control.
