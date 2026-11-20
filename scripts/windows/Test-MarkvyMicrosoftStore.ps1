<#
.SYNOPSIS
    Runs the Markvy Microsoft Store MSI test matrix (MSI-001 to MSI-018) and writes evidence.

.DESCRIPTION
    Without switches it runs only the static tests, which change nothing:
      MSI-001 metadata, MSI-002 architecture, MSI-003 signature, MSI-014 offline setup (static), MSI-016 checksum.

    -Install adds the tests that install and remove Markvy for all users (opt-in, needs an elevated PowerShell,
    best on a clean VM or a GitHub Actions Windows runner):
      MSI-004/005 silent install and exit code, MSI-006/007 Add or Remove Programs entry and publisher,
      MSI-008 bundleware comparison, MSI-009 launch, MSI-010 smoke test, MSI-015 log inspection,
      MSI-011 silent uninstall, MSI-018 entry removed, MSI-012 reinstall (then removed again).
    -Upgrade -PreviousMsiPath <msi> adds MSI-013/017: install the previous MSI, start it once so it writes its
      data folder, install the new MSI over it, and check there is one entry and the data folder survived.

    Every test ends as PASS, FAIL, BLOCKED or NOT RUN. A test that did not run is never reported as PASS.

.EXAMPLE
    # Static checks only (safe on any PC)
    .\Test-MarkvyMicrosoftStore.ps1 -MsiPath ..\..\release\0.1.0-store\Markvy_0.1.0_x64_en-US.msi -ExpectedVersion 0.1.0

.EXAMPLE
    # Full run on a clean VM, from an elevated PowerShell
    .\Test-MarkvyMicrosoftStore.ps1 -MsiPath .\Markvy_0.1.0_x64_en-US.msi -ExpectedVersion 0.1.0 -Install -EvidenceDirectory C:\evidence

.NOTES
    Exit codes: 0 no test failed, 1 at least one FAIL, 2 bad input.
    Results: <EvidenceDirectory>\results.json and results.md.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$MsiPath,
    [string]$ExpectedProductName = 'Markvy',
    [string]$ExpectedPublisher = 'Sainath Racherla',
    [string]$ExpectedVersion,
    [string]$ExpectedSha256,
    [string]$EvidenceDirectory = (Join-Path $env:TEMP ("markvy-store-evidence-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))),
    [switch]$Install,
    [switch]$Upgrade,
    [string]$PreviousMsiPath,
    [switch]$RequireSignature,
    [int]$LaunchSeconds = 10
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'MarkvyStore.psm1') -Force

try { $msi = (Resolve-Path -LiteralPath $MsiPath).Path } catch { Write-Host -ForegroundColor Red "ERROR: MSI not found: $MsiPath"; exit 2 }
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$ps = (Get-Process -Id $PID).Path
$results = [ordered]@{}
function Set-Result($id, $name, $status, $expected, $actual, $evidence) {
    $results[$id] = [pscustomobject][ordered]@{ Id = $id; Test = $name; Status = $status; Expected = $expected; Actual = $actual; Evidence = $evidence }
}
function Run-Script($name, [string[]]$arguments) {
    & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $name) @arguments | Out-Host
    return $LASTEXITCODE
}
$all = [ordered]@{
    'MSI-001' = 'Inspect MSI metadata'; 'MSI-002' = 'Verify product architecture'; 'MSI-003' = 'Verify MSI signature'
    'MSI-004' = 'Silent installation'; 'MSI-005' = 'Installer exit code'; 'MSI-006' = 'Installed apps registration'
    'MSI-007' = 'Publisher metadata'; 'MSI-008' = 'Bundleware baseline comparison'; 'MSI-009' = 'Application launch'
    'MSI-010' = 'Core functionality smoke test'; 'MSI-011' = 'Silent uninstallation'; 'MSI-012' = 'Reinstallation'
    'MSI-013' = 'Upgrade from previous version'; 'MSI-014' = 'Offline installation'; 'MSI-015' = 'Installation log inspection'
    'MSI-016' = 'Build artifact integrity'; 'MSI-017' = 'Product registration after upgrade'; 'MSI-018' = 'Product registration after uninstall'
}

