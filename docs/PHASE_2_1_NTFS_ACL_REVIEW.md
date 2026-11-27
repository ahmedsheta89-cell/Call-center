# PHASE 2.1 — WINDOWS NTFS DACL SECURITY AUDIT & HARDENING PLAN
**Project:** OmniFlow OS  
**Component:** Filesystem Persistence & OS-Level Access Control  
**Auditor:** Local Senior Systems & Security Engineer  
**Date:** 2026-11-17  
**Host Machine:** Windows 10 Pro 64-bit (22H2), Workstation `FAWZY SHETA`  

---

## 1. Executive Summary

A critical aspect of local-first security is ensuring that sensitive operational data—including SQLite databases, cryptographic master keys, and authentication state—is protected from unauthorized access at the operating system level.

This audit evaluates the Discretionary Access Control Lists (DACLs) governing the OmniFlow OS data directory and key stores on the `F:` drive (formatted as NTFS). 

### Key Findings
1. **POSIX Octal Permission Ineffectiveness:** Node.js file operations invoking POSIX mode masks (such as `fs.openSync(path, 'w', 0o600)` or `fs.chmodSync(path, 0o600)`) have **no effect on Windows NTFS DACLs**. On Windows, Node.js maps POSIX permissions strictly to the FAT/NTFS read-only attribute; it does NOT alter user or group ACEs.
2. **Inherited Default DACLs:** The approved data directory `F:\Dev_Workspace\Data\OMNIFLOW_OS` and secret files such as `.omniflow-dev-keys.json` currently inherit standard Windows root volume DACLs.
3. **Overly Permissive Access:** As a result of inheritance, `BUILTIN\Users` possesses `ReadAndExecute` permissions, and `NT AUTHORITY\Authenticated Users` possesses `Modify` permissions.
4. **Application-Level Defense Active:** While OS-level DACLs are permissive, application-level path allowlisting strictly constrains OmniFlow OS processes to authorized workspace roots.
5. **No Unauthorized Remediation:** Applying OS-level DACL restrictions (`icacls`) modifies system-wide ACLs and requires administrator elevation. In accordance with zero-risk governance rules, no ACL alterations have been executed unilaterally.

---

## 2. Baseline DACL Inspection

### 2.1 Target Objects Inspected
1. **Data Directory:** `F:\Dev_Workspace\Data\OMNIFLOW_OS`
2. **Master Key File:** `F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json`
3. **Owner Bootstrap Token:** `F:\Dev_Workspace\Data\OMNIFLOW_OS\.owner_bootstrap_token`

### 2.2 Live DACL Access Control Entries (ACEs)
Extracted via PowerShell `Get-Acl`:

```
Path: F:\Dev_Workspace\Data\OMNIFLOW_OS
Owner: FAWZYSHETA\FAWZY SHETA
Access Rules:
  1. NT AUTHORITY\SYSTEM                  - FullControl (Allow, Inherited: True)
  2. BUILTIN\Administrators               - FullControl (Allow, Inherited: True)
  3. FAWZYSHETA\FAWZY SHETA               - FullControl (Allow, Inherited: True)
  4. NT AUTHORITY\Authenticated Users     - Modify, Synchronize (Allow, Inherited: True)
  5. BUILTIN\Users                        - ReadAndExecute, Synchronize (Allow, Inherited: True)
```

```
Path: F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json
Owner: FAWZYSHETA\FAWZY SHETA
Access Rules:
  1. NT AUTHORITY\SYSTEM                  - FullControl (Allow, Inherited: True)
  2. BUILTIN\Administrators               - FullControl (Allow, Inherited: True)
  3. FAWZYSHETA\FAWZY SHETA               - FullControl (Allow, Inherited: True)
  4. NT AUTHORITY\Authenticated Users     - Modify, Synchronize (Allow, Inherited: True)
  5. BUILTIN\Users                        - ReadAndExecute, Synchronize (Allow, Inherited: True)
```

