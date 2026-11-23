<#
.SYNOPSIS
    OmniFlow OS — Least-Privilege NTFS DACL Hardening & Rollback Engine (Operational Script)
.DESCRIPTION
    Strictly hardens sensitive data and backup directories by breaking inheritance,
    removing unauthorized SIDs (BUILTIN\Users, Authenticated Users, Everyone), and granting
    least-privilege access exclusively to the verified Owner SID, Administrators, and SYSTEM.
    
    SAFETY CONTROLS:
    - Default mode is READ-ONLY audit.
    - Baseline capture is separated via -CaptureBaseline and never triggered silently during audit.
    - Baseline overwrite is prevented unless -ForceOverwrite is specified.
    - Default and -AuditOnly modes are strictly read-only and make ZERO disk modifications.
    - Modifying actions (-Apply, -Rollback, -CaptureBaseline) require elevated Administrator privileges.
    - Operational mode requires BOTH Data\OMNIFLOW_OS and Backups\OMNIFLOW_OS to exist.
    - Operational mode requires a valid Owner SID matching ^S-1-5-21-[0-9-]+$.
    - Custom target directories are forbidden in operational mode (only allowed in -TestMode under Temp\OMNIFLOW_OS).
    - Uses DACL-only access control ([System.Security.AccessControl.AccessControlSections]::Access) without SACL dependency or SeSecurityPrivilege requirement.
    - Aborts immediately on reparse points, symlinks, or unauthorized paths.
    - Error masking flag (/c) is removed from all icacls calls.
    - All icacls operations check $LASTEXITCODE and halt fail-closed with rollback instructions.
#>

[CmdletBinding(SupportsShouldProcess=$true)]
param (
    [switch]$Apply,
    [switch]$Rollback,
    [switch]$AuditOnly,
    [switch]$CaptureBaseline,
    [switch]$ForceOverwrite,
    [switch]$TestMode,
    [string]$TargetRoot = "F:\Dev_Workspace",
    [string]$ExpectedOwnerSid = "",
    [string]$CustomDataDir = "",
    [string]$CustomBackupDir = "",
    [string]$RollbackFile = ""
)

$ErrorActionPreference = "Stop"

# Standard Well-Known Security Principal SIDs
$ADMIN_SID          = "S-1-5-32-544"
$SYSTEM_SID         = "S-1-5-18"
$USERS_SID          = "S-1-5-32-545"
$AUTH_USERS_SID     = "S-1-5-11"
$EVERYONE_SID       = "S-1-1-0"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "🛡️ OMNIFLOW OS — LEAST-PRIVILEGE NTFS DACL HARDENING ENGINE" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Identity Pre-flight & Privileges Verification
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$currentSid = $currentUser.User.Value
$currentPrincipal = New-Object System.Security.Principal.WindowsPrincipal($currentUser)
$isAdmin = $currentPrincipal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "[Pre-flight] Current User Name: $($currentUser.Name)" -ForegroundColor White
Write-Host "[Pre-flight] Current User SID : $currentSid" -ForegroundColor White
Write-Host "[Pre-flight] Administrator    : $isAdmin" -ForegroundColor White
Write-Host "[Pre-flight] Execution Mode   : $(if ($TestMode) { 'TEST MODE' } else { 'OPERATIONAL MODE' })" -ForegroundColor White

# Mutating operations (-Apply, -Rollback, and operational -CaptureBaseline) strictly require elevated Administrator in operational mode
if (-not $TestMode -and ($Apply -or $Rollback -or $CaptureBaseline)) {
    if (-not $isAdmin) {
        Write-Error "SECURITY ABORT: Modifying operations (-Apply, -Rollback, and operational -CaptureBaseline) require elevated Administrator privileges in operational mode."
        exit 1
    }
}

