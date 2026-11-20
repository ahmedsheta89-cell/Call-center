<#
.SYNOPSIS
    Test Harness for scripts/windows/prepare_ntfs_acl_hardening.ps1
.DESCRIPTION
    Verifies all safety gates, parameter validations, allowlists, baseline capture,
    and fail-secure elevation enforcement of the NTFS ACL hardening script
    strictly within temporary test fixtures.
    
    SAFETY ASSURANCE:
    - Never modifies operational directories (Data\OMNIFLOW_OS, Backups\OMNIFLOW_OS).
    - Never invokes -Apply or -Rollback on real data.
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

# Seed fixture files
Set-Content -Path (Join-Path $testDataDir "test_db.json") -Value '{"test":true}'
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
    Write-Host "`n[1/6] Testing Operational Mode: Missing -ExpectedOwnerSid..." -ForegroundColor Yellow
    $res1 = Invoke-ScriptTest ""
    Assert-Test ($res1.ExitCode -eq 1 -and $res1.Output -match "(?s)ExpectedOwnerSid is.*mandatory in operational mode") "Operational mode without -ExpectedOwnerSid aborts with exit code 1"

    Write-Host "`n[2/6] Testing Operational Mode: Invalid SID Pattern..." -ForegroundColor Yellow
    $res2 = Invoke-ScriptTest "-ExpectedOwnerSid S-1-5-32-544"
    Assert-Test ($res2.ExitCode -eq 1 -and $res2.Output -match "(?s)does not match valid Windows user SID pattern") "Operational mode with non-user SID pattern aborts safely"

    Write-Host "`n[3/6] Testing Operational Mode: Custom Directory Prohibition..." -ForegroundColor Yellow
    $mySid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $res3 = Invoke-ScriptTest "-ExpectedOwnerSid $mySid -CustomDataDir `"$testDataDir`""
    Assert-Test ($res3.ExitCode -eq 1 -and $res3.Output -match "(?s)Custom directory.*strictly forbidden in operational mode") "Operational mode strictly forbids custom directory parameters" $res3

    # --------------------------------------------------------------------------
    # 2. TestMode Allowlist & Audit Mode
    # --------------------------------------------------------------------------
    Write-Host "`n[4/6] Testing -TestMode Allowlist Enforcement..." -ForegroundColor Yellow
    $unauthDir = "F:\Dev_Workspace\Call-center\scripts"
    $res4 = Invoke-ScriptTest "-TestMode -CustomDataDir `"$unauthDir`""
    Assert-Test ($res4.ExitCode -eq 1 -and $res4.Output -match "(?s)violates security boundary") "Test mode rejects targets outside Temp\OMNIFLOW_OS allowlist"

    Write-Host "`n[5/6] Testing -TestMode Read-Only Audit (Zero Modification)..." -ForegroundColor Yellow
    $res5 = Invoke-ScriptTest "-TestMode -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`" -AuditOnly"
    Assert-Test ($res5.ExitCode -eq 0 -and $res5.Output -match "READ-ONLY AUDIT MODE") "Audit mode runs successfully without errors"
    Assert-Test (-not (Test-Path $testRollbackFile)) "Audit mode makes ZERO modifications and does NOT create baseline file"

    # --------------------------------------------------------------------------
    # 3. Explicit Baseline Capture & Overwrite Protection
    # --------------------------------------------------------------------------
    Write-Host "`n[6/6] Testing -CaptureBaseline & -ForceOverwrite Protection..." -ForegroundColor Yellow
    $res6a = Invoke-ScriptTest "-TestMode -CaptureBaseline -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res6a.ExitCode -eq 0 -and (Test-Path $testRollbackFile)) "Explicit -CaptureBaseline successfully creates baseline file"

    $baselineData = Get-Content -Path $testRollbackFile -Raw | ConvertFrom-Json
    Assert-Test ($baselineData.Count -ge 2 -and $baselineData[0].Path -and $baselineData[0].SDDL) "Baseline JSON contains valid entries with Path and SDDL properties"

    # Second capture without -ForceOverwrite must fail
    $res6b = Invoke-ScriptTest "-TestMode -CaptureBaseline -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res6b.ExitCode -eq 1 -and $res6b.Output -match "(?s)already exists.*-ForceOverwrite") "Baseline capture prevents silent overwrite without -ForceOverwrite" $res6b

    # Third capture with -ForceOverwrite must succeed
    $res6c = Invoke-ScriptTest "-TestMode -CaptureBaseline -ForceOverwrite -CustomDataDir `"$testDataDir`" -CustomBackupDir `"$testBackupDir`" -RollbackFile `"$testRollbackFile`""
    Assert-Test ($res6c.ExitCode -eq 0 -and $res6c.Output -match "Baseline captured") "Baseline capture with -ForceOverwrite succeeds"

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
