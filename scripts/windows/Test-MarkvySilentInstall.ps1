<#
.SYNOPSIS
    Installs (or uninstalls) a Markvy MSI silently, the way Microsoft Partner Center does, and reports the result.

.DESCRIPTION
    Runs:  msiexec.exe /i "<msi>" /qn /norestart /L*v "<log>"     (or /x for -Uninstall)
    and waits for it. /qn shows no installer user interface at all.

    This changes the computer: it installs or removes Markvy for all users. Run it on a clean test machine or VM,
    from an elevated PowerShell (a per-machine MSI cannot elevate itself under /qn, so it fails with 1603/1625).
    The script refuses to start when it is not elevated, and reports BLOCKED.

    On failure it finds the first action that returned "Return value 3" in the verbose log and prints the lines
    before it, which usually name the real cause.

.PARAMETER MsiPath
    The MSI to install, or (with -Uninstall) the MSI whose product to remove.

.PARAMETER ExpectedSha256
    Optional. Refuse to install unless the MSI has this SHA-256.

.PARAMETER LogDirectory
    Where to keep the verbose MSI log and the JSON result. Default: %TEMP%\markvy-install-logs

.EXAMPLE
    .\Test-MarkvySilentInstall.ps1 -MsiPath .\Markvy_0.1.0_x64_en-US.msi

.EXAMPLE
    .\Test-MarkvySilentInstall.ps1 -MsiPath .\Markvy_0.1.0_x64_en-US.msi -Uninstall

.NOTES
    Exit codes: 0 success (including 3010/1641, restart required), 1 installer failure, 2 bad input
    (missing MSI, hash mismatch), 3 blocked (not elevated, or another installation in progress: 1618).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$MsiPath,
    [string]$ExpectedSha256,
    [string]$LogDirectory = (Join-Path $env:TEMP 'markvy-install-logs'),
    [switch]$Uninstall,
    [int]$TimeoutMinutes = 20
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'MarkvyStore.psm1') -Force

$exitMeaning = @{
    0    = @('PASS', 'Success')
    1641 = @('PASS', 'Success; the installer started a restart')
    3010 = @('PASS', 'Success; a restart is required to finish')
    1602 = @('FAIL', 'Cancelled by the user')
    1603 = @('FAIL', 'Fatal error during installation (see the log)')
    1605 = @('FAIL', 'This product is not installed (uninstall only)')
    1618 = @('BLOCKED', 'Another installation is already in progress')
    1619 = @('FAIL', 'The installation package could not be opened')
    1620 = @('FAIL', 'The installation package could not be opened (not a valid MSI)')
    1625 = @('BLOCKED', 'Installation forbidden by system policy (usually: not elevated)')
    1633 = @('FAIL', 'This installation package is not supported on this processor type')
    1638 = @('FAIL', 'Another version of this product is already installed')
}

try { $msi = (Resolve-Path -LiteralPath $MsiPath).Path } catch { Write-Host -ForegroundColor Red "ERROR: MSI not found: $MsiPath"; exit 2 }
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$operation = if ($Uninstall) { 'uninstall' } else { 'install' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $LogDirectory "Markvy-$operation-$stamp.log"
$resultFile = Join-Path $LogDirectory "Markvy-$operation-$stamp.json"
$sha = Get-FileSha256 -Path $msi

function Finish($status, $code, $meaning, $elapsed, $detail) {
    $result = [ordered]@{
        Operation = $operation; Msi = $msi; Sha256 = $sha; Status = $status; ExitCode = $code; Meaning = $meaning
        ElapsedSeconds = $elapsed; Started = $started.ToString('o'); Log = $log; Detail = $detail
        Command = "msiexec.exe $($arguments -join ' ')"
    }
    $result | ConvertTo-Json -Depth 4 | Set-Content -Path $resultFile -Encoding UTF8
    [pscustomobject]$result | Format-List | Out-String | Write-Host
    Write-Host "Result: $resultFile"
    switch ($status) { 'PASS' { exit 0 } 'BLOCKED' { exit 3 } 'BAD' { exit 2 } default { exit 1 } }
}

$started = Get-Date
$arguments = @($(if ($Uninstall) { '/x' } else { '/i' }), "`"$msi`"", '/qn', '/norestart', '/L*v', "`"$log`"")

if ($ExpectedSha256 -and $sha -ne $ExpectedSha256.ToLowerInvariant()) {
    Finish 'BAD' $null "SHA-256 mismatch: expected $ExpectedSha256, got $sha" 0 ''
}
if (-not (Test-IsElevated)) {
    Finish 'BLOCKED' $null 'Not elevated. Run PowerShell as administrator (a per-machine MSI cannot ask for elevation under /qn).' 0 ''
}

Write-Host "Running: msiexec.exe $($arguments -join ' ')"
$process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList $arguments -PassThru -WindowStyle Hidden
if (-not $process.WaitForExit($TimeoutMinutes * 60 * 1000)) {
    Finish 'FAIL' $null "No result after $TimeoutMinutes minutes. A silent installer must never wait for input; the process is still running (ID $($process.Id))." ([int]((Get-Date) - $started).TotalSeconds) ''
}
$code = $process.ExitCode
$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
$known = $exitMeaning[[int]$code]
$status = if ($known) { $known[0] } else { 'FAIL' }
$meaning = if ($known) { $known[1] } else { "Windows Installer error $code (see https://learn.microsoft.com/windows/win32/msi/error-codes)" }

$detail = ''
if ($status -ne 'PASS' -and (Test-Path $log)) {
    $lines = Get-Content -Path $log -Encoding Unicode -ErrorAction SilentlyContinue
    if (-not $lines) { $lines = Get-Content -Path $log }
    $hit = ($lines | Select-String -Pattern 'Return value 3' | Select-Object -First 1)
    if ($hit) {
        $from = [math]::Max(0, $hit.LineNumber - 25)
        $detail = "First failing action (line $($hit.LineNumber) of the log):`n" + (($lines[$from..($hit.LineNumber - 1)]) -join "`n")
    } else {
        $detail = 'No "Return value 3" in the log; check the last 40 lines:' + "`n" + (($lines | Select-Object -Last 40) -join "`n")
    }
}
Finish $status $code $meaning $elapsed $detail