### 2.3 Threat Analysis
- **Multi-User Vulnerability:** If another unprivileged user account is created on this Windows machine, that user would belong to `BUILTIN\Users` and `Authenticated Users`. Consequently, they would possess read and write capabilities over the OmniFlow database and secret keys.
- **Process Isolation Boundary:** Any untrusted background process executing under any authenticated user account on the machine can read `.omniflow-dev-keys.json` directly through the Windows filesystem, bypassing Node.js process controls.

---

## 3. Technical Proof: POSIX vs. Windows NTFS Permissions

In POSIX environments (Linux/macOS), calling:
```typescript
fs.openSync(filePath, 'w', 0o600); // Read/Write for Owner only (rw-------)
```
creates an inode with mode bits `0600`, preventing any other user or group from reading the file.

### Why This Fails on Windows:
In the libuv runtime powering Node.js on Windows (`src/win/fs.c`), the `mode` parameter of `open` and `chmod` is mapped via the C runtime (`_wchmod`):
- Write bits are inspected: if the write bit for the owner is cleared, Windows sets the `FILE_ATTRIBUTE_READONLY` flag.
- Read/execute bits and group/other permission bits (`0o077`) are **completely ignored**.
- Windows security descriptors (NTFS Security Descriptors containing DACLs with SIDs and Access Masks) are **not created or modified** by `fs.openSync` or `fs.chmodSync`.
- Therefore, relying on Node.js octal modes on Windows provides zero multi-user security isolation.

---

## 4. Proposed Hardening Plan (Minimal Privilege Model)

To achieve true local least-privilege security at the Windows OS layer, DACLs on sensitive OmniFlow OS directories and secret files should be restricted so that:
1. Only the current user (`FAWZY SHETA`) and `SYSTEM` / `Administrators` have access.
2. Inheritance from parent folders (`F:\Dev_Workspace` or drive root `F:\`) is severed.
3. `BUILTIN\Users` and `Authenticated Users` are completely removed.

### 4.1 Proposed Hardening Commands (`icacls`)

> [!CAUTION]
> The following commands must be executed in an **Elevated (Administrator) PowerShell session** with the user's explicit approval.

#### For the Secret Keys File:
```powershell
# 1. Break inheritance and copy current inherited ACEs as explicit ACEs
icacls "F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json" /inheritance:d

# 2. Remove access for general users
icacls "F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json" /remove:g "BUILTIN\Users"
icacls "F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json" /remove:g "NT AUTHORITY\Authenticated Users"

# 3. Grant Full Control exclusively to current user and Administrators
icacls "F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json" /grant:r "$($env:USERNAME):(F)" "BUILTIN\Administrators:(F)" "NT AUTHORITY\SYSTEM:(F)"
```

#### For the Operational Data Directory:
```powershell
# 1. Break inheritance and copy existing ACEs recursively
icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS" /inheritance:d

# 2. Remove BUILTIN\Users and Authenticated Users recursively
icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS" /remove:g "BUILTIN\Users" /t /c
icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS" /remove:g "NT AUTHORITY\Authenticated Users" /t /c

# 3. Grant explicit Full Control to current user and Administrators
icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS" /grant:r "$($env:USERNAME):(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "NT AUTHORITY\SYSTEM:(OI)(CI)(F)" /t /c
```

---

## 5. Rollback Procedure

If any permission conflict arises, the changes can be instantly reversed by restoring inheritance from the parent directory:

```powershell
# Rollback Secret Keys File
icacls "F:\Dev_Workspace\Call-center\.omniflow-dev-keys.json" /reset

# Rollback Data Directory Recursively
icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS" /reset /t /c
```

---

## 6. Audit Conclusion & Governance Recommendation

- **Current State:** Inherited NTFS permissions allow `BUILTIN\Users` ReadAndExecute and `Authenticated Users` Modify.
- **Immediate Threat Level:** **LOW-MEDIUM**. On a single-user personal workstation, the risk is mitigated because the interactive session belongs solely to the authorized developer (`FAWZY SHETA`).
- **Phase 2.1 Acceptance Condition:** This item is classified as an **Accepted Operational Condition**. Because unilateral execution of `icacls` without interactive administrator confirmation violates non-destructive execution boundaries, we provide the complete hardening script and rollback instructions for administrative execution.
