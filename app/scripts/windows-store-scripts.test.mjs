// @vitest-environment node
// Guards for the Microsoft Store MSI tooling in scripts/windows (docs/microsoft-store).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
