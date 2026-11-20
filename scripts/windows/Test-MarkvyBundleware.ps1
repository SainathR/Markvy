<#
.SYNOPSIS
    Shows exactly which Add or Remove Programs entries a Markvy installation adds, by comparing the uninstall
    registry before and after the install.

.DESCRIPTION
    -Mode Baseline  Saves every entry in HKLM (64-bit), HKLM (32-bit) and HKCU uninstall keys to a JSON file.
    -Mode Compare   Reads them again and reports entries added, removed or changed since the baseline,
                    sorted into: Markvy itself, known prerequisites (Microsoft Edge WebView2 Runtime), and
                    anything else ("unexpected").

    It only reads the registry. Take the baseline immediately before installing and compare immediately after,
    on a machine where nothing else is being installed, so the difference belongs to Markvy's installer.

.EXAMPLE
    .\Test-MarkvyBundleware.ps1 -Mode Baseline -BaselinePath .\evidence\arp-before.json
    (install Markvy)
    .\Test-MarkvyBundleware.ps1 -Mode Compare -BaselinePath .\evidence\arp-before.json -OutFile .\evidence\bundleware.json

.NOTES
    Exit codes (Compare): 0 exactly one Markvy entry and nothing unexpected, 1 otherwise, 2 bad input.
    Baseline always exits 0 when it could write the file.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Baseline', 'Compare')][string]$Mode,
    [Parameter(Mandatory)][string]$BaselinePath,
    [string]$OutFile,
    [string]$ProductName = 'Markvy',
    [string]$Publisher = 'Sainath Racherla',
    [string[]]$KnownPrerequisites = @('Microsoft Edge WebView2 Runtime')
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'MarkvyStore.psm1') -Force

$now = Get-UninstallEntries
if ($Mode -eq 'Baseline') {
    $dir = Split-Path -Parent $BaselinePath
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    [ordered]@{ CapturedAt = (Get-Date).ToString('o'); Computer = $env:COMPUTERNAME; Entries = $now } |
        ConvertTo-Json -Depth 4 | Set-Content -Path $BaselinePath -Encoding UTF8
    Write-Host "Baseline: $($now.Count) entries saved to $BaselinePath"
    exit 0
}

if (-not (Test-Path $BaselinePath)) { Write-Host -ForegroundColor Red "ERROR: Baseline not found: $BaselinePath"; exit 2 }
$base = Get-Content $BaselinePath -Raw | ConvertFrom-Json
$key = { param($e) "$($e.Location)|$($e.KeyName)" }
$before = @{}; foreach ($e in $base.Entries) { $before[(& $key $e)] = $e }
$after = @{};  foreach ($e in $now) { $after[(& $key $e)] = $e }

$added = @($now | Where-Object { -not $before.ContainsKey((& $key $_)) })
$removed = @($base.Entries | Where-Object { -not $after.ContainsKey((& $key $_)) })
$changed = @($now | Where-Object {
    $b = $before[(& $key $_)]
    $b -and ($b.DisplayName -ne $_.DisplayName -or $b.DisplayVersion -ne $_.DisplayVersion -or $b.Publisher -ne $_.Publisher)
})

$classify = {
    param($e)
    if ($e.DisplayName -and $e.DisplayName -match [regex]::Escape($ProductName)) { 'Markvy' }
    elseif ($KnownPrerequisites | Where-Object { $e.DisplayName -like "$_*" }) { 'Prerequisite' }
    else { 'Unexpected' }
}
$rows = foreach ($e in @($added + $changed)) {
    [pscustomobject][ordered]@{
        Kind = & $classify $e; Change = if ($added -contains $e) { 'added' } else { 'changed' }
        DisplayName = $e.DisplayName; Publisher = $e.Publisher; DisplayVersion = $e.DisplayVersion
        Location = $e.Location; KeyName = $e.KeyName; UninstallString = $e.UninstallString
    }
}
$rows = @($rows)
$markvy = @($rows | Where-Object Kind -eq 'Markvy')
$unexpected = @($rows | Where-Object Kind -eq 'Unexpected')
$prereq = @($rows | Where-Object Kind -eq 'Prerequisite')

$markvyNow = @($now | Where-Object { $_.DisplayName -and $_.DisplayName -match [regex]::Escape($ProductName) })
$verdict = if ($markvyNow.Count -eq 1 -and $unexpected.Count -eq 0 -and $markvyNow[0].Publisher -eq $Publisher) { 'PASS' } else { 'FAIL' }
$notes = @()
if ($markvyNow.Count -eq 0) { $notes += 'No Markvy entry after installation.' }
if ($markvyNow.Count -gt 1) { $notes += "Markvy is registered $($markvyNow.Count) times." }
if ($markvyNow.Count -eq 1 -and $markvyNow[0].Publisher -ne $Publisher) { $notes += "Publisher is '$($markvyNow[0].Publisher)', expected '$Publisher'." }
if ($unexpected.Count) { $notes += "Unexpected new entries: $((($unexpected | ForEach-Object { $_.DisplayName }) -join ', '))" }
if ($prereq.Count) { $notes += "Known prerequisite added: $((($prereq | ForEach-Object { $_.DisplayName }) -join ', ')). This is the WebView2 runtime Markvy needs, installed by Microsoft's own installer." }

$report = [ordered]@{
    ComparedAt = (Get-Date).ToString('o'); BaselineTakenAt = $base.CapturedAt; Verdict = $verdict
    MarkvyEntries = $markvyNow; NewOrChanged = $rows; Removed = $removed; Notes = $notes
}
$rows | Format-Table Kind, Change, DisplayName, Publisher, DisplayVersion, Location -AutoSize | Out-String -Width 200 | Write-Host
Write-Host "Verdict: $verdict"; $notes | ForEach-Object { Write-Host "  - $_" }
if ($OutFile) {
    $dir = Split-Path -Parent $OutFile
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $report | ConvertTo-Json -Depth 5 | Set-Content -Path $OutFile -Encoding UTF8
    Write-Host "Report: $OutFile"
}
if ($verdict -eq 'PASS') { exit 0 } else { exit 1 }
