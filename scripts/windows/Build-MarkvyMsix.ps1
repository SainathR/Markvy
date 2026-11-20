<#
.SYNOPSIS
    Packs the Markvy release build into an MSIX with the Windows SDK (makeappx), without capturing an installer.

.DESCRIPTION
    Stages markvy.exe, the sample library (bundle.resources in tauri.conf.json) and three logos, writes an
    AppxManifest.xml for a full-trust desktop app, and packs it to release\<version>-msix\.

    Build markvy.exe first:  cd app; npm run tauri build -- --no-bundle

    For the Store, pass the three values from Partner Center > Product management > Product identity and leave the
    package unsigned: the Store signs it. -Sign makes a local test package instead, signed with a self-signed
    certificate (subject = -Publisher) kept in the current user's store; only its public part is exported.

.PARAMETER Version
    Four-part package version. Default: the version in tauri.conf.json plus ".0" (the Store needs the last part 0).

.EXAMPLE
    .\scripts\windows\Build-MarkvyMsix.ps1 -IdentityName 'Markvy' -Publisher 'CN=Sainath Racherla' -PublisherDisplayName 'Sainath Racherla'

.EXAMPLE
    .\scripts\windows\Build-MarkvyMsix.ps1 -IdentityName 'Markvy' -Publisher 'CN=Sainath Racherla' -PublisherDisplayName 'Sainath Racherla' -Sign

.NOTES
    Exit codes: 0 packed, 1 makeappx or signtool failed or the output exists (use -Force), 2 markvy.exe or the
    Windows SDK is missing.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$IdentityName,
    [Parameter(Mandatory)][ValidatePattern('^CN=')][string]$Publisher,
    [Parameter(Mandatory)][string]$PublisherDisplayName,
    [string]$Version,
    [string]$Exe = (Join-Path $env:LOCALAPPDATA 'folio-target\release\markvy.exe'),
    [string]$RepoRoot,
    [string]$OutputDirectory,
    [switch]$Sign,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 leaves $PSScriptRoot empty inside param() defaults, so resolve the repository here.
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$tauri = Join-Path $RepoRoot 'app\src-tauri'
$conf = Get-Content (Join-Path $tauri 'tauri.conf.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = "$($conf.version).0" }

if (-not (Test-Path $Exe)) { Write-Host "markvy.exe not found at $Exe. Build it first: cd app; npm run tauri build -- --no-bundle"; exit 2 }
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Directory.Parent.Name } | Select-Object -Last 1 | ForEach-Object { $_.DirectoryName }
if (-not $sdk) { Write-Host 'Windows SDK not found (makeappx.exe). Install the Windows 10/11 SDK.'; exit 2 }

if (-not $OutputDirectory) { $OutputDirectory = Join-Path $RepoRoot "release\$($conf.version)-msix" }
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = Join-Path $OutputDirectory ("Markvy_{0}_x64{1}.msix" -f $Version, $(if ($Sign) { '_test-signed' } else { '' }))
if ((Test-Path $out) -and -not $Force) { Write-Host "$out exists; pass -Force to replace it."; exit 1 }

$stage = Join-Path $env:TEMP ("markvy-msix-" + [guid]::NewGuid())
try {
    New-Item -ItemType Directory (Join-Path $stage 'Assets') | Out-Null
    Copy-Item $Exe (Join-Path $stage 'markvy.exe')
    foreach ($r in $conf.bundle.resources.PSObject.Properties) {
        Copy-Item (Join-Path $tauri $r.Name) (Join-Path $stage $r.Value.TrimEnd('/')) -Recurse
    }
    foreach ($logo in 'StoreLogo', 'Square44x44Logo', 'Square150x150Logo') {
        Copy-Item (Join-Path $tauri "icons\$logo.png") (Join-Path $stage "Assets\$logo.png")
    }

    $x = { param($s) [Security.SecurityElement]::Escape([string]$s) }
    @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap rescap">
  <Identity Name="$(& $x $IdentityName)" Publisher="$(& $x $Publisher)" Version="$Version" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$(& $x $conf.productName)</DisplayName>
    <PublisherDisplayName>$(& $x $PublisherDisplayName)</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="Markvy" Executable="markvy.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$(& $x $conf.productName)" Description="$(& $x $conf.bundle.shortDescription)"
        BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@ | Set-Content (Join-Path $stage 'AppxManifest.xml') -Encoding UTF8

    & (Join-Path $sdk 'makeappx.exe') pack /d $stage /p $out /o | Out-Null
    if ($LASTEXITCODE) { Write-Host "makeappx failed ($LASTEXITCODE)"; exit 1 }

    if ($Sign) {
        # Test certificate only: it stays in CurrentUser\My and is never exported with its private key.
        $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $Publisher -and $_.HasPrivateKey } | Select-Object -First 1
        if (-not $cert) {
            $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Publisher -CertStoreLocation Cert:\CurrentUser\My `
                -KeyUsage DigitalSignature -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}') -NotAfter (Get-Date).AddYears(1)
        }
        & (Join-Path $sdk 'signtool.exe') sign /fd SHA256 /sha1 $cert.Thumbprint $out | Out-Null
        if ($LASTEXITCODE) { Write-Host "signtool failed ($LASTEXITCODE)"; exit 1 }
        Export-Certificate -Cert $cert -FilePath (Join-Path $OutputDirectory 'Markvy-test-signing.cer') -Force | Out-Null
    }
} finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

"{0}  {1}" -f (Get-FileHash $out -Algorithm SHA256).Hash.ToLower(), (Split-Path $out -Leaf)
exit 0
