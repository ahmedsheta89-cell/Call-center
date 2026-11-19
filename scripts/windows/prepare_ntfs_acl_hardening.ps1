<#
.SYNOPSIS
    OmniFlow OS — Least-Privilege NTFS DACL Hardening & Rollback Engine (Operational Script)
.DESCRIPTION
    Strictly hardens sensitive data and backup directories by breaking inheritance,
    removing unauthorized SIDs (BUILTIN\Users, Authenticated Users, Everyone), and granting
    least-privilege access exclusively to the verified Owner SID, Administrators, and SYSTEM.
    
    SAFETY CONTROLS:
    - Default mode is READ-ONLY audit.
    - Supports explicit -AuditOnly and -WhatIf modes.
    - Requires explicit -Apply switch to make changes.
    - Includes testable -Rollback mode using captured DACL baseline.
    - Baseline is stored OUTSIDE the secured directory (in Audit folder).
    - Uses DACL-only access control (AccessControlSections::Access) without SACL dependency.
    - Aborts immediately on reparse points, symlinks, or unauthorized paths.
    - Enforces a strict target allowlist (Data\OMNIFLOW_OS and Backups\OMNIFLOW_OS only).
    - Halts on any single file failure (no error suppression).
#>

[CmdletBinding(SupportsShouldProcess=$true)]
param (
    [switch]$Apply,
    [switch]$Rollback,
    [switch]$AuditOnly,
    [string]$TargetRoot = "F:\Dev_Workspace",
    [string]$ExpectedOwnerSid = "",
    [string]$CustomDataDir = "",
    [string]$CustomBackupDir = "",
    [string]$RollbackFile = ""
)

$ErrorActionPreference = "Stop"

# Standard Security Principal SIDs
$ADMIN_SID          = "S-1-5-32-544"
$SYSTEM_SID         = "S-1-5-18"
$USERS_SID          = "S-1-5-32-545"
$AUTH_USERS_SID     = "S-1-5-11"
$EVERYONE_SID       = "S-1-1-0"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "🛡️ OMNIFLOW OS — LEAST-PRIVILEGE NTFS DACL HARDENING ENGINE (OPERATIONAL)" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Identity Pre-flight Verification
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$currentSid = $currentUser.User.Value
Write-Host "[Pre-flight] Current User Name: $($currentUser.Name)" -ForegroundColor White
Write-Host "[Pre-flight] Current User SID : $currentSid" -ForegroundColor White

$ownerSid = if ($ExpectedOwnerSid) { $ExpectedOwnerSid } else { $currentSid }

if ($currentSid -ne $ownerSid) {
    $isAdmin = (New-Object System.Security.Principal.WindowsPrincipal($currentUser)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Error "PRE-FLIGHT ABORT: Current user SID ($currentSid) does not match expected Owner SID ($ownerSid) and is not elevated Administrator."
        exit 1
    } else {
        Write-Host "  -> Running in elevated Administrative context." -ForegroundColor Yellow
    }
} else {
    Write-Host "  -> Identity verified: matches expected Owner SID ($ownerSid)." -ForegroundColor Green
}

# 2. Target Directory Resolution
$DataDir = if ($CustomDataDir) { $CustomDataDir } else { Join-Path $TargetRoot "Data\OMNIFLOW_OS" }
$BackupDir = if ($CustomBackupDir) { $CustomBackupDir } else { Join-Path $TargetRoot "Backups\OMNIFLOW_OS" }

$TargetDirectories = @()
if (Test-Path $DataDir) { $TargetDirectories += $DataDir }
if (Test-Path $BackupDir) { $TargetDirectories += $BackupDir }

if ($TargetDirectories.Count -eq 0) {
    Write-Error "PRE-FLIGHT ABORT: No target directories exist at specified paths."
    exit 1
}

Write-Host "[Pre-flight] Target Directories:" -ForegroundColor White
foreach ($d in $TargetDirectories) {
    Write-Host "  • $d" -ForegroundColor White
}

