<#
.SYNOPSIS
    Test Harness for scripts/windows/prepare_ntfs_acl_hardening.ps1
.DESCRIPTION
    Verifies all safety gates, parameter validations, allowlists, baseline capture,
    fail-secure elevation enforcement, apply invariants, and rollback correctness
    of the NTFS ACL hardening script strictly within temporary test fixtures.
    
    SAFETY ASSURANCE:
    - Never modifies operational directories (Data\OMNIFLOW_OS, Backups\OMNIFLOW_OS).
    - Never invokes operational -Apply or -Rollback on real data.
    - All tests run against temporary directories in F:\Dev_Workspace\Temp\OMNIFLOW_OS.
#>

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "🧪 OMNIFLOW OS — NTFS ACL HARDENING SCRIPT TEST HARNESS" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$scriptPath = Join-Path $PSScriptRoot "windows\prepare_ntfs_acl_hardening.ps1"
if (-not (Test-Path $scriptPath)) {
    Write-Error "Test Abort: Cannot locate prepare_ntfs_acl_hardening.ps1 at $scriptPath"
    exit 1
}

$fixtureRoot = "F:\Dev_Workspace\Temp\OMNIFLOW_OS\test_ntfs_fixture_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$testDataDir = Join-Path $fixtureRoot "test_data"
$testBackupDir = Join-Path $fixtureRoot "test_backups"
$testRollbackFile = Join-Path $fixtureRoot "baseline.json"

New-Item -ItemType Directory -Path $testDataDir -Force | Out-Null
New-Item -ItemType Directory -Path $testBackupDir -Force | Out-Null

# Seed fixture files and nested directories
Set-Content -Path (Join-Path $testDataDir "test_db.json") -Value '{"test":true}'
$testNestedDir = Join-Path $testDataDir "nested_dir"
New-Item -ItemType Directory -Path $testNestedDir -Force | Out-Null
Set-Content -Path (Join-Path $testNestedDir "nested_file.txt") -Value 'nested content'
Set-Content -Path (Join-Path $testBackupDir "test_backup.bak") -Value '{"test":true}'

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

