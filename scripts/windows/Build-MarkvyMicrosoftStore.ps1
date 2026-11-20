<#
.SYNOPSIS
    Builds the Microsoft Store MSI for Markvy (Windows x64) and writes it, with checksums and a build manifest,
    to a versioned release folder.

.DESCRIPTION
    1. Checks the build host (Windows x64) and tools (Node.js, npm, Rust).
    2. Installs JavaScript packages from the lockfile (npm ci).
    3. Runs the project's checks unless -SkipChecks: read-only check, type check, Vitest, cargo test.
    4. Builds with `tauri build` (never `tauri bundle`), merging src-tauri\tauri.microsoftstore.conf.json
       (MSI only, WebView2 offline installer) and, if given, a signing config.
    5. Checks the MSI with Test-MarkvyMsiMetadata.ps1, verifies the signature, and computes SHA-256.
    6. Copies the MSI to release\<version>-store\ with SHA256SUMS.txt and build-manifest.json.
       It never overwrites a different file of the same name unless -Force is given.

    The version is read from src-tauri\tauri.conf.json and never changed by this script.

.PARAMETER SigningConfig
    Optional Tauri config file holding bundle.windows.certificateThumbprint (and digestAlgorithm, timestampUrl),
    the same file release.yml writes from the WINDOWS_CERTIFICATE secret. The certificate must already be in the
    current user's certificate store. No secret is read or printed by this script.

.PARAMETER OutputDirectory
    Where to put the release files. Default: <repo>\release\<version>-store

.EXAMPLE
    .\scripts\windows\Build-MarkvyMicrosoftStore.ps1

.EXAMPLE
    .\scripts\windows\Build-MarkvyMicrosoftStore.ps1 -SigningConfig app\src-tauri\tauri.signing.json

.NOTES
    Exit codes: 0 built and the static checks passed (an unsigned build still exits 0 but its manifest says
    signingStatus "unsigned"), 1 a check, the build or the static MSI checks failed, 2 the host or tools are not usable.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$OutputDirectory,
    [string]$SigningConfig,
    [switch]$SkipChecks,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'MarkvyStore.psm1') -Force

function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Run([string]$exe, [string[]]$arguments) {
    Write-Host "    $exe $($arguments -join ' ')"
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "'$exe $($arguments -join ' ')' failed with exit code $LASTEXITCODE" }
}

# Windows PowerShell 5.1 leaves $PSScriptRoot empty inside param() defaults, so resolve the repository here.
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$app = Join-Path $RepoRoot 'app'
$tauriDir = Join-Path $app 'src-tauri'
$storeConfig = Join-Path $tauriDir 'tauri.microsoftstore.conf.json'

Step 'Build host and tools'
if ($env:OS -ne 'Windows_NT') { Write-Host -ForegroundColor Red 'ERROR: The Store MSI must be built on Windows.'; exit 2 }
if (-not [Environment]::Is64BitOperatingSystem) { Write-Host -ForegroundColor Red 'ERROR: A 64-bit Windows build host is needed for the x64 MSI.'; exit 2 }
$tools = [ordered]@{}
foreach ($t in 'node', 'npm', 'cargo', 'rustc') {
    $cmd = Get-Command $t -ErrorAction SilentlyContinue
    if (-not $cmd) { Write-Host -ForegroundColor Red "ERROR: $t was not found. Install Node.js 20+ and Rust (stable), then try again."; exit 2 }
    $tools[$t] = ((& $t --version) | Select-Object -First 1).ToString().Trim()
    Write-Host "    $t $($tools[$t])"
}
foreach ($f in @((Join-Path $app 'package-lock.json'), (Join-Path $tauriDir 'Cargo.lock'), $storeConfig)) {
    if (-not (Test-Path $f)) { Write-Host -ForegroundColor Red "ERROR: Missing $f"; exit 2 }
}
if ($SigningConfig) {
    $SigningConfig = (Resolve-Path $SigningConfig).Path
}

$conf = Get-Content (Join-Path $tauriDir 'tauri.conf.json') -Raw | ConvertFrom-Json
$version = $conf.version
$product = $conf.productName
Write-Host "    $product $version"

$cargoLock = Get-Content (Join-Path $tauriDir 'Cargo.lock') -Raw
$tauriCrate = if ($cargoLock -match '(?m)^name = "tauri"\r?\nversion = "([^"]+)"') { $Matches[1] } else { 'unknown' }
# Regex, not ConvertFrom-Json: Windows PowerShell 5.1 rejects the lockfile's empty "" package key.
$npmLock = Get-Content (Join-Path $app 'package-lock.json') -Raw
$tauriCli = if ($npmLock -match '"node_modules/@tauri-apps/cli":\s*\{\s*"version":\s*"([^"]+)"') { $Matches[1] } else { 'unknown' }

