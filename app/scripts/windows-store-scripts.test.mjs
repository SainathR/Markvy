// @vitest-environment node
// Guards for the Microsoft Store MSI tooling in scripts/windows (docs/microsoft-store).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const files = {
  module: 'scripts/windows/MarkvyStore.psm1',
  build: 'scripts/windows/Build-MarkvyMicrosoftStore.ps1',
  metadata: 'scripts/windows/Test-MarkvyMsiMetadata.ps1',
  silent: 'scripts/windows/Test-MarkvySilentInstall.ps1',
  bundleware: 'scripts/windows/Test-MarkvyBundleware.ps1',
  matrix: 'scripts/windows/Test-MarkvyMicrosoftStore.ps1',
  msix: 'scripts/windows/Build-MarkvyMsix.ps1',
  workflow: '.github/workflows/microsoft-store-msi-validation.yml',
};
const text = (key) => readFileSync(join(repo, files[key]), 'utf8');
const conf = JSON.parse(readFileSync(join(repo, 'app/src-tauri/tauri.conf.json'), 'utf8'));

// Windows PowerShell on Windows; PowerShell 7 elsewhere (preinstalled on GitHub runners). Absent: the parse test skips.
const shell = ['powershell.exe', 'pwsh'].find((exe) => spawnSync(exe, ['-NoProfile', '-Command', 'exit 0']).status === 0);
const ps = (script, args) => spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(repo, script), ...args], { encoding: 'utf8' });

