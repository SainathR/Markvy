# Shared helpers for the Markvy Microsoft Store scripts in this folder.
# Works in Windows PowerShell 5.1 and PowerShell 7 on Windows. Reads MSI files through the
# Windows Installer COM API (no extra tools), and reads the uninstall registry without changing it.

Set-StrictMode -Version 2.0

$script:UninstallRoots = @(
    @{ Hive = 'HKLM'; View = '64-bit'; Path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' },
    @{ Hive = 'HKLM'; View = '32-bit'; Path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' },
    @{ Hive = 'HKCU'; View = 'user';   Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' }
)

function Invoke-ComMember {
    param([object]$Target, [string]$Name, [string]$Kind = 'InvokeMethod', [object[]]$Arguments = @())
    $flags = [System.Reflection.BindingFlags]::$Kind
    # COM rejects PowerShell's PSObject wrappers (DISP_E_TYPEMISMATCH), so pass the plain values.
    $plain = [object[]]@($Arguments | ForEach-Object { if ($_ -is [psobject]) { $_.PSObject.BaseObject } else { $_ } })
    return $Target.GetType().InvokeMember($Name, $flags, $null, $Target, $plain)
}

function Open-MsiDatabase {
    <# Opens an MSI read-only. Call Close-MsiDatabase when done so the file is not left locked. #>
    param([Parameter(Mandatory)][string]$Path)
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $db = Invoke-ComMember $installer 'OpenDatabase' -Arguments @($Path, 0)
    return [pscustomobject]@{ Installer = $installer; Database = $db }
}

function Close-MsiDatabase {
    param([Parameter(Mandatory)]$Handle)
    foreach ($o in @($Handle.Database, $Handle.Installer)) {
        if ($null -ne $o) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($o) }
    }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

function Get-MsiRows {
    <# Runs a SELECT and returns each row as an array of strings. Returns nothing when the table is absent. #>
    param([Parameter(Mandatory)]$Handle, [Parameter(Mandatory)][string]$Sql)
    try { $view = Invoke-ComMember $Handle.Database 'OpenView' -Arguments @($Sql) } catch { return @() }
    [void](Invoke-ComMember $view 'Execute')
    $rows = New-Object System.Collections.Generic.List[object]
    while ($true) {
        $record = Invoke-ComMember $view 'Fetch'
        if ($null -eq $record) { break }
        $count = Invoke-ComMember $record 'FieldCount' -Kind GetProperty
        $fields = @(1..$count | ForEach-Object { Invoke-ComMember $record 'StringData' -Kind GetProperty -Arguments @($_) })
        $rows.Add($fields)
    }
    [void](Invoke-ComMember $view 'Close')
    return , $rows.ToArray()
}

function Get-MsiProperties {
    <# Returns the Property table as a hashtable. #>
    param([Parameter(Mandatory)]$Handle)
    $props = @{}
    foreach ($row in (Get-MsiRows $Handle 'SELECT `Property`, `Value` FROM `Property`')) { $props[$row[0]] = $row[1] }
    return $props
}

function Get-MsiTemplate {
    <# Summary information "Template" (PID 7), for example "x64;1033": the platform and languages. #>
    param([Parameter(Mandatory)]$Handle)
    $info = Invoke-ComMember $Handle.Database 'SummaryInformation' -Kind GetProperty -Arguments @(0)
    return [string](Invoke-ComMember $info 'Property' -Kind GetProperty -Arguments @(7))
}

function Test-IsElevated {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-UninstallEntries {
    <# Every Add or Remove Programs entry in the machine (64-bit and 32-bit views) and current-user locations. #>
    $entries = New-Object System.Collections.Generic.List[object]
    foreach ($root in $script:UninstallRoots) {
        if (-not (Test-Path $root.Path)) { continue }
        foreach ($key in Get-ChildItem -Path $root.Path -ErrorAction SilentlyContinue) {
            $p = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
            if ($null -eq $p) { continue }
            $get = { param($n) if ($p.PSObject.Properties[$n]) { [string]$p.$n } else { $null } }
            $entries.Add([pscustomobject]@{
                Location         = "$($root.Hive) ($($root.View))"
                KeyName          = $key.PSChildName
                DisplayName      = & $get 'DisplayName'
                Publisher        = & $get 'Publisher'
                DisplayVersion   = & $get 'DisplayVersion'
                UninstallString  = & $get 'UninstallString'
                InstallLocation  = & $get 'InstallLocation'
                WindowsInstaller = & $get 'WindowsInstaller'
                SystemComponent  = & $get 'SystemComponent'
            })
        }
    }
    return , $entries.ToArray()
}

function Get-SignatureReport {
    <# Authenticode status from PowerShell, plus "signtool verify /pa" when the Windows SDK is installed. #>
    param([Parameter(Mandatory)][string]$Path)
    $sig = Get-AuthenticodeSignature -FilePath $Path
    $report = [ordered]@{
        File        = $Path
        Status      = [string]$sig.Status
        Signer      = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
        Issuer      = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { $null }
        Timestamped = [bool]$sig.TimeStamperCertificate
        SignTool    = $null
        SignToolExitCode = $null
    }
    $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName | Select-Object -Last 1
    if ($signtool) {
        $report.SignTool = $signtool.FullName
        # signtool writes "No signature found" to stderr; Windows PowerShell would turn that into a terminating error.
        $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { $out = & $signtool.FullName verify /pa /v $Path 2>&1 } finally { $ErrorActionPreference = $previous }
        $report.SignToolExitCode = $LASTEXITCODE
        $report.SignToolOutput = ($out | Out-String).Trim()
    }
    return [pscustomobject]$report
}

function New-CheckResult {
    param([string]$Id, [string]$Name, [ValidateSet('PASS', 'FAIL', 'BLOCKED', 'NOT RUN', 'INFO')][string]$Status,
          [string]$Expected = '', [string]$Actual = '', [string]$Detail = '')
    return [pscustomobject][ordered]@{ Id = $Id; Name = $Name; Status = $Status; Expected = $Expected; Actual = $Actual; Detail = $Detail }
}

function Get-FileSha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

Export-ModuleMember -Function Open-MsiDatabase, Close-MsiDatabase, Get-MsiRows, Get-MsiProperties, Get-MsiTemplate,
    Test-IsElevated, Get-UninstallEntries, Get-SignatureReport, New-CheckResult, Get-FileSha256
