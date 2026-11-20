<#
.SYNOPSIS
    Checks a Markvy MSI's identity and install behaviour without installing it, and (optionally) the
    Add or Remove Programs entry of an installed copy.

.DESCRIPTION
    Static checks (no installation, no administrator rights needed):
      - ProductName, Manufacturer, ProductVersion, ProductCode, UpgradeCode and per-machine scope
      - Platform (summary information "Template"), for example x64
      - Custom actions: nothing downloads from the internet during setup, and nothing launches the app
        unless asked (Tauri's LaunchApplication only runs when AUTOLAUNCHAPP is set)
      - WebView2: the offline runtime installer is inside the MSI (Store requirement)
      - Authenticode signature (Get-AuthenticodeSignature, plus signtool verify /pa when available)

    With -CheckRegistration it also reads the uninstall registry (HKLM 64-bit, HKLM 32-bit, HKCU) and reports
    whether there is no entry, one correct entry, duplicates, or an entry with the wrong name, publisher, version
    or uninstall information. It never changes the registry.

.PARAMETER MsiPath
    The MSI to check.

.PARAMETER RequireSignature
    Treat an unsigned MSI as FAIL instead of BLOCKED.

.PARAMETER CheckRegistration
    Also inspect the installed Add or Remove Programs entry (run after installing).

.EXAMPLE
    .\Test-MarkvyMsiMetadata.ps1 -MsiPath ..\..\release\0.1.0-store\Markvy_0.1.0_x64_en-US.msi -ExpectedVersion 0.1.0

.EXAMPLE
    .\Test-MarkvyMsiMetadata.ps1 -MsiPath .\Markvy.msi -CheckRegistration -OutFile .\evidence\metadata.json

.NOTES
    Exit codes: 0 every check passed (BLOCKED allowed only for the signature when -RequireSignature is not set),
    1 at least one check failed, 2 the script itself could not run (for example the MSI is missing).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$MsiPath,
    [string]$ExpectedProductName = 'Markvy',
    [string]$ExpectedManufacturer = 'Sainath Racherla',
    [string]$ExpectedVersion,
    [string]$ExpectedUpgradeCode = '{A0568F55-DEF4-5F54-894F-D253A53D88FF}',
    [string]$ExpectedArchitecture = 'x64',
    [switch]$RequireSignature,
    [switch]$CheckRegistration,
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'MarkvyStore.psm1') -Force

try {
    $msi = (Resolve-Path -LiteralPath $MsiPath).Path
} catch {
    Write-Host -ForegroundColor Red "ERROR: MSI not found: $MsiPath"; exit 2
}

$results = New-Object System.Collections.Generic.List[object]
$guid = '^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$'

$h = Open-MsiDatabase -Path $msi
try {
    $p = Get-MsiProperties $h
    $template = Get-MsiTemplate $h
    $actions = Get-MsiRows $h 'SELECT `Action`, `Type`, `Source`, `Target` FROM `CustomAction`'
    $sequence = Get-MsiRows $h 'SELECT `Action`, `Condition` FROM `InstallExecuteSequence`'
    $binaries = @((Get-MsiRows $h 'SELECT `Name` FROM `Binary`') | ForEach-Object { $_[0] })
    $files = @((Get-MsiRows $h 'SELECT `FileName` FROM `File`') | ForEach-Object { $_[0] })
} finally {
    Close-MsiDatabase $h
}

function Prop([string]$name) { if ($p.ContainsKey($name)) { $p[$name] } else { '' } }

$name = Prop 'ProductName'
$results.Add((New-CheckResult 'META-01' 'ProductName' $(if ($name -eq $ExpectedProductName) { 'PASS' } else { 'FAIL' }) $ExpectedProductName $name))

$maker = Prop 'Manufacturer'
$status = if ([string]::IsNullOrWhiteSpace($maker)) { 'FAIL' } elseif ($ExpectedManufacturer -and $maker -ne $ExpectedManufacturer) { 'FAIL' } else { 'PASS' }
$results.Add((New-CheckResult 'META-02' 'Manufacturer (shown as Publisher)' $status $ExpectedManufacturer $maker 'Must match the publisher display name in Partner Center exactly.'))

$version = Prop 'ProductVersion'
$status = if (-not $version) { 'FAIL' } elseif ($ExpectedVersion -and $version -ne $ExpectedVersion) { 'FAIL' } else { 'PASS' }
$results.Add((New-CheckResult 'META-03' 'ProductVersion' $status $(if ($ExpectedVersion) { $ExpectedVersion } else { '(any)' }) $version))

$code = Prop 'ProductCode'
$results.Add((New-CheckResult 'META-04' 'ProductCode is a GUID' $(if ($code -match $guid) { 'PASS' } else { 'FAIL' }) 'GUID' $code))

$upgrade = Prop 'UpgradeCode'
$results.Add((New-CheckResult 'META-05' 'UpgradeCode unchanged' $(if ($upgrade -eq $ExpectedUpgradeCode) { 'PASS' } else { 'FAIL' }) $ExpectedUpgradeCode $upgrade 'Changing it makes Windows treat an update as a different app.'))

$arch = ($template -split ';')[0]
$results.Add((New-CheckResult 'META-06' 'Architecture' $(if ($arch -eq $ExpectedArchitecture) { 'PASS' } else { 'FAIL' }) $ExpectedArchitecture $template))

$allUsers = Prop 'ALLUSERS'
$results.Add((New-CheckResult 'META-07' 'Per-machine install (ALLUSERS=1)' $(if ($allUsers -eq '1') { 'PASS' } else { 'FAIL' }) '1' $allUsers 'A per-machine install writes the Add or Remove Programs entry under HKLM.'))