describe('Store MSI scripts', () => {
  it.skipIf(!shell)('every script parses without errors', () => {
    const list = Object.entries(files).filter(([k]) => k !== 'workflow').map(([, f]) => join(repo, f).replace(/'/g, "''"));
    const cmd = list.map((f) => `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${f}',[ref]$null,[ref]$e); if ($e) { $e | % { Write-Output $_.Message }; exit 1 }`).join('; ');
    const r = spawnSync(shell, ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('');
    expect(r.status).toBe(0);
  });

  it('the metadata check expects the UpgradeCode pinned in tauri.conf.json', () => {
    expect(text('metadata')).toContain(`{${conf.bundle.windows.wix.upgradeCode}}`);
    expect(text('metadata')).toContain(`[string]$ExpectedManufacturer = '${conf.bundle.publisher}'`);
  });

  it('installs the way Partner Center does: /qn /norestart with a verbose log, and refuses without elevation', () => {
    const s = text('silent');
    for (const part of ["'/qn'", "'/norestart'", "'/L*v'", 'Test-IsElevated', '3010', '1603', '1618', '1619']) expect(s).toContain(part);
  });

  it('builds with tauri build and the Store overlay, never tauri bundle, and never overwrites a release without -Force', () => {
    const b = text('build');
    expect(b).toContain("'tauri', '--', 'build', '--bundles', 'msi', '--config', 'src-tauri/tauri.microsoftstore.conf.json'");
    expect(b).not.toMatch(/'tauri', '--', 'bundle'/);
    expect(b).toContain('-not $Force');
  });

  it('installs software only when asked: the matrix gates install and upgrade tests behind -Install and -Upgrade', () => {
    const m = text('matrix');
    expect(m).toContain("if (-not $Install)");
    expect(m).toContain("if (-not $Upgrade)");
    expect(m).toContain("'NOT RUN'");
    expect(m).toContain('never removes an existing installation');
  });

  it('packs the MSIX from the build output (no capture), full trust, unsigned unless -Sign, never overwriting without -Force', () => {
    const m = text('msix');
    expect(m).toContain('makeappx.exe');
    expect(m).toContain('pack /d $stage /p $out');
    expect(m).toContain('EntryPoint="Windows.FullTrustApplication"');
    expect(m).toContain('<rescap:Capability Name="runFullTrust" />');
    expect(m).toContain('if ($Sign)');
    expect(m).toContain('-not $Force');
    expect(m).toContain('$conf.bundle.resources'); // the sample library ships as in the MSI
    expect(m).toContain("[ValidatePattern('^CN=')][string]$Publisher");
    expect(m).not.toMatch(/Export-PfxCertificate/); // the test key never leaves the certificate store
  });

  it('pins the Partner Center identity and refuses a Store package that does not match it', () => {
    const m = text('msix');
    // Partner Center > Markvy > Product identity. The family name is the value Partner Center reported as expected.
    expect(m).toContain("Name                 = 'SainathRacherla.Markvy'");
    expect(m).toContain("Publisher            = 'CN=AABA4554-FFA3-4FD6-BCD6-9241B5386682'");
    expect(m).toContain("PublisherDisplayName = 'Sainath Racherla'");
    expect(m).toContain("FamilyName           = 'SainathRacherla.Markvy_2bytvpccj1m9w'");
    expect(m).toContain("[string]$IdentityName = 'SainathRacherla.Markvy'"); // the defaults are the Store identity
    expect(m).toContain('if (-not $Sign) {');
    expect(m).toContain('Get-PackageFamilyName -Name $id.Name -Publisher $id.Publisher'); // checked again from the packed manifest
  });

  it('the workflow runs the scripts in this folder', () => {
    const w = text('workflow');
    expect(w).toContain('./scripts/windows/Build-MarkvyMicrosoftStore.ps1');
    expect(w).toContain('./scripts/windows/Test-MarkvyMicrosoftStore.ps1');
  });
});

describe.runIf(process.platform === 'win32' && shell)('Store MSI scripts on Windows (no installation)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'markvy-store-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('the silent installer and the metadata check reject a missing MSI with exit code 2', () => {
    const missing = join(dir, 'missing.msi');
    expect(ps(files.silent, ['-MsiPath', missing, '-LogDirectory', dir]).status).toBe(2);
    expect(ps(files.metadata, ['-MsiPath', missing]).status).toBe(2);
  });

  it('the MSIX packer rejects a missing markvy.exe with exit code 2 and writes nothing', () => {
    const r = ps(files.msix, ['-Exe', join(dir, 'missing.exe'), '-OutputDirectory', join(dir, 'msix')]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('markvy.exe not found');
    expect(existsSync(join(dir, 'msix'))).toBe(false);
  });

  it('the MSIX packer refuses a Store package with an identity Partner Center rejected, before building anything', () => {
    // The identity of the first, rejected upload (2026-11-21).
    const r = ps(files.msix, ['-IdentityName', 'Markvy', '-Publisher', 'CN=Sainath Racherla', '-Exe', join(dir, 'missing.exe'), '-OutputDirectory', join(dir, 'msix-wrong')]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("identity name 'Markvy' (Partner Center: 'SainathRacherla.Markvy')");
    expect(r.stdout).toContain("package family name 'Markvy_4w10n323msdkp' (Partner Center: 'SainathRacherla.Markvy_2bytvpccj1m9w')");
    expect(existsSync(join(dir, 'msix-wrong'))).toBe(false);
  });

  it('derives package family names the way Windows does', () => {
    const mod = join(repo, files.module).replace(/'/g, "''");
    const r = spawnSync(shell, ['-NoProfile', '-Command', `Import-Module '${mod}'; Get-PackageFamilyName -Name 'SainathRacherla.Markvy' -Publisher 'CN=AABA4554-FFA3-4FD6-BCD6-9241B5386682'; Get-PackageFamilyName -Name 'Markvy' -Publisher 'CN=Sainath Racherla'`], { encoding: 'utf8' });
    // The first is what Partner Center expects; the second is what Windows gave the test install of the rejected identity.
    expect(r.stdout.trim().split(/\r?\n/)).toEqual(['SainathRacherla.Markvy_2bytvpccj1m9w', 'Markvy_4w10n323msdkp']);
  });

  it('the bundleware check saves a baseline and, with nothing installed in between, finds no Markvy entry', () => {
    const base = join(dir, 'before.json');
    expect(ps(files.bundleware, ['-Mode', 'Baseline', '-BaselinePath', base]).status).toBe(0);
    expect(JSON.parse(readFileSync(base, 'utf8').replace(/^﻿/, '')).Entries.length).toBeGreaterThan(0);
    const out = join(dir, 'compare.json');
    const r = ps(files.bundleware, ['-Mode', 'Compare', '-BaselinePath', base, '-OutFile', out, '-ProductName', 'Markvy-not-installed-zz']);
    expect(r.status).toBe(1);
    expect(JSON.parse(readFileSync(out, 'utf8').replace(/^﻿/, '')).Notes).toContain('No Markvy entry after installation.');
  }, 60_000);
});