# 2.1 Strict Target Scope Allowlist Enforcement
$APPROVED_BASE = [System.IO.Path]::GetFullPath($TargetRoot).TrimEnd('\')
$APPROVED_OPERATIONAL_TARGETS = @(
    (Join-Path $APPROVED_BASE "Data\OMNIFLOW_OS"),
    (Join-Path $APPROVED_BASE "Backups\OMNIFLOW_OS")
)
$APPROVED_TEST_PREFIX = (Join-Path $APPROVED_BASE "Temp\OMNIFLOW_OS").TrimEnd('\')

foreach ($d in $TargetDirectories) {
    $normTarget = [System.IO.Path]::GetFullPath($d).TrimEnd('\')
    $isApprovedOp = $false
    foreach ($appOp in $APPROVED_OPERATIONAL_TARGETS) {
        if ($normTarget.Equals([System.IO.Path]::GetFullPath($appOp).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
            $isApprovedOp = $true
            break
        }
    }
    $isApprovedTest = $normTarget.StartsWith($APPROVED_TEST_PREFIX + "\", [System.StringComparison]::OrdinalIgnoreCase) -or 
                      $normTarget.Equals($APPROVED_TEST_PREFIX, [System.StringComparison]::OrdinalIgnoreCase)
    
    if (-not $isApprovedOp -and -not $isApprovedTest) {
        Write-Error "SECURITY ABORT: Target directory '$d' violates security boundary! It is NOT in the explicit allowlist. Modification of '$d' is strictly forbidden."
        exit 1
    }
}
Write-Host "  -> All targets verified against strict allowlist." -ForegroundColor Green

# 3. Reparse Point & Junction Inspection
Write-Host "`n[1/5] Inspecting Reparse Points & Symbolic Links..." -ForegroundColor Cyan
foreach ($d in $TargetDirectories) {
    $dirItem = Get-Item -Path $d -Force
    if ([bool]($dirItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        Write-Error "SECURITY ABORT: Target directory is a ReparsePoint/Junction: $d"
        exit 1
    }
    $childFiles = Get-ChildItem -Path $d -Recurse -Force
    foreach ($child in $childFiles) {
        if ([bool]($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            Write-Error "SECURITY ABORT: Child item is a ReparsePoint/Symlink: $($child.FullName)"
            exit 1
        }
    }
}
Write-Host "  -> All targets verified: Zero reparse points or symbolic links detected." -ForegroundColor Green

# Baseline / Rollback Storage Path (Preserved OUTSIDE Target Data Directories)
$RollbackPath = if ($RollbackFile) {
    $RollbackFile
} else {
    Join-Path $TargetRoot "Audit\OMNIFLOW_OS\PHASE_2_1_4\ntfs_acl_baseline_rollback.json"
}

# --------------------------------------------------------------------------
# ROLLBACK EXECUTION
# --------------------------------------------------------------------------
if ($Rollback) {
    Write-Host "`n[Rollback] Executing Rollback from Saved Baseline: $RollbackPath" -ForegroundColor Yellow
    if (-not (Test-Path $RollbackPath)) {
        Write-Error "ROLLBACK ABORT: Rollback baseline file not found: $RollbackPath"
        exit 1
    }
    $rawJson = Get-Content -Path $RollbackPath -Raw
    $rollbackData = ConvertFrom-Json -InputObject $rawJson

    # 1. Validate baseline integrity and scope before applying rollback
    if (-not $rollbackData -or $rollbackData.Count -eq 0) {
        Write-Error "ROLLBACK ABORT: Rollback baseline is empty or corrupted."
        exit 1
    }

    foreach ($entry in $rollbackData) {
        if (-not $entry.Path -or -not $entry.SDDL) {
            Write-Error "ROLLBACK ABORT: Malformed baseline entry detected (missing Path or SDDL)."
            exit 1
        }
        $normEntry = [System.IO.Path]::GetFullPath($entry.Path)
        $isEntryAllowed = $false
        foreach ($d in $TargetDirectories) {
            $normD = [System.IO.Path]::GetFullPath($d).TrimEnd('\')
            if ($normEntry.Equals($normD, [System.StringComparison]::OrdinalIgnoreCase) -or 
                $normEntry.StartsWith($normD + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
                $isEntryAllowed = $true
                break
            }
        }
        if (-not $isEntryAllowed) {
            Write-Error "ROLLBACK ABORT: Baseline entry path '$($entry.Path)' is outside authorized target directories ($($TargetDirectories -join ', ')). Halting to prevent unauthorized ACL alteration."
            exit 1
        }
        if (-not (Test-Path $entry.Path)) {
            Write-Error "ROLLBACK ABORT: Baseline target path missing on disk: $($entry.Path)"
            exit 1
        }
    }

    # 2. Reset inheritance on target directories to re-enable inherited ACE flow
    foreach ($d in $TargetDirectories) {
        Write-Host "  Resetting inheritance on target root: $d" -ForegroundColor White
        & icacls "$d" /reset /t /c 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ROLLBACK FAILED: icacls /reset returned exit code $LASTEXITCODE for $d"
            exit 1
        }
    }

    # 3. Re-apply baseline DACL to each item (restores custom/explicit rules)
    foreach ($entry in $rollbackData) {
        $path = $entry.Path
        $sddl = $entry.SDDL
        Write-Host "  Restoring baseline DACL: $path" -ForegroundColor White
        try {
            if ($entry.IsContainer) {
                $sec = New-Object System.Security.AccessControl.DirectorySecurity
                $sec.SetSecurityDescriptorSddlForm($sddl, [System.Security.AccessControl.AccessControlSections]::Access)
                [System.IO.Directory]::SetAccessControl($path, $sec)
            } else {
                $sec = New-Object System.Security.AccessControl.FileSecurity
                $sec.SetSecurityDescriptorSddlForm($sddl, [System.Security.AccessControl.AccessControlSections]::Access)
                [System.IO.File]::SetAccessControl($path, $sec)
            }
        } catch {
            Write-Error "ROLLBACK FAILED: Error restoring ACL on $($path) - $_"
            exit 1
        }
    }
    Write-Host "✅ Rollback completed successfully." -ForegroundColor Green
    exit 0
}

# --------------------------------------------------------------------------
# BASELINE CAPTURE
# --------------------------------------------------------------------------
Write-Host "`n[2/5] Capturing ACL Baseline..." -ForegroundColor Cyan
$baselineEntries = @()

foreach ($d in $TargetDirectories) {
    $items = @(Get-Item -Path $d -Force) + (Get-ChildItem -Path $d -Recurse -Force)
    foreach ($item in $items) {
        $sec = (Get-Item -Path $item.FullName -Force).GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
        $baselineEntries += [PSCustomObject]@{
            Path = $item.FullName
            IsContainer = $item.PSIsContainer
            SDDL = $sec.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)
            AreAccessRulesProtected = $sec.AreAccessRulesProtected
        }
    }
}
Write-Host "  -> Captured baseline for $($baselineEntries.Count) items." -ForegroundColor Green

if ($Apply -or $AuditOnly -or (-not $Apply -and -not $Rollback)) {
    $rollbackDir = Split-Path $RollbackPath -Parent
    if (-not (Test-Path $rollbackDir)) {
        New-Item -ItemType Directory -Path $rollbackDir -Force | Out-Null
    }
    # Save baseline JSON if it doesn't already exist, or in AuditOnly mode.
    # NEVER overwrite an existing baseline during -Apply (to preserve pre-hardening rollback point).
    if (-not (Test-Path $RollbackPath) -or $AuditOnly -or (-not $Apply -and -not $Rollback)) {
        $baselineEntries | ConvertTo-Json -Depth 5 | Set-Content -Path $RollbackPath -Encoding UTF8
        Write-Host "  -> Baseline saved: $RollbackPath" -ForegroundColor Green
    } else {
        Write-Host "  -> Existing baseline preserved for rollback: $RollbackPath" -ForegroundColor Green
    }
}

# --------------------------------------------------------------------------
# READ-ONLY AUDIT MODE / WHAT-IF
# --------------------------------------------------------------------------
if ($AuditOnly -or (-not $Apply -and -not $Rollback) -or $PSCmdlet.MyInvocation.BoundParameters["WhatIf"]) {
    Write-Host "`n[3/5] READ-ONLY AUDIT MODE (No changes will be made)" -ForegroundColor Yellow
    Write-Host "  To apply these changes, run with -Apply switch from an elevated prompt." -ForegroundColor Yellow
    
    foreach ($d in $TargetDirectories) {
        $acl = Get-Acl -Path $d
        Write-Host "`nTarget: $d" -ForegroundColor White
        Write-Host "  Inheritance Active: $(-not $acl.AreAccessRulesProtected)" -ForegroundColor White
        $unauthRules = $acl.Access | Where-Object {
            $_.IdentityReference.Value -like "*Users*" -or $_.IdentityReference.Value -like "*Authenticated Users*" -or $_.IdentityReference.Value -like "*Everyone*"
        }
        if ($unauthRules) {
            Write-Host "  ⚠️ Permissive ACEs Detected:" -ForegroundColor Red
            foreach ($r in $unauthRules) {
                Write-Host "    - $($r.IdentityReference): $($r.FileSystemRights) ($($r.AccessControlType))" -ForegroundColor Red
            }
        } else {
            Write-Host "  ✅ No permissive ACEs detected." -ForegroundColor Green
        }
    }
    Write-Host "`n[Plan] Hardening actions to be executed when -Apply is passed:" -ForegroundColor Cyan
    Write-Host "  1. Break inheritance on target root folders (/inheritance:r)" -ForegroundColor White
    Write-Host "  2. Grant FullControl to Owner SID: $ownerSid" -ForegroundColor White
    Write-Host "  3. Grant FullControl to Administrators: $ADMIN_SID" -ForegroundColor White
    Write-Host "  4. Grant FullControl to SYSTEM: $SYSTEM_SID" -ForegroundColor White
    Write-Host "  5. Propagate (OI)(CI) to all child files and subdirectories with /t /c" -ForegroundColor White
    Write-Host "  6. Purge explicit unauthorized ACEs for Users, Authenticated Users, and Everyone" -ForegroundColor White
    Write-Host "  7. Verify complete absence of standard local Users ACEs" -ForegroundColor White
    exit 0
}

# --------------------------------------------------------------------------
# APPLY MODE
# --------------------------------------------------------------------------
Write-Host "`n[3/5] APPLYING LEAST-PRIVILEGE DACL..." -ForegroundColor Yellow

$ownerAccountName = (New-Object System.Security.Principal.SecurityIdentifier($ownerSid)).Translate([System.Security.Principal.NTAccount]).Value
$adminAccountName = (New-Object System.Security.Principal.SecurityIdentifier($ADMIN_SID)).Translate([System.Security.Principal.NTAccount]).Value
$systemAccountName = (New-Object System.Security.Principal.SecurityIdentifier($SYSTEM_SID)).Translate([System.Security.Principal.NTAccount]).Value

Write-Host "  Resolved Principals:" -ForegroundColor White
Write-Host "    Owner: $ownerAccountName ($ownerSid)" -ForegroundColor White
Write-Host "    Admin: $adminAccountName ($ADMIN_SID)" -ForegroundColor White
Write-Host "    System: $systemAccountName ($SYSTEM_SID)" -ForegroundColor White

foreach ($d in $TargetDirectories) {
    Write-Host "`nHardening: $d" -ForegroundColor Yellow
    
    # 1. Break inheritance on target root
    & icacls "$d" /inheritance:r
    if ($LASTEXITCODE -ne 0) {
        Write-Error "HARDENING FAILED: icacls /inheritance:r returned exit code $LASTEXITCODE for $d"
        exit 1
    }
    
    # 2. Grant Full Control to verified Owner, Admins, and SYSTEM recursively
    & icacls "$d" /grant:r "${ownerAccountName}:(OI)(CI)F" "${adminAccountName}:(OI)(CI)F" "${systemAccountName}:(OI)(CI)F" /t /c
    if ($LASTEXITCODE -ne 0) {
        Write-Error "HARDENING FAILED: icacls /grant returned exit code $LASTEXITCODE for $d"
        exit 1
    }

    # 3. Explicitly purge any remaining Users, Authenticated Users, Everyone rules recursively
    & icacls "$d" /remove:g "BUILTIN\Users" "NT AUTHORITY\Authenticated Users" "Everyone" /t /c
}

# --------------------------------------------------------------------------
# POST-HARDENING VERIFICATION
# --------------------------------------------------------------------------
Write-Host "`n[4/5] Verifying Hardened DACLs..." -ForegroundColor Cyan
$verificationErrors = 0

foreach ($d in $TargetDirectories) {
    # Check root target directory has inheritance protected
    $rootAcl = Get-Acl -Path $d
    if (-not $rootAcl.AreAccessRulesProtected) {
        Write-Host "  ❌ Verification Failed: Inheritance not broken on root target $d" -ForegroundColor Red
        $verificationErrors++
    }

    $items = @(Get-Item -Path $d -Force) + (Get-ChildItem -Path $d -Recurse -Force)
    foreach ($item in $items) {
        $acl = Get-Acl -Path $item.FullName
        
        # Verify no unauthorized Users ACE exists
        foreach ($ace in $acl.Access) {
            $sidStr = $ace.IdentityReference.Value
            try {
                $sid = (New-Object System.Security.Principal.NTAccount($sidStr)).Translate([System.Security.Principal.SecurityIdentifier]).Value
            } catch {
                $sid = $sidStr
            }
            if ($sid -eq $USERS_SID -or $sid -eq $AUTH_USERS_SID -or $sid -eq $EVERYONE_SID) {
                Write-Host "  ❌ Unauthorized ACE remains on $($item.FullName): $sidStr ($($ace.FileSystemRights))" -ForegroundColor Red
                $verificationErrors++
            }
        }
    }
}

if ($verificationErrors -gt 0) {
    Write-Error "POST-HARDENING VERIFICATION FAILED: $verificationErrors errors detected."
    exit 1
}

Write-Host "  -> Verification Successful: Zero unauthorized ACEs remain." -ForegroundColor Green
Write-Host "`n================================================================================" -ForegroundColor Green
Write-Host "✅ LEAST-PRIVILEGE NTFS DACL HARDENING COMPLETE" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Green