function Invoke-ScriptTest([string]$Arguments) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" $Arguments"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

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
    Write-Host "`n[1/12] Testing Operational Mode: Missing -ExpectedOwnerSid..." -ForegroundColor Yellow
    $res1 = Invoke-ScriptTest ""
    Assert-Test ($res1.ExitCode -eq 1 -and $res1.Output -match "(?s)ExpectedOwnerSid is.*mandatory in operational mode") "Operational mode without -ExpectedOwnerSid aborts with exit code 1" $res1

    Write-Host "`n[2/12] Testing Operational Mode: Invalid SID Pattern..." -ForegroundColor Yellow
    $res2 = Invoke-ScriptTest "-ExpectedOwnerSid S-1-5-32-544"
    Assert-Test ($res2.ExitCode -eq 1 -and $res2.Output -match "(?s)does not match valid Windows user SID pattern") "Operational mode with non-user SID pattern aborts safely" $res2

    Write-Host "`n[3/12] Testing Operational Mode: Custom Directory Prohibition..." -ForegroundColor Yellow
    $mySid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $res3 = Invoke-ScriptTest "-ExpectedOwnerSid $mySid -CustomDataDir `"$testDataDir`""
    Assert-Test ($res3.ExitCode -eq 1 -and $res3.Output -match "(?s)Custom directory.*strictly forbidden in operational mode") "Operational mode strictly forbids custom directory parameters" $res3

    # --------------------------------------------------------------------------
    # 2. TestMode Allowlist & Audit Mode
    # --------------------------------------------------------------------------
    Write-Host "`n[4/12] Testing -TestMode Allowlist Enforcement..." -ForegroundColor Yellow
    $unauthDir = "F:\Dev_Workspace\Call-center\scripts"
    $res4 = Invoke-ScriptTest "-TestMode -CustomDataDir `"$unauthDir`""
    Assert-Test ($res4.ExitCode -eq 1 -and $res4.Output -match "(?s)violates security boundary") "Test mode rejects targets outside Temp\OMNIFLOW_OS allowlist" $res4

    Write-Host "`n[5/12] Testing -TestMode Read-Only Audit (Zero Modification)..." -ForegroundColor Yellow
    $res5 = Invoke-ScriptTest "-TestMode -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`" -AuditOnly"
    Assert-Test ($res5.ExitCode -eq 0 -and $res5.Output -match "READ-ONLY AUDIT MODE") "Audit mode runs successfully without errors" $res5
    Assert-Test (-not (Test-Path $testRollbackFile)) "Audit mode makes ZERO modifications and does NOT create baseline file"

    # --------------------------------------------------------------------------
    # 3. Apply Invariant: Missing Baseline Rejection
    # --------------------------------------------------------------------------
    Write-Host "`n[6/12] Testing -Apply Invariant: Refusal when Baseline Absent..." -ForegroundColor Yellow
    $res6 = Invoke-ScriptTest "-TestMode -Apply -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res6.ExitCode -eq 1 -and $res6.Output -match "(?s)APPLY ABORT: Baseline file not found.*-CaptureBaseline") "-Apply strictly refuses execution when baseline is absent" $res6
    Assert-Test (-not (Test-Path $testRollbackFile)) "-Apply does NOT automatically generate baseline when missing"

    # --------------------------------------------------------------------------
    # 4. Explicit Baseline Capture & Overwrite Protection
    # --------------------------------------------------------------------------
    Write-Host "`n[7/12] Testing -CaptureBaseline & -ForceOverwrite Protection..." -ForegroundColor Yellow
    $res7a = Invoke-ScriptTest "-TestMode -CaptureBaseline -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res7a.ExitCode -eq 0 -and (Test-Path $testRollbackFile)) "Explicit -CaptureBaseline successfully creates baseline file" $res7a

    $baselineData = Get-Content -Path $testRollbackFile -Raw | ConvertFrom-Json
    $entries = if ($baselineData.Entries) { $baselineData.Entries } else { $baselineData }
    Assert-Test ($entries.Count -ge 3 -and $entries[0].Path -and $entries[0].SDDL) "Baseline JSON contains valid entries with Path and SDDL properties"

    # Second capture without -ForceOverwrite must fail
    $res7b = Invoke-ScriptTest "-TestMode -CaptureBaseline -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res7b.ExitCode -eq 1 -and $res7b.Output -match "(?s)already exists.*-ForceOverwrite") "Baseline capture prevents silent overwrite without -ForceOverwrite" $res7b

    # Third capture with -ForceOverwrite must succeed
    $res7c = Invoke-ScriptTest "-TestMode -CaptureBaseline -ForceOverwrite -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res7c.ExitCode -eq 0 -and $res7c.Output -match "Baseline captured") "Baseline capture with -ForceOverwrite succeeds" $res7c

    # --------------------------------------------------------------------------
    # 5. Baseline Validation: Corrupt and Out-of-Scope Baseline Rejection
    # --------------------------------------------------------------------------
    Write-Host "`n[8/12] Testing Malformed/Corrupt Baseline Rejection on -Rollback..." -ForegroundColor Yellow
    $badBaselineFile = Join-Path $fixtureRoot "corrupt_baseline.json"
    Set-Content -Path $badBaselineFile -Value "INVALID JSON CONTENT"
    $res8 = Invoke-ScriptTest "-TestMode -Rollback -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$badBaselineFile`""
    Assert-Test ($res8.ExitCode -eq 1 -and $res8.Output -match "ROLLBACK ABORT: Rollback baseline JSON[\s\S]*is invalid") "Corrupted baseline JSON is rejected cleanly fail-closed" $res8

    Write-Host "`n[9/12] Testing Out-of-Scope Baseline Entry Tampering Rejection..." -ForegroundColor Yellow
    $tamperedBaselineFile = Join-Path $fixtureRoot "tampered_baseline.json"
    $tamperedEntries = @(
        [PSCustomObject]@{
            Path = "C:\Windows\System32\cmd.exe"
            IsContainer = $false
            SDDL = "O:BAG:BAD:(A;;GA;;;SY)"
            AreAccessRulesProtected = $true
        }
    )
    $tamperedEnvelope = [PSCustomObject]@{
        SchemaVersion = "1.1.0-dacl-only"
        Entries = $tamperedEntries
    }
    $tamperedEnvelope | ConvertTo-Json -Depth 5 | Set-Content -Path $tamperedBaselineFile -Encoding UTF8
    $res9 = Invoke-ScriptTest "-TestMode -Rollback -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$tamperedBaselineFile`""
    Assert-Test ($res9.ExitCode -eq 1 -and $res9.Output -match "(?s)outside authorized target directories") "Out-of-scope baseline path tampering is rejected fail-closed" $res9

    # --------------------------------------------------------------------------
    # 6. Rollback Correctness: Original, New, and Deleted Items
    # --------------------------------------------------------------------------
    Write-Host "`n[10/12] Testing -Rollback on Existing Baseline..." -ForegroundColor Yellow
    $res10 = Invoke-ScriptTest "-TestMode -Rollback -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res10.ExitCode -eq 0 -and $res10.Output -match "Rollback completed successfully") "Rollback on standard baseline executes successfully" $res10

    Write-Host "`n[11/12] Testing -Rollback with Removed and New Files..." -ForegroundColor Yellow
    # Create new file (created AFTER baseline capture)
    $postCaptureFile = Join-Path $testDataDir "newly_created_after_baseline.txt"
    Set-Content -Path $postCaptureFile -Value "I was created after baseline capture"
    # Remove an original file that WAS in baseline
    $removedFile = Join-Path $testDataDir "test_db.json"
    Remove-Item -Path $removedFile -Force

    $res11 = Invoke-ScriptTest "-TestMode -Rollback -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res11.ExitCode -eq 0 -and $res11.Output -match "(?s)no longer exists on disk, skipping") "Rollback skips deleted files with notice and succeeds" $res11
    Assert-Test ($res11.Output -match "(?s)Resetting un-baselined item to inherit from parent") "Rollback resets new un-baselined items to inherit from parent" $res11

    # --------------------------------------------------------------------------
    # 7. Rollback Idempotency
    # --------------------------------------------------------------------------
    Write-Host "`n[12/12] Testing -Rollback Idempotency (Re-running Safely)..." -ForegroundColor Yellow
    $res12 = Invoke-ScriptTest "-TestMode -Rollback -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res12.ExitCode -eq 0 -and $res12.Output -match "Rollback completed successfully") "Re-running Rollback is completely idempotent and safe" $res12

} finally {
    if (Test-Path $fixtureRoot) {
        Remove-Item -Path $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "🏆 NTFS HARDENING TEST RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