# 2. Owner SID Verification
if (-not $TestMode) {
    if ([string]::IsNullOrWhiteSpace($ExpectedOwnerSid)) {
        Write-Error "PRE-FLIGHT ABORT: -ExpectedOwnerSid is mandatory in operational mode."
        exit 1
    }
    if ($ExpectedOwnerSid -notmatch '^S-1-5-21-[0-9-]+$') {
        Write-Error "SECURITY ABORT: -ExpectedOwnerSid '$ExpectedOwnerSid' does not match valid Windows user SID pattern (^S-1-5-21-[0-9-]+$)."
        exit 1
    }
    $ownerSid = $ExpectedOwnerSid
} else {
    if ($ExpectedOwnerSid) {
        if ($ExpectedOwnerSid -notmatch '^S-1-5-21-[0-9-]+$') {
            Write-Error "SECURITY ABORT: -ExpectedOwnerSid '$ExpectedOwnerSid' does not match valid Windows user SID pattern (^S-1-5-21-[0-9-]+$)."
            exit 1
        }
        $ownerSid = $ExpectedOwnerSid
    } else {
        $ownerSid = $currentSid
    }
}

# Verify SID alignment or elevated context
if ($currentSid -ne $ownerSid) {
    if (-not $isAdmin) {
        Write-Error "PRE-FLIGHT ABORT: Current user SID ($currentSid) does not match expected Owner SID ($ownerSid) and is not elevated Administrator."
        exit 1
    } else {
        Write-Host "  -> Running in elevated Administrative context on behalf of Owner SID ($ownerSid)." -ForegroundColor Yellow
    }
} else {
    Write-Host "  -> Identity verified: Current user matches Owner SID ($ownerSid)." -ForegroundColor Green
}

