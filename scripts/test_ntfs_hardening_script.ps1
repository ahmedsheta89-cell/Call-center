<#
.SYNOPSIS
    Test Harness for scripts/windows/prepare_ntfs_acl_hardening.ps1
.DESCRIPTION
    Verifies all safety gates, parameter validations, allowlists, baseline capture,
    metadata/schema/coverage validation, TestMode Apply execution, exact DACL restoration
    verification on Rollback, fault-injection fail-closed checks, and idempotency.

    SAFETY ASSURANCE:
    - Never modifies operational directories (Data\OMNIFLOW_OS, Backups\OMNIFLOW_OS).
    - Never invokes operational -Apply or -Rollback on real data.
    - Works dynamically on both local Windows workstations and ephemeral GitHub Actions Windows runners.
#>

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "🧪 OMNIFLOW OS — NTFS ACL HARDENING & ROLLBACK VERIFICATION HARNESS" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$scriptPath = Join-Path $PSScriptRoot "windows\prepare_ntfs_acl_hardening.ps1"
if (-not (Test-Path $scriptPath)) {
    Write-Error "Test Abort: Cannot locate prepare_ntfs_acl_hardening.ps1 at $scriptPath"
    exit 1
}

# Portable temporary root resolution (supports GitHub Actions $env:RUNNER_TEMP, explicit override, or local drive)
$targetBase = if ($env:OMNIFLOW_NTFS_TEST_ROOT) {
    $env:OMNIFLOW_NTFS_TEST_ROOT
} elseif ($env:RUNNER_TEMP) {
    $env:RUNNER_TEMP
} elseif (Test-Path "F:\Dev_Workspace") {
    "F:\Dev_Workspace"
} else {
    [System.IO.Path]::GetTempPath().TrimEnd('\')
}
$targetBase = [System.IO.Path]::GetFullPath($targetBase).TrimEnd('\')

$uniqueId = "$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())_$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$fixtureRoot = Join-Path $targetBase "Temp\OMNIFLOW_OS\test_ntfs_fixture_$uniqueId"
$testDataDir = Join-Path $fixtureRoot "test_data"
$testBackupDir = Join-Path $fixtureRoot "test_backups"
$testRollbackFile = Join-Path $fixtureRoot "baseline.json"
$ownerMarkerPath = Join-Path $fixtureRoot ".omniflow_test_owner"

New-Item -ItemType Directory -Path $testDataDir -Force | Out-Null
New-Item -ItemType Directory -Path $testBackupDir -Force | Out-Null

@{
    tag = "OMNIFLOW_NTFS_TEST_ISOLATION"
    createdBy = "test_ntfs_hardening_script.ps1"
    pid = $PID
    createdAt = [DateTimeOffset]::UtcNow.ToString("o")
} | ConvertTo-Json | Set-Content -Path $ownerMarkerPath -Encoding UTF8

# Seed fixture files and nested directories
$rootDbFile = Join-Path $testDataDir "test_db.json"
Set-Content -Path $rootDbFile -Value '{"test":true}'
$testNestedDir = Join-Path $testDataDir "nested_dir"
New-Item -ItemType Directory -Path $testNestedDir -Force | Out-Null
$nestedFile = Join-Path $testNestedDir "nested_file.txt"
Set-Content -Path $nestedFile -Value 'nested content'
$backupFile = Join-Path $testBackupDir "test_backup.bak"
Set-Content -Path $backupFile -Value '{"test":true}'

# Plant an explicit permissive Users ACE on testDataDir so we prove -Apply removes it and -Rollback restores it
$mySid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls "$testDataDir" /grant "*S-1-5-32-545:(OI)(CI)R" | Out-Null
& icacls "$testBackupDir" /grant "*S-1-5-32-545:(OI)(CI)R" | Out-Null

$passed = 0
$failed = 0

function Assert-Test([bool]$condition, [string]$msg, [object]$res = $null) {
    if ($condition) {
        Write-Host "  ✅ [PASS] $msg" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host "  ❌ [FAIL] $msg" -ForegroundColor Red
        if ($res) {
            Write-Host "     ExitCode: $($res.ExitCode)" -ForegroundColor DarkGray
            Write-Host "     Output  : $($res.Output)" -ForegroundColor DarkGray
        }
        $global:failed++
    }
}

function Invoke-ScriptTest([string]$Arguments, [hashtable]$EnvOverrides = @{}) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" $Arguments"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    foreach ($k in $EnvOverrides.Keys) {
        $psi.Environment[$k] = [string]$EnvOverrides[$k]
    }

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    return [PSCustomObject]@{
        ExitCode = $proc.ExitCode
        Output = "$stdout`n$stderr"
    }
}

try {
    # --------------------------------------------------------------------------
    # 1. Operational Mode Safety Gates
    # --------------------------------------------------------------------------
    Write-Host "`n[1/16] Testing Operational Mode: Missing -ExpectedOwnerSid..." -ForegroundColor Yellow
    $res1 = Invoke-ScriptTest "-TargetRoot `"$targetBase`""
    Assert-Test ($res1.ExitCode -eq 1 -and $res1.Output -match "(?s)ExpectedOwnerSid is.*mandatory in operational mode") "Operational mode without -ExpectedOwnerSid aborts with exit code 1" $res1

    Write-Host "`n[2/16] Testing Operational Mode: Invalid SID Pattern..." -ForegroundColor Yellow
    $res2 = Invoke-ScriptTest "-TargetRoot `"$targetBase`" -ExpectedOwnerSid S-1-5-32-544"
    Assert-Test ($res2.ExitCode -eq 1 -and $res2.Output -match "(?s)does not match valid Windows user SID pattern") "Operational mode with non-user SID pattern aborts safely" $res2

    Write-Host "`n[3/16] Testing Operational Mode: Custom Directory Prohibition..." -ForegroundColor Yellow
    $res3 = Invoke-ScriptTest "-TargetRoot `"$targetBase`" -ExpectedOwnerSid $mySid -CustomDataDir `"$testDataDir`""
    Assert-Test ($res3.ExitCode -eq 1 -and $res3.Output -match "(?s)Custom directory.*strictly forbidden in operational mode") "Operational mode strictly forbids custom directory parameters" $res3

    # --------------------------------------------------------------------------
    # 2. TestMode Allowlist & Audit Mode
    # --------------------------------------------------------------------------
    Write-Host "`n[4/16] Testing -TestMode Allowlist Enforcement..." -ForegroundColor Yellow
    $unauthDir = $PSScriptRoot
    $res4 = Invoke-ScriptTest "-TestMode -TargetRoot `"$targetBase`" -CustomDataDir `"$unauthDir`""
    Assert-Test ($res4.ExitCode -eq 1 -and $res4.Output -match "(?s)violates security boundary") "Test mode rejects targets outside Temp\OMNIFLOW_OS allowlist" $res4

    Write-Host "`n[5/16] Testing -TestMode Read-Only Audit (Zero Modification)..." -ForegroundColor Yellow
    $res5 = Invoke-ScriptTest "-TestMode -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`" -AuditOnly"
    Assert-Test ($res5.ExitCode -eq 0 -and $res5.Output -match "READ-ONLY AUDIT MODE") "Audit mode runs successfully without errors" $res5
    Assert-Test (-not (Test-Path $testRollbackFile)) "Audit mode makes ZERO modifications and does NOT create baseline file"

    # --------------------------------------------------------------------------
    # 3. Apply Invariant: Missing Baseline Rejection
    # --------------------------------------------------------------------------
    Write-Host "`n[6/16] Testing -Apply Invariant: Refusal when Baseline Absent..." -ForegroundColor Yellow
    $res6 = Invoke-ScriptTest "-TestMode -Apply -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res6.ExitCode -eq 1 -and $res6.Output -match "(?s)APPLY ABORT: Baseline file not found.*-CaptureBaseline") "-Apply strictly refuses execution when baseline is absent" $res6
    Assert-Test (-not (Test-Path $testRollbackFile)) "-Apply does NOT automatically generate baseline when missing"

    # --------------------------------------------------------------------------
    # 4. Explicit Baseline Capture & Overwrite Protection
    # --------------------------------------------------------------------------
    Write-Host "`n[7/16] Testing -CaptureBaseline & -ForceOverwrite Protection..." -ForegroundColor Yellow
    $res7a = Invoke-ScriptTest "-TestMode -CaptureBaseline -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res7a.ExitCode -eq 0 -and (Test-Path $testRollbackFile)) "Explicit -CaptureBaseline successfully creates baseline file" $res7a

    $baselineData = Get-Content -Path $testRollbackFile -Raw | ConvertFrom-Json
    Assert-Test (
        $baselineData.SchemaVersion -eq "1.1.0-dacl-only" -and
        $baselineData.OwnerSid -eq $mySid -and
        $baselineData.EntryCount -eq $baselineData.Entries.Count -and
        $baselineData.TargetDirectories.Count -eq 2
    ) "Baseline envelope contains verified SchemaVersion, OwnerSid, TargetDirectories, and EntryCount"

    # Second capture without -ForceOverwrite must fail
    $res7b = Invoke-ScriptTest "-TestMode -CaptureBaseline -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res7b.ExitCode -eq 1 -and $res7b.Output -match "(?s)already exists.*-ForceOverwrite") "Baseline capture prevents silent overwrite without -ForceOverwrite" $res7b

    # Third capture with -ForceOverwrite must succeed
    $res7c = Invoke-ScriptTest "-TestMode -CaptureBaseline -ForceOverwrite -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res7c.ExitCode -eq 0 -and $res7c.Output -match "Baseline captured") "Baseline capture with -ForceOverwrite succeeds" $res7c

    # --------------------------------------------------------------------------
    # 5. Baseline Integrity Validation: Corrupt, Metadata Mismatch, Coverage & Scope Tampering
    # --------------------------------------------------------------------------
    Write-Host "`n[8/16] Testing Malformed/Corrupt Baseline Rejection on -Rollback..." -ForegroundColor Yellow
    $badBaselineFile = Join-Path $fixtureRoot "corrupt_baseline.json"
    Set-Content -Path $badBaselineFile -Value "INVALID JSON CONTENT"
    $res8 = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$badBaselineFile`""
    Assert-Test ($res8.ExitCode -eq 1 -and $res8.Output -match "ROLLBACK ABORT: Rollback baseline JSON[\s\S]*is invalid") "Corrupted baseline JSON is rejected cleanly fail-closed" $res8

    Write-Host "`n[9/16] Testing Out-of-Scope, Incomplete Coverage & Metadata Tampering Rejection..." -ForegroundColor Yellow
    $tamperedBaselineFile = Join-Path $fixtureRoot "tampered_baseline.json"
    $tamperedEnvelope = [PSCustomObject]@{
        SchemaVersion = "1.1.0-dacl-only"
        Scope = "Test"
        OwnerSid = $mySid
        TargetDirectories = @($testDataDir, $testBackupDir)
        EntryCount = 1
        Entries = @(
            [PSCustomObject]@{
                Path = "C:\Windows\System32\cmd.exe"
                IsContainer = $false
                SDDL = "D:PAI(A;;GA;;;SY)"
                AreAccessRulesProtected = $true
            }
        )
    }
    $tamperedEnvelope | ConvertTo-Json -Depth 5 | Set-Content -Path $tamperedBaselineFile -Encoding UTF8
    $res9a = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$tamperedBaselineFile`""
    Assert-Test ($res9a.ExitCode -eq 1 -and $res9a.Output -match "outside authorized[\s\S]*target directories") "Out-of-scope baseline path tampering rejected fail-closed" $res9a

    # Incomplete coverage: valid entry for testDataDir only, omitting testBackupDir entry!
    $incompleteBaselineFile = Join-Path $fixtureRoot "incomplete_baseline.json"
    $incompleteEnvelope = [PSCustomObject]@{
        SchemaVersion = "1.1.0-dacl-only"
        Scope = "Test"
        OwnerSid = $mySid
        TargetDirectories = @($testDataDir, $testBackupDir)
        EntryCount = 1
        Entries = @($baselineData.Entries | Where-Object { $_.Path -eq $testDataDir } | Select-Object -First 1)
    }
    $incompleteEnvelope | ConvertTo-Json -Depth 5 | Set-Content -Path $incompleteBaselineFile -Encoding UTF8
    $res9b = Invoke-ScriptTest "-TestMode -Apply -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$incompleteBaselineFile`""
    Assert-Test ($res9b.ExitCode -eq 1 -and $res9b.Output -match "(?s)complete target coverage") "Incomplete baseline missing target coverage rejected before -Apply" $res9b

    # Wrong OwnerSid metadata
    $wrongOwnerFile = Join-Path $fixtureRoot "wrong_owner_baseline.json"
    $wrongOwnerEnv = $baselineData | ConvertTo-Json -Depth 6 | ConvertFrom-Json
    $wrongOwnerEnv.OwnerSid = "S-1-5-21-999999-999999-999999-1001"
    $wrongOwnerEnv | ConvertTo-Json -Depth 6 | Set-Content -Path $wrongOwnerFile -Encoding UTF8
    $res9c = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$wrongOwnerFile`""
    Assert-Test ($res9c.ExitCode -eq 1 -and $res9c.Output -match "does not match[\s\S]*verified OwnerSid") "Mismatched OwnerSid metadata rejected fail-closed" $res9c

    # --------------------------------------------------------------------------
    # 6. Real TestMode Apply Execution & DACL Hardening Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[10/16] Testing Real -TestMode -Apply Execution & Hardening Enforcement..." -ForegroundColor Yellow
    $resApply = Invoke-ScriptTest "-TestMode -Apply -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($resApply.ExitCode -eq 0 -and $resApply.Output -match "LEAST-PRIVILEGE NTFS DACL HARDENING COMPLETE") "-TestMode -Apply succeeds cleanly against captured baseline" $resApply

    $hardenedDataAcl = (Get-Item $testDataDir).GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    $hasUsersAfterApply = ($hardenedDataAcl.Access | Where-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq "S-1-5-32-545" }).Count -gt 0
    Assert-Test ($hardenedDataAcl.AreAccessRulesProtected -and -not $hasUsersAfterApply) "Verified inheritance broken and Users ACE purged after -TestMode -Apply"

    # --------------------------------------------------------------------------
    # 7. Exact DACL Rollback Restoration & Comparison Against Captured Baseline
    # --------------------------------------------------------------------------
    Write-Host "`n[11/16] Testing Exact DACL Restoration Against Captured Baseline..." -ForegroundColor Yellow
    $resRollback = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($resRollback.ExitCode -eq 0 -and $resRollback.Output -match "Rollback completed successfully") "-TestMode -Rollback completes cleanly after -Apply" $resRollback

    $allMatch = $true
    foreach ($entry in $baselineData.Entries) {
        if (Test-Path $entry.Path) {
            $curSec = (Get-Item -Path $entry.Path -Force).GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
            $curSddl = $curSec.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)
            if ($curSddl -ne $entry.SDDL -or $curSec.AreAccessRulesProtected -ne $entry.AreAccessRulesProtected) {
                Write-Host "  [Mismatch] $($entry.Path) -> Current SDDL: $curSddl vs Baseline SDDL: $($entry.SDDL)" -ForegroundColor Red
                $allMatch = $false
            }
        }
    }
    Assert-Test $allMatch "Every resulting DACL and protection flag matches captured baseline SDDL bit-for-bit after Rollback"

    # --------------------------------------------------------------------------
    # 8. Fault Injection During Apply & Rollback (Fail-Closed Exit Code 1 Proofs)
    # --------------------------------------------------------------------------
    Write-Host "`n[12/16] Testing Fault Injection During -Apply..." -ForegroundColor Yellow
    $resApplyFault = Invoke-ScriptTest "-TestMode -Apply -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`"" @{ OMNIFLOW_TEST_INJECT_APPLY_FAIL = "1" }
    Assert-Test ($resApplyFault.ExitCode -eq 1 -and $resApplyFault.Output -match "HARDENING FAILED") "Injected failure during -Apply aborts fail-closed with exit code 1" $resApplyFault

    Write-Host "`n[13/16] Testing -Rollback With New Item & Failed icacls /reset (Must Fail Closed)..." -ForegroundColor Yellow
    $postCaptureFile = Join-Path $testDataDir "newly_created_after_baseline.txt"
    Set-Content -Path $postCaptureFile -Value "Created after baseline capture"
    $resRollbackFail = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`"" @{ OMNIFLOW_TEST_INJECT_ROLLBACK_RESET_FAIL = "1" }
    Assert-Test ($resRollbackFail.ExitCode -eq 1 -and $resRollbackFail.Output -match "ROLLBACK FAILED: icacls /reset failed") "Failed icacls /reset on newly created item exits with code 1 (NEVER returns success)" $resRollbackFail

    # --------------------------------------------------------------------------
    # 9. Rollback Correctness With Removed & New Files + Idempotency
    # --------------------------------------------------------------------------
    Write-Host "`n[14/16] Testing -Rollback With Removed & New Files..." -ForegroundColor Yellow
    Remove-Item -Path $rootDbFile -Force
    $res14 = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res14.ExitCode -eq 0 -and $res14.Output -match "(?s)no longer exists on disk, skipping") "Rollback skips deleted files with notice and succeeds" $res14
    Assert-Test ($res14.Output -match "(?s)Resetting un-baselined item to inherit from parent") "Rollback resets new un-baselined items to inherit from parent" $res14

    Write-Host "`n[15/16] Testing Post-Baseline File Inheritance Flag After Reset..." -ForegroundColor Yellow
    $newItemAcl = (Get-Item $postCaptureFile).GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    Assert-Test (-not $newItemAcl.AreAccessRulesProtected) "Newly created file inherits cleanly from restored parent container"

    Write-Host "`n[16/16] Testing -Rollback Idempotency..." -ForegroundColor Yellow
    $res16 = Invoke-ScriptTest "-TestMode -Rollback -TargetRoot `"$targetBase`" -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res16.ExitCode -eq 0 -and $res16.Output -match "Rollback completed successfully") "Re-running Rollback is completely idempotent and safe" $res16

} finally {
    if ((Test-Path $fixtureRoot) -and (Test-Path $ownerMarkerPath)) {
        Remove-Item -Path $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "🏆 NTFS HARDENING TEST RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
