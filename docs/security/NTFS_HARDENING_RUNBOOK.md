# OmniFlow OS — Windows NTFS Least-Privilege Hardening Guide
## Operational Security Standard for Local Data Persistence

This runbook guides system operators and developers on securing OmniFlow OS durable data directories on Windows NTFS filesystems.

---

## 1. Scope & Objective

OmniFlow OS operates in local-first zero-cost mode. To protect customer records, database state, and authentication tokens from local multi-user access on Windows, durable storage folders must be isolated from standard local user accounts (`BUILTIN\Users`, `Authenticated Users`, `Everyone`).

### Protected Directories:
- `<TargetRoot>\Data\OMNIFLOW_OS` (Runtime database state, encryption keys, bootstrap tokens)
- `<TargetRoot>\Backups\OMNIFLOW_OS` (Encrypted database disaster recovery snapshots)

The operational script strictly enforces an allowlist and will **never** alter permissions on the workspace root, repository source code, or system directories.

---

## 2. Hardening Script Location

```text
scripts/windows/prepare_ntfs_acl_hardening.ps1
```

### Safety Features:
- **Default Read-Only Audit:** Running without switches performs an audit only; no changes are made.
- **Explicit `-Apply` Switch:** Requires explicit intent to apply DACL modifications.
- **Rollback Engine (`-Rollback`):** Automatically captures a pre-hardening DACL baseline outside the target directory and supports bit-for-bit SDDL rollback.
- **Reparse Point Protection:** Halts immediately if any junction, symlink, or mount point is detected.
- **Principle of Least Privilege:**
  - Owner: Full Control `(OI)(CI)F`
  - Administrators: Full Control `(OI)(CI)F`
  - SYSTEM: Full Control `(OI)(CI)F`
  - Local Users (`BUILTIN\Users`, `Authenticated Users`, `Everyone`): **Explicitly Purged**

---

## 3. Operational Usage

### Step 1: Read-Only Audit (Inspect current state)
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/windows/prepare_ntfs_acl_hardening.ps1 -AuditOnly -TargetRoot "F:\Dev_Workspace"
```

### Step 2: Apply Hardening (Run from Elevated Administrator PowerShell)
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/windows/prepare_ntfs_acl_hardening.ps1 -Apply -TargetRoot "F:\Dev_Workspace"
```

### Step 3: Rollback to Pre-Hardening Baseline (If needed)
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/windows/prepare_ntfs_acl_hardening.ps1 -Rollback -TargetRoot "F:\Dev_Workspace"
```

---

## 4. Verification

Verify with Windows native `icacls`:
```powershell
icacls "F:\Dev_Workspace\Data\OMNIFLOW_OS"
icacls "F:\Dev_Workspace\Backups\OMNIFLOW_OS"
```
Expected output should show inheritance disabled and only the Owner, Administrators, and SYSTEM possessing access rules.