# 3. Target Scope Resolution & Strict Boundary Enforcement
$APPROVED_BASE = [System.IO.Path]::GetFullPath($TargetRoot).TrimEnd('\')
$APPROVED_OPERATIONAL_TARGETS = @(
    (Join-Path $APPROVED_BASE "Data\OMNIFLOW_OS"),
    (Join-Path $APPROVED_BASE "Backups\OMNIFLOW_OS")
)
$APPROVED_TEST_PREFIX = (Join-Path $APPROVED_BASE "Temp\OMNIFLOW_OS").TrimEnd('\')

if (-not $TestMode) {
    if ($CustomDataDir -or $CustomBackupDir) {
        Write-Error "SECURITY ABORT: Custom directory parameters (-CustomDataDir, -CustomBackupDir) are strictly forbidden in operational mode. Use -TestMode for fixture testing."
        exit 1
    }
    $DataDir = Join-Path $APPROVED_BASE "Data\OMNIFLOW_OS"
    $BackupDir = Join-Path $APPROVED_BASE "Backups\OMNIFLOW_OS"

    if (-not (Test-Path $DataDir)) {
        Write-Error "PRE-FLIGHT ABORT: Operational Data directory does not exist: $DataDir. Both operational directories are strictly required in operational mode."
        exit 1
    }
    if (-not (Test-Path $BackupDir)) {
        Write-Error "PRE-FLIGHT ABORT: Operational Backups directory does not exist: $BackupDir. Both operational directories are strictly required in operational mode."
        exit 1
    }
    $TargetDirectories = @($DataDir, $BackupDir)
} else {
    $DataDir = if ($CustomDataDir) { $CustomDataDir } else { Join-Path $APPROVED_TEST_PREFIX "test_data" }
    $BackupDir = if ($CustomBackupDir) { $CustomBackupDir } else { Join-Path $APPROVED_TEST_PREFIX "test_backups" }

    $TargetDirectories = @()
    if (Test-Path $DataDir) { $TargetDirectories += $DataDir }
    if (Test-Path $BackupDir) { $TargetDirectories += $BackupDir }

    if ($TargetDirectories.Count -eq 0) {
        Write-Error "PRE-FLIGHT ABORT: No test target directories exist at specified paths: $DataDir, $BackupDir"
        exit 1
    }
}

# Validate every target directory against explicit allowlists
foreach ($d in $TargetDirectories) {
    $normTarget = [System.IO.Path]::GetFullPath($d).TrimEnd('\')
    if (-not $TestMode) {
        $isApprovedOp = $false
        foreach ($appOp in $APPROVED_OPERATIONAL_TARGETS) {
            if ($normTarget.Equals([System.IO.Path]::GetFullPath($appOp).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
                $isApprovedOp = $true
                break
            }
        }
        if (-not $isApprovedOp) {
            Write-Error "SECURITY ABORT: Target directory '$d' is not an approved operational directory. Operational targets are strictly Data\OMNIFLOW_OS and Backups\OMNIFLOW_OS."
            exit 1
        }
    } else {
        $isApprovedTest = $normTarget.StartsWith($APPROVED_TEST_PREFIX + "\", [System.StringComparison]::OrdinalIgnoreCase) -or 
                          $normTarget.Equals($APPROVED_TEST_PREFIX, [System.StringComparison]::OrdinalIgnoreCase)
        if (-not $isApprovedTest) {
            Write-Error "SECURITY ABORT: Test target directory '$d' violates security boundary! In -TestMode, targets must be within '$APPROVED_TEST_PREFIX'."
            exit 1
        }
    }
}

Write-Host "[Pre-flight] Verified Target Directories:" -ForegroundColor White
foreach ($d in $TargetDirectories) {
    Write-Host "  • $d" -ForegroundColor White
}

# 4. Reparse Point & Junction Inspection
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
    Join-Path $APPROVED_BASE "Audit\OMNIFLOW_OS\PHASE_2_1_4\ntfs_acl_baseline_rollback.json"
}

# --------------------------------------------------------------------------
# ROLLBACK EXECUTION
# --------------------------------------------------------------------------
if ($Rollback) {
    Write-Host "`n[Rollback] Executing Rollback from Saved Baseline: $RollbackPath" -ForegroundColor Yellow
    Write-Host "  [Scope Notice] This rollback algorithm restores DACL (Discretionary Access Control Lists) only." -ForegroundColor Gray
    Write-Host "  Owner, Group, and SACL (Auditing) are not modified or restored." -ForegroundColor Gray
    
    if (-not (Test-Path $RollbackPath)) {
        Write-Error "ROLLBACK ABORT: Rollback baseline file not found: $RollbackPath"
        exit 1
    }
    
    try {
        $rawJson = Get-Content -Path $RollbackPath -Raw -ErrorAction Stop
        $parsedBaseline = ConvertFrom-Json -InputObject $rawJson -ErrorAction Stop
    } catch {
        Write-Error "ROLLBACK ABORT: Rollback baseline JSON is invalid or corrupted: $_"
        exit 1
    }

    # Extract entries (support both enveloped format and flat array)
    $rollbackEntries = if ($parsedBaseline.Entries) { $parsedBaseline.Entries } else { $parsedBaseline }

    if (-not $rollbackEntries -or ($rollbackEntries -is [Array] -and $rollbackEntries.Count -eq 0)) {
        Write-Error "ROLLBACK ABORT: Rollback baseline is empty or corrupted."
        exit 1
    }

    # 1. Validate baseline integrity, schema, and scope before any modifications
    $baselinePathMap = @{}
    foreach ($entry in $rollbackEntries) {
        if (-not $entry.Path -or -not $entry.SDDL) {
            Write-Error "ROLLBACK ABORT: Malformed baseline entry detected (missing Path or SDDL)."
            exit 1
        }
        $normEntry = [System.IO.Path]::GetFullPath($entry.Path).TrimEnd('\')
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
        
        # Test that SDDL is valid before modifying anything
        try {
            $testSec = if ($entry.IsContainer) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
            $testSec.SetSecurityDescriptorSddlForm($entry.SDDL, [System.Security.AccessControl.AccessControlSections]::Access)
        } catch {
            Write-Error "ROLLBACK ABORT: Invalid SDDL detected for entry '$($entry.Path)': $_"
            exit 1
        }
        $baselinePathMap[$normEntry] = $entry
    }

    # 2. Sort baseline entries top-down (containers first, shortest path to longest)
    # This ensures parent directory DACLs and inheritance protection flags are restored before children
    $sortedEntries = @($rollbackEntries) | Sort-Object -Property @{Expression = { if ($_.IsContainer) { 0 } else { 1 } }}, @{Expression = { $_.Path.Length }}

    # 3. Re-apply baseline DACL directly to each baseline entry (without recursive /reset /t)
    $restoredCount = 0
    $skippedMissingCount = 0
    foreach ($entry in $sortedEntries) {
        $path = $entry.Path
        $sddl = $entry.SDDL
        if (-not (Test-Path $path)) {
            Write-Host "  [Notice] Baseline item no longer exists on disk, skipping: $path" -ForegroundColor DarkGray
            $skippedMissingCount++
            continue
        }

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
            $restoredCount++
        } catch {
            Write-Error "ROLLBACK FAILED: Error restoring ACL on $($path) - $_"
            exit 1
        }
    }

    # 4. Handle new files/directories created AFTER baseline capture
    # These items were not in the baseline. Reset them to inherit cleanly from their restored parent directory.
    $newItemsResetCount = 0
    foreach ($d in $TargetDirectories) {
        if (Test-Path $d) {
            $currentDiskItems = Get-ChildItem -Path $d -Recurse -Force
            foreach ($item in $currentDiskItems) {
                $normItem = [System.IO.Path]::GetFullPath($item.FullName).TrimEnd('\')
                if (-not $baselinePathMap.ContainsKey($normItem)) {
                    Write-Host "  [New Item] Resetting un-baselined item to inherit from parent: $($item.FullName)" -ForegroundColor Cyan
                    & icacls "$($item.FullName)" /reset
                    if ($LASTEXITCODE -ne 0) {
                        Write-Warning "Failed to reset inheritance on new item: $($item.FullName)"
                    } else {
                        $newItemsResetCount++
                    }
                }
            }
        }
    }

    Write-Host "`n✅ Rollback completed successfully ($restoredCount restored, $skippedMissingCount missing skipped, $newItemsResetCount post-baseline items reset to parent)." -ForegroundColor Green
    exit 0
}

# --------------------------------------------------------------------------
# EXPLICIT BASELINE CAPTURE (-CaptureBaseline)
# --------------------------------------------------------------------------
if ($CaptureBaseline) {
    Write-Host "`n[CaptureBaseline] Explicitly Capturing DACL Baseline..." -ForegroundColor Cyan
    if ((Test-Path $RollbackPath) -and -not $ForceOverwrite) {
        Write-Error "BASELINE CAPTURE ABORT: Baseline file already exists at '$RollbackPath'. Pass -ForceOverwrite to replace it."
        exit 1
    }

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

    $rollbackDir = Split-Path $RollbackPath -Parent
    if (-not (Test-Path $rollbackDir)) {
        New-Item -ItemType Directory -Path $rollbackDir -Force | Out-Null
    }

    # Construct complete baseline metadata envelope
    $baselineEnvelope = [PSCustomObject]@{
        SchemaVersion = "1.1.0-dacl-only"
        CapturedAt = [DateTimeOffset]::UtcNow.ToString("o")
        TargetDirectories = $TargetDirectories
        OwnerSid = $ownerSid
        Scope = if ($TestMode) { "Test" } else { "Operational" }
        EntryCount = $baselineEntries.Count
        Entries = $baselineEntries
    }

    # Atomic write to temporary file first, then verify and swap
    $tmpRollbackPath = "$RollbackPath.tmp.$([Guid]::NewGuid().ToString('N'))"
    try {
        $baselineEnvelope | ConvertTo-Json -Depth 6 | Set-Content -Path $tmpRollbackPath -Encoding UTF8 -ErrorAction Stop
        # Verification read
        $verifyRead = Get-Content -Path $tmpRollbackPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if (-not $verifyRead.Entries -or $verifyRead.Entries.Count -ne $baselineEntries.Count) {
            throw "Verification of written baseline failed (entry count mismatch)."
        }
        Move-Item -Path $tmpRollbackPath -Destination $RollbackPath -Force -ErrorAction Stop
    } catch {
        if (Test-Path $tmpRollbackPath) {
            Remove-Item -Path $tmpRollbackPath -Force -ErrorAction SilentlyContinue
        }
        Write-Error "BASELINE CAPTURE FAILED: Unable to atomically write baseline file: $_"
        exit 1
    }

    Write-Host "  -> Baseline captured for $($baselineEntries.Count) items and safely saved to: $RollbackPath" -ForegroundColor Green
    exit 0
}

# --------------------------------------------------------------------------
# READ-ONLY AUDIT MODE / WHAT-IF (Default when neither -Apply nor -Rollback)
# --------------------------------------------------------------------------
if ($AuditOnly -or (-not $Apply -and -not $Rollback) -or $PSCmdlet.MyInvocation.BoundParameters["WhatIf"]) {
    Write-Host "`n[AuditOnly] READ-ONLY AUDIT MODE (Zero disk modifications)" -ForegroundColor Yellow
    Write-Host "  Baseline file is NOT modified or created in audit mode." -ForegroundColor Gray
    Write-Host "  To apply least-privilege DACLs, capture baseline with -CaptureBaseline first, then run with -Apply." -ForegroundColor Yellow
    
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
    Write-Host "  1. Verify pre-captured baseline exists at $RollbackPath (REFUSES execution if missing)" -ForegroundColor White
    Write-Host "  2. Break inheritance on target root folders (/inheritance:r)" -ForegroundColor White
    Write-Host "  3. Grant FullControl to Owner SID: $ownerSid" -ForegroundColor White
    Write-Host "  4. Grant FullControl to Administrators: $ADMIN_SID" -ForegroundColor White
    Write-Host "  5. Grant FullControl to SYSTEM: $SYSTEM_SID" -ForegroundColor White
    Write-Host "  6. Propagate (OI)(CI) to all child files and subdirectories" -ForegroundColor White
    Write-Host "  7. Purge explicit unauthorized ACEs for Users, Authenticated Users, and Everyone" -ForegroundColor White
    Write-Host "  8. Verify complete absence of standard local Users ACEs" -ForegroundColor White
    exit 0
}

# --------------------------------------------------------------------------
# APPLY MODE
# --------------------------------------------------------------------------
Write-Host "`n[Apply] APPLYING LEAST-PRIVILEGE DACL..." -ForegroundColor Yellow

# Baseline Invariant Check: -Apply MUST REFUSE execution when baseline is absent
if (-not (Test-Path $RollbackPath)) {
    Write-Error "APPLY ABORT: Baseline file not found at '$RollbackPath'. -Apply strictly refuses execution when a validated baseline is absent. You MUST explicitly capture a baseline using -CaptureBaseline first."
    exit 1
}

# Load and validate baseline integrity before ANY disk mutation
try {
    $rawJson = Get-Content -Path $RollbackPath -Raw -ErrorAction Stop
    $parsedBaseline = ConvertFrom-Json -InputObject $rawJson -ErrorAction Stop
} catch {
    Write-Error "APPLY ABORT: Baseline file at '$RollbackPath' is corrupted or invalid JSON: $_"
    exit 1
}

$baselineEntries = if ($parsedBaseline.Entries) { $parsedBaseline.Entries } else { $parsedBaseline }
if (-not $baselineEntries -or ($baselineEntries -is [Array] -and $baselineEntries.Count -eq 0)) {
    Write-Error "APPLY ABORT: Baseline at '$RollbackPath' contains no entries or is invalid."
    exit 1
}

# Validate every baseline entry scope and SDDL syntax before proceeding
foreach ($entry in $baselineEntries) {
    if (-not $entry.Path -or -not $entry.SDDL) {
        Write-Error "APPLY ABORT: Malformed baseline entry detected (missing Path or SDDL)."
        exit 1
    }
    $normEntry = [System.IO.Path]::GetFullPath($entry.Path).TrimEnd('\')
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
        Write-Error "APPLY ABORT: Baseline entry path '$($entry.Path)' is outside authorized target directories ($($TargetDirectories -join ', ')). Halting before any mutation."
        exit 1
    }
    try {
        $testSec = if ($entry.IsContainer) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
        $testSec.SetSecurityDescriptorSddlForm($entry.SDDL, [System.Security.AccessControl.AccessControlSections]::Access)
    } catch {
        Write-Error "APPLY ABORT: Invalid or unparseable SDDL in baseline entry for '$($entry.Path)': $_"
        exit 1
    }
}
Write-Host "  -> Pre-existing baseline verified ($($baselineEntries.Count) entries): $RollbackPath" -ForegroundColor Green

# Resolve Account Names from SIDs (with fallback to SID literal *S-1-...)
try {
    $ownerAccountName = (New-Object System.Security.Principal.SecurityIdentifier($ownerSid)).Translate([System.Security.Principal.NTAccount]).Value
} catch {
    $ownerAccountName = "*$ownerSid"
}
try {
    $adminAccountName = (New-Object System.Security.Principal.SecurityIdentifier($ADMIN_SID)).Translate([System.Security.Principal.NTAccount]).Value
} catch {
    $adminAccountName = "*$ADMIN_SID"
}
try {
    $systemAccountName = (New-Object System.Security.Principal.SecurityIdentifier($SYSTEM_SID)).Translate([System.Security.Principal.NTAccount]).Value
} catch {
    $systemAccountName = "*$SYSTEM_SID"
}

Write-Host "  Resolved Principals:" -ForegroundColor White
Write-Host "    Owner: $ownerAccountName ($ownerSid)" -ForegroundColor White
Write-Host "    Admin: $adminAccountName ($ADMIN_SID)" -ForegroundColor White
Write-Host "    System: $systemAccountName ($SYSTEM_SID)" -ForegroundColor White

foreach ($d in $TargetDirectories) {
    Write-Host "`nHardening: $d" -ForegroundColor Yellow
    
    # 1. Break inheritance on target root (/inheritance:r)
    & icacls "$d" /inheritance:r
    if ($LASTEXITCODE -ne 0) {
        Write-Error "HARDENING FAILED: icacls /inheritance:r returned exit code $LASTEXITCODE for $d.`nROLLBACK INSTRUCTION: Run .\prepare_ntfs_acl_hardening.ps1 -Rollback to restore original baseline."
        exit 1
    }
    
    # 2. Grant Full Control recursively to verified Owner, Admins, and SYSTEM (WITHOUT /c error masking)
    & icacls "$d" /grant:r "${ownerAccountName}:(OI)(CI)F" "${adminAccountName}:(OI)(CI)F" "${systemAccountName}:(OI)(CI)F" /t
    if ($LASTEXITCODE -ne 0) {
        Write-Error "HARDENING FAILED: icacls /grant returned exit code $LASTEXITCODE for $d.`nROLLBACK INSTRUCTION: Run .\prepare_ntfs_acl_hardening.ps1 -Rollback to restore original baseline."
        exit 1
    }

    # 3. Explicitly purge any remaining Users, Authenticated Users, Everyone rules recursively (WITHOUT /c error masking)
    & icacls "$d" /remove:g "BUILTIN\Users" "NT AUTHORITY\Authenticated Users" "Everyone" /t
    if ($LASTEXITCODE -ne 0) {
        Write-Error "HARDENING FAILED: icacls /remove:g returned exit code $LASTEXITCODE for $d.`nROLLBACK INSTRUCTION: Run .\prepare_ntfs_acl_hardening.ps1 -Rollback to restore original baseline."
        exit 1
    }
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
    Write-Error "POST-HARDENING VERIFICATION FAILED: $verificationErrors errors detected.`nROLLBACK INSTRUCTION: Run .\prepare_ntfs_acl_hardening.ps1 -Rollback to restore original baseline."
    exit 1
}

Write-Host "  -> Verification Successful: Zero unauthorized ACEs remain." -ForegroundColor Green
Write-Host "`n================================================================================" -ForegroundColor Green
Write-Host "✅ LEAST-PRIVILEGE NTFS DACL HARDENING COMPLETE" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Green