# --- Static tests -------------------------------------------------------------------------------------------
$metaFile = Join-Path $EvidenceDirectory 'msi-metadata.json'
$metaArgs = @('-MsiPath', $msi, '-ExpectedProductName', $ExpectedProductName, '-ExpectedManufacturer', $ExpectedPublisher, '-OutFile', $metaFile)
if ($ExpectedVersion) { $metaArgs += @('-ExpectedVersion', $ExpectedVersion) }
[void](Run-Script 'Test-MarkvyMsiMetadata.ps1' $metaArgs)
$meta = Get-Content $metaFile -Raw | ConvertFrom-Json
$check = @{}; foreach ($c in $meta.Checks) { $check[$c.Id] = $c }
$identity = @('META-01', 'META-02', 'META-03', 'META-04', 'META-05', 'META-07') | ForEach-Object { $check[$_] }
$bad = @($identity | Where-Object Status -ne 'PASS')
Set-Result 'MSI-001' $all['MSI-001'] $(if ($bad.Count) { 'FAIL' } else { 'PASS' }) "$ExpectedProductName / $ExpectedPublisher / $ExpectedVersion, UpgradeCode unchanged, per-machine" (($identity | ForEach-Object { "$($_.Name)=$($_.Actual)" }) -join '; ') $metaFile
Set-Result 'MSI-002' $all['MSI-002'] $check['META-06'].Status 'x64' $check['META-06'].Actual $metaFile
$sigStatus = $check['META-12'].Status; if ($RequireSignature -and $sigStatus -ne 'PASS') { $sigStatus = 'FAIL' }
Set-Result 'MSI-003' $all['MSI-003'] $sigStatus 'Valid signature from a trusted CA' $check['META-12'].Actual $metaFile
$offline = @($check['META-08'], $check['META-09'])
Set-Result 'MSI-014' $all['MSI-014'] $(if (@($offline | Where-Object Status -ne 'PASS').Count) { 'FAIL' } else { 'PASS' }) 'No download custom action; WebView2 offline installer bundled (static check)' (($offline | ForEach-Object { "$($_.Name): $($_.Status)" }) -join '; ') $metaFile
$sha = Get-FileSha256 -Path $msi
$shaStatus = if ($ExpectedSha256) { if ($sha -eq $ExpectedSha256.ToLowerInvariant()) { 'PASS' } else { 'FAIL' } } else {
    $sums = Join-Path (Split-Path $msi) 'SHA256SUMS.txt'
    if ((Test-Path $sums) -and (Get-Content $sums -Raw) -match [regex]::Escape($sha)) { 'PASS' } elseif (Test-Path $sums) { 'FAIL' } else { 'NOT RUN' }
}
Set-Result 'MSI-016' $all['MSI-016'] $shaStatus 'SHA-256 matches SHA256SUMS.txt or -ExpectedSha256' $sha $metaFile

# --- Install tests (opt-in) ---------------------------------------------------------------------------------
function Find-Markvy { @(Get-UninstallEntries | Where-Object { $_.DisplayName -and $_.DisplayName -match [regex]::Escape($ExpectedProductName) }) }
function Install-Msi($path, $tag, [switch]$Remove) {
    $dir = Join-Path $EvidenceDirectory $tag
    $a = @('-MsiPath', $path, '-LogDirectory', $dir); if ($Remove) { $a += '-Uninstall' }
    $code = Run-Script 'Test-MarkvySilentInstall.ps1' $a
    $json = Get-ChildItem $dir -Filter *.json | Sort-Object LastWriteTime | Select-Object -Last 1
    return [pscustomobject]@{ Code = $code; Result = if ($json) { Get-Content $json.FullName -Raw | ConvertFrom-Json } else { $null }; Dir = $dir }
}
function Test-Launch($entry) {
    $exe = if ($entry.InstallLocation) { Join-Path $entry.InstallLocation 'markvy.exe' } else { Join-Path $env:ProgramFiles 'Markvy\markvy.exe' }
    if (-not (Test-Path $exe)) { return [pscustomobject]@{ Started = $false; Alive = $false; Title = ''; Exe = $exe } }
    $p = Start-Process -FilePath $exe -PassThru
    Start-Sleep -Seconds $LaunchSeconds
    $p.Refresh()
    $alive = -not $p.HasExited
    $title = if ($alive) { $p.MainWindowTitle } else { '' }
    if ($alive) { Stop-Process -Id $p.Id -Force; Start-Sleep -Seconds 2 }
    return [pscustomobject]@{ Started = $true; Alive = $alive; Title = $title; Exe = $exe; ExitCode = if (-not $alive) { $p.ExitCode } else { $null } }
}