$net = @($actions | Where-Object { $_[3] -match 'Invoke-WebRequest|https?://|fwlink' -or $_[0] -match 'Download' })
$results.Add((New-CheckResult 'META-08' 'No download during setup' $(if ($net.Count -eq 0) { 'PASS' } else { 'FAIL' }) 'no custom action downloads anything' (($net | ForEach-Object { $_[0] }) -join ', ') 'The Store needs an offline installer (Tauri: webviewInstallMode offlineInstaller).'))

$webview = @($binaries + $files | Where-Object { $_ -match 'WebView2' })
$results.Add((New-CheckResult 'META-09' 'WebView2 offline installer included' $(if ($webview.Count -gt 0) { 'PASS' } else { 'FAIL' }) 'MicrosoftEdgeWebView2RuntimeInstaller in the MSI' ($webview -join ', ')))

$launch = @($sequence | Where-Object { $_[0] -match 'Launch' })
$unconditional = @($launch | Where-Object { -not $_[1] -or $_[1] -notmatch 'AUTOLAUNCHAPP' })
$results.Add((New-CheckResult 'META-10' 'App never starts during a silent install' $(if ($unconditional.Count -eq 0) { 'PASS' } else { 'FAIL' }) 'launch only when AUTOLAUNCHAPP is set' (($launch | ForEach-Object { "$($_[0]) [$($_[1])]" }) -join '; ')))

$other = @($actions | Where-Object { $_[0] -notmatch '^(LaunchApplication|WixUI.*|SetARP.*|DownloadAndInvokeBootstrapper|.*WebView2.*|.*Webview.*)$' })
$results.Add((New-CheckResult 'META-11' 'Custom actions' 'INFO' '' (($actions | ForEach-Object { $_[0] }) -join ', ') $(if ($other.Count) { "Not part of Tauri's standard template: $((($other | ForEach-Object { $_[0] }) -join ', '))" } else { "Only Tauri's standard actions." })))

$sig = Get-SignatureReport -Path $msi
$sigStatus = if ($sig.Status -eq 'Valid') { 'PASS' } elseif ($RequireSignature) { 'FAIL' } else { 'BLOCKED' }
$results.Add((New-CheckResult 'META-12' 'Authenticode signature' $sigStatus 'Valid, from a trusted CA' $sig.Status $(if ($sig.Signer) { "Signer: $($sig.Signer)" } else { 'No signature. The Store requires a trusted code-signing certificate for MSI submissions.' })))

if ($CheckRegistration) {
    $entries = @(Get-UninstallEntries | Where-Object { $_.DisplayName -and $_.DisplayName -match [regex]::Escape($ExpectedProductName) })
    if ($entries.Count -eq 0) {
        $results.Add((New-CheckResult 'REG-01' 'Add or Remove Programs entry' 'FAIL' 'one entry' 'none'))
    } elseif ($entries.Count -gt 1) {
        $results.Add((New-CheckResult 'REG-01' 'Add or Remove Programs entry' 'FAIL' 'one entry' "$($entries.Count) entries" (($entries | ForEach-Object { "$($_.Location) $($_.KeyName)" }) -join '; ')))
    } else {
        $e = $entries[0]
        $results.Add((New-CheckResult 'REG-01' 'Add or Remove Programs entry' 'PASS' 'one entry' "$($e.Location) $($e.KeyName)"))
        $results.Add((New-CheckResult 'REG-02' 'DisplayName' $(if ($e.DisplayName -eq $ExpectedProductName) { 'PASS' } else { 'FAIL' }) $ExpectedProductName $e.DisplayName))
        $results.Add((New-CheckResult 'REG-03' 'Publisher' $(if ($e.Publisher -and (-not $ExpectedManufacturer -or $e.Publisher -eq $ExpectedManufacturer)) { 'PASS' } else { 'FAIL' }) $ExpectedManufacturer $e.Publisher))
        $want = if ($ExpectedVersion) { $ExpectedVersion } else { $version }
        $results.Add((New-CheckResult 'REG-04' 'DisplayVersion' $(if ($e.DisplayVersion -eq $want) { 'PASS' } else { 'FAIL' }) $want $e.DisplayVersion))
        $results.Add((New-CheckResult 'REG-05' 'Installed by Windows Installer' $(if ($e.WindowsInstaller -eq '1') { 'PASS' } else { 'FAIL' }) '1' $e.WindowsInstaller))
        $results.Add((New-CheckResult 'REG-06' 'Uninstall information' $(if ($e.UninstallString -match 'MsiExec' -and $e.KeyName -match $guid) { 'PASS' } else { 'FAIL' }) 'MsiExec.exe /X{ProductCode}' $e.UninstallString))
        $results.Add((New-CheckResult 'REG-07' 'Machine-wide entry' $(if ($e.Location -like 'HKLM*') { 'PASS' } else { 'FAIL' }) 'HKLM' $e.Location))
    }
}

$report = [ordered]@{
    Msi        = $msi
    Sha256     = Get-FileSha256 -Path $msi
    CheckedAt  = (Get-Date).ToString('o')
    Properties = [ordered]@{ ProductName = $name; Manufacturer = $maker; ProductVersion = $version; ProductCode = $code; UpgradeCode = $upgrade; ALLUSERS = $allUsers; Template = $template }
    Signature  = $sig
    Checks     = $results
}

$results | Format-Table Id, Status, Name, Actual -AutoSize | Out-String -Width 220 | Write-Host
if ($OutFile) {
    $dir = Split-Path -Parent $OutFile
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $report | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding UTF8
    Write-Host "Report: $OutFile"
}

if (@($results | Where-Object Status -eq 'FAIL').Count -gt 0) { exit 1 }
exit 0