Push-Location $app
try {
    Step 'JavaScript packages (npm ci, from package-lock.json)'
    Run 'npm' @('ci')

    if (-not $SkipChecks) {
        Step 'Project checks'
        Run 'npm' @('run', 'check:readonly')
        Run 'npm' @('run', 'check')
        Run 'npm' @('test')
        Run 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml')
    } else {
        Write-Host '    Skipped (-SkipChecks).' -ForegroundColor Yellow
    }

    Step 'Build the Store MSI (tauri build, Store overlay)'
    $buildArgs = @('run', 'tauri', '--', 'build', '--bundles', 'msi', '--config', 'src-tauri/tauri.microsoftstore.conf.json')
    if ($SigningConfig) { $buildArgs += @('--config', $SigningConfig) }
    Run 'npm' $buildArgs
} finally {
    Pop-Location
}

Step 'Find the MSI'
$targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $tauriDir 'target' }
$msiName = "${product}_${version}_x64_en-US.msi"
$built = Join-Path $targetDir "release\bundle\msi\$msiName"
if (-not (Test-Path $built)) { Write-Host -ForegroundColor Red "ERROR: Expected $built, but it was not built."; exit 1 }
$size = (Get-Item $built).Length
if ($size -le 0) { Write-Host -ForegroundColor Red "ERROR: $built is empty."; exit 1 }
Write-Host "    $built ($([math]::Round($size / 1MB, 1)) MB)"

Step 'Static MSI checks'
$evidence = Join-Path $env:TEMP "markvy-store-build-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $evidence | Out-Null
$metaFile = Join-Path $evidence 'msi-metadata.json'
& (Join-Path $PSScriptRoot 'Test-MarkvyMsiMetadata.ps1') -MsiPath $built -ExpectedVersion $version -ExpectedManufacturer $conf.bundle.publisher -OutFile $metaFile
$metaExit = $LASTEXITCODE
$meta = Get-Content $metaFile -Raw | ConvertFrom-Json
$sig = Get-SignatureReport -Path $built
$signingStatus = switch ($sig.Status) { 'Valid' { 'signed-verified' } 'NotSigned' { 'unsigned' } default { "signature-$($sig.Status)" } }
$sha = Get-FileSha256 -Path $built

Step 'Copy to the release folder'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $RepoRoot "release\$version-store" }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$dest = Join-Path $OutputDirectory $msiName
if ((Test-Path $dest) -and ((Get-FileSha256 -Path $dest) -ne $sha) -and -not $Force) {
    Write-Host -ForegroundColor Red "ERROR: $dest already exists with different contents. It may already be published; use a new folder, or -Force to replace it."
    exit 1
}
Copy-Item $built $dest -Force
"$sha *$msiName" | Set-Content -Path (Join-Path $OutputDirectory 'SHA256SUMS.txt') -Encoding ASCII

$commit = (& git -C $RepoRoot rev-parse HEAD 2>$null)
$dirty = [bool](& git -C $RepoRoot status --porcelain 2>$null)
$manifest = [ordered]@{
    application      = $product
    version          = $version
    architecture     = 'x64'
    packageType      = 'MSI'
    msi              = $msiName
    sizeBytes        = $size
    tauriVersion     = $tauriCrate
    tauriCliVersion  = $tauriCli
    tools            = $tools
    webviewInstallMode = 'offlineInstaller'
    buildTimestamp   = (Get-Date).ToUniversalTime().ToString('o')
    gitCommit        = $commit
    gitWorkingTreeClean = -not $dirty
    sha256           = $sha
    upgradeCode      = $meta.Properties.UpgradeCode
    productCode      = $meta.Properties.ProductCode
    manufacturer     = $meta.Properties.Manufacturer
    signingStatus    = $signingStatus
    checksRun        = -not $SkipChecks
    validationStatus = if ($metaExit -eq 0) { 'static-checks-passed' } else { 'static-checks-failed' }
    staticChecks     = $meta.Checks | ForEach-Object { "$($_.Id) $($_.Status): $($_.Name)" }
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $OutputDirectory 'build-manifest.json') -Encoding UTF8
Copy-Item $metaFile (Join-Path $OutputDirectory 'msi-metadata.json') -Force

Write-Host "`nMSI:       $dest"
Write-Host "SHA-256:   $sha"
Write-Host "Signing:   $signingStatus"
Write-Host "Checks:    $($manifest.validationStatus)"
if ($signingStatus -ne 'signed-verified') {
    Write-Warning 'This MSI is not signed with a trusted certificate. The Microsoft Store requires signed MSI submissions.'
}
if ($metaExit -ne 0) { exit 1 }
exit 0