$installIds = 'MSI-004', 'MSI-005', 'MSI-006', 'MSI-007', 'MSI-008', 'MSI-009', 'MSI-010', 'MSI-011', 'MSI-012', 'MSI-015', 'MSI-018'
if (-not $Install) {
    foreach ($id in $installIds) { Set-Result $id $all[$id] 'NOT RUN' '' 'Run with -Install on a clean test machine (elevated).' '' }
} elseif (-not (Test-IsElevated)) {
    foreach ($id in $installIds) { Set-Result $id $all[$id] 'BLOCKED' '' 'Not elevated: a per-machine MSI cannot elevate under /qn.' '' }
} elseif ((Find-Markvy).Count -gt 0) {
    foreach ($id in $installIds) { Set-Result $id $all[$id] 'BLOCKED' '' 'Markvy is already installed here. Use a clean machine; this script never removes an existing installation.' '' }
} else {
    $baseline = Join-Path $EvidenceDirectory 'arp-before.json'
    [void](Run-Script 'Test-MarkvyBundleware.ps1' @('-Mode', 'Baseline', '-BaselinePath', $baseline))

    $first = Install-Msi $msi 'install'
    $ok = $first.Code -eq 0
    Set-Result 'MSI-004' $all['MSI-004'] $(if ($ok) { 'PASS' } else { 'FAIL' }) 'Installs under msiexec /qn with no user interface' "$($first.Result.Meaning)" $first.Dir
    Set-Result 'MSI-005' $all['MSI-005'] $(if ($ok) { 'PASS' } else { 'FAIL' }) '0 or 3010' "$($first.Result.ExitCode)" $first.Dir

    $entries = Find-Markvy
    $regFile = Join-Path $EvidenceDirectory 'registration-after-install.json'
    $entries | ConvertTo-Json -Depth 3 | Set-Content $regFile -Encoding UTF8
    $one = $entries.Count -eq 1
    Set-Result 'MSI-006' $all['MSI-006'] $(if ($one -and $entries[0].DisplayName -eq $ExpectedProductName -and ($entries[0].DisplayVersion -eq $ExpectedVersion -or -not $ExpectedVersion) -and $entries[0].Location -like 'HKLM*') { 'PASS' } else { 'FAIL' }) "One HKLM entry '$ExpectedProductName' $ExpectedVersion" (($entries | ForEach-Object { "$($_.Location) $($_.DisplayName) $($_.DisplayVersion)" }) -join '; ') $regFile
    Set-Result 'MSI-007' $all['MSI-007'] $(if ($one -and $entries[0].Publisher -eq $ExpectedPublisher) { 'PASS' } else { 'FAIL' }) $ExpectedPublisher (($entries | ForEach-Object { $_.Publisher }) -join '; ') $regFile

    $bwFile = Join-Path $EvidenceDirectory 'bundleware.json'
    $bw = Run-Script 'Test-MarkvyBundleware.ps1' @('-Mode', 'Compare', '-BaselinePath', $baseline, '-OutFile', $bwFile, '-ProductName', $ExpectedProductName, '-Publisher', $ExpectedPublisher)
    Set-Result 'MSI-008' $all['MSI-008'] $(if ($bw -eq 0) { 'PASS' } else { 'FAIL' }) 'Only Markvy (and, if it was missing, the WebView2 runtime) added' ((Get-Content $bwFile -Raw | ConvertFrom-Json).Notes -join ' ') $bwFile

    if ($one) {
        $launch = Test-Launch $entries[0]
        Set-Result 'MSI-009' $all['MSI-009'] $(if ($launch.Alive) { 'PASS' } else { 'FAIL' }) "Process still running after $LaunchSeconds s" "Started=$($launch.Started) Alive=$($launch.Alive) Exit=$($launch.ExitCode)" $launch.Exe
        $hasSample = Test-Path (Join-Path (Split-Path $launch.Exe) 'sample-wiki\README.md')
        Set-Result 'MSI-010' $all['MSI-010'] $(if ($launch.Alive -and $launch.Title -eq 'Markvy' -and $hasSample) { 'PASS' } else { 'FAIL' }) "Main window 'Markvy' shown; sample library installed" "Title='$($launch.Title)' sample-wiki=$hasSample" $launch.Exe
    } else {
        Set-Result 'MSI-009' $all['MSI-009'] 'BLOCKED' '' 'No single registration to find the executable' ''
        Set-Result 'MSI-010' $all['MSI-010'] 'BLOCKED' '' 'No single registration to find the executable' ''
    }

    $logText = if ($first.Result -and (Test-Path $first.Result.Log)) { Get-Content $first.Result.Log -Raw -Encoding Unicode } else { '' }
    $logOk = $logText -match 'Installation (operation )?completed successfully|Installation success or error status: 0'
    Set-Result 'MSI-015' $all['MSI-015'] $(if (-not $logText) { 'BLOCKED' } elseif ($logOk -and $logText -notmatch 'Return value 3') { 'PASS' } else { 'FAIL' }) 'Completed successfully; no "Return value 3"' $(if ($logOk) { 'completed successfully' } else { 'see log' }) $(if ($first.Result) { $first.Result.Log } else { '' })

    $remove = Install-Msi $msi 'uninstall' -Remove
    Set-Result 'MSI-011' $all['MSI-011'] $(if ($remove.Code -eq 0) { 'PASS' } else { 'FAIL' }) 'Uninstalls under msiexec /x /qn' "$($remove.Result.Meaning)" $remove.Dir
    $left = Find-Markvy
    Set-Result 'MSI-018' $all['MSI-018'] $(if ($left.Count -eq 0) { 'PASS' } else { 'FAIL' }) 'No Markvy entry' "$($left.Count) entries" ''

    $again = Install-Msi $msi 'reinstall'
    Set-Result 'MSI-012' $all['MSI-012'] $(if ($again.Code -eq 0 -and (Find-Markvy).Count -eq 1) { 'PASS' } else { 'FAIL' }) 'Installs again, one entry' "$($again.Result.Meaning)" $again.Dir
    [void](Install-Msi $msi 'cleanup' -Remove)
}

# --- Upgrade tests (opt-in) ---------------------------------------------------------------------------------
if (-not $Upgrade) {
    foreach ($id in 'MSI-013', 'MSI-017') { Set-Result $id $all[$id] 'NOT RUN' '' 'Run with -Upgrade -PreviousMsiPath <msi> on a clean test machine (elevated).' '' }
} elseif (-not $PreviousMsiPath -or -not (Test-Path $PreviousMsiPath)) {
    foreach ($id in 'MSI-013', 'MSI-017') { Set-Result $id $all[$id] 'BLOCKED' '' 'Previous MSI not available.' '' }
} elseif (-not (Test-IsElevated) -or (Find-Markvy).Count -gt 0) {
    foreach ($id in 'MSI-013', 'MSI-017') { Set-Result $id $all[$id] 'BLOCKED' '' 'Needs an elevated PowerShell on a machine without Markvy installed.' '' }
} else {
    $old = Install-Msi (Resolve-Path $PreviousMsiPath).Path 'upgrade-previous'
    $data = Join-Path $env:APPDATA 'com.sainath.markvy'
    if ($old.Code -eq 0) { [void](Test-Launch (Find-Markvy)[0]) }
    $hadData = Test-Path (Join-Path $data 'library.json')
    $new = Install-Msi $msi 'upgrade-new'
    $after = Find-Markvy
    $launch = if ($after.Count -eq 1) { Test-Launch $after[0] } else { $null }
    $keptData = Test-Path (Join-Path $data 'library.json')
    Set-Result 'MSI-013' $all['MSI-013'] $(if ($old.Code -eq 0 -and $new.Code -eq 0 -and $launch -and $launch.Alive -and (-not $hadData -or $keptData)) { 'PASS' } else { 'FAIL' }) 'Previous then new MSI install; app starts; data folder kept' "previous=$($old.Result.ExitCode) new=$($new.Result.ExitCode) launches=$($launch.Alive) dataBefore=$hadData dataAfter=$keptData" $new.Dir
    Set-Result 'MSI-017' $all['MSI-017'] $(if ($after.Count -eq 1 -and $after[0].DisplayVersion -eq $ExpectedVersion) { 'PASS' } else { 'FAIL' }) "One entry, version $ExpectedVersion" (($after | ForEach-Object { "$($_.DisplayName) $($_.DisplayVersion)" }) -join '; ') ''
    [void](Install-Msi $msi 'upgrade-cleanup' -Remove)
}

# --- Report -------------------------------------------------------------------------------------------------
$ordered = foreach ($id in $all.Keys) { $results[$id] }
$hostInfo = [ordered]@{
    Computer = $env:COMPUTERNAME; Os = (Get-CimInstance Win32_OperatingSystem).Caption; OsVersion = [Environment]::OSVersion.Version.ToString()
    Elevated = Test-IsElevated; PowerShell = $PSVersionTable.PSVersion.ToString(); RanAt = (Get-Date).ToString('o')
}
[ordered]@{ Msi = $msi; Sha256 = $sha; Environment = $hostInfo; Results = $ordered } | ConvertTo-Json -Depth 5 |
    Set-Content (Join-Path $EvidenceDirectory 'results.json') -Encoding UTF8
$md = @('| ID | Test | Status | Actual | Evidence |', '|---|---|---|---|---|')
$md += $ordered | ForEach-Object { "| $($_.Id) | $($_.Test) | $($_.Status) | $(($_.Actual -replace '\|', '/')) | $($_.Evidence) |" }
$md | Set-Content (Join-Path $EvidenceDirectory 'results.md') -Encoding UTF8
$ordered | Format-Table Id, Status, Test, Actual -AutoSize | Out-String -Width 220 | Write-Host
Write-Host "Evidence: $EvidenceDirectory"
if (@($ordered | Where-Object Status -eq 'FAIL').Count) { exit 1 }
exit 0
