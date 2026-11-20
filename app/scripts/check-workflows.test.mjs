// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const load = (name) => parse(readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)), 'utf8'));
const runs = (job) => job.steps.map((s) => s.run ?? '').join('\n');

describe('ci.yml (§7: every change, three platforms)', () => {
  const ci = load('ci.yml');
  const job = ci.jobs.test;

  it('runs on every push and pull request', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push']);
  });

  it('covers Windows, macOS and Linux and lets each finish', () => {
    expect(job.strategy.matrix.os.sort()).toEqual(['macos-latest', 'ubuntu-24.04', 'windows-latest']);
    expect(job.strategy['fail-fast']).toBe(false);
  });

  it('runs every check, test suite and speed check', () => {
    const all = runs(job);
    for (const cmd of ['npm ci', 'npm run check:readonly', 'npm run check:deps', 'npm run check', 'npm test', 'cargo test', '-D clippy::disallowed_methods', '-- --ignored', 'npm run test:web', 'npm run test:e2e']) {
      expect(all).toContain(cmd);
    }
  });

  it('runs whole-app tests only where WebDriver exists (not macOS)', () => {
    const e2e = job.steps.find((s) => (s.run ?? '').includes('npm run test:e2e'));
    expect(e2e.if).toContain("runner.os != 'macOS'");
  });

  it('never builds with the e2e feature outside the whole-app test steps', () => {
    const others = job.steps.filter((s) => !(s.run ?? '').includes('test:e2e'));
    const uses = others.map((s) => s.run ?? '').filter((r) => r.includes('--features e2e'));
    // R9 and I4: only the second clippy run (a lint) and the e2e unit-test step may use the feature
    expect(uses).toHaveLength(2);
    expect(uses.filter((r) => r.includes('cargo clippy'))).toHaveLength(1);
    const tests = uses.filter((r) => !r.includes('cargo clippy'));
    expect(tests).toHaveLength(1);
    expect(tests[0].trim()).toMatch(/^cargo test --manifest-path src-tauri\/Cargo\.toml --features e2e e2e::$/);
  });

  it('I4: runs the e2e unit tests (data dir, first page load, test pick) in CI', () => {
    expect(runs(job)).toContain('--features e2e e2e::');
  });

  it('I2: the workflow can only read the repository', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
  });

  it("R2: installs tauri-driver, and on Windows the msedgedriver of the WebView2 Runtime's version (not Edge's)", () => {
    const all = runs(job);
    expect(all).toContain('cargo install tauri-driver --locked');
    expect(all).not.toContain('msedgedriver-tool');
    expect(all).toContain('{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'); // the WebView2 Runtime's EdgeUpdate client id
    expect(all).toContain('https://msedgedriver.microsoft.com/$webview/edgedriver_win64.zip');
    expect(all).toContain('e2e/.driver'); // where wdio.conf.ts looks for it
  });

  it('R2b: Windows whole-app tests run at Medium integrity; Linux ones get their own D-Bus session', () => {
    const all = runs(job);
    // An elevated WebView2 (Runtime 150+) ignores the variables msedgedriver uses to open its DevTools port.
    expect(all).toContain('gsudo --integrity Medium npm run test:e2e');
    expect(all).toMatch(/choco install gsudo --version=\d+\.\d+\.\d+/); // pinned: it runs as administrator
    // Without a session bus GLib waits 25 s for xdg-desktop-portal before the first frame.
    expect(all).toContain('dbus-run-session -- xvfb-run -a npm run test:e2e');
    expect(all).toContain('dbus-run-session -- xvfb-run -a npm run bench:startup');
  });

  it('R6: ci.yml never names the crash spec; it runs inside test:e2e on Windows and skips itself elsewhere', () => {
    expect(JSON.stringify(ci)).not.toMatch(/crash/i);
  });

  it('R8: measures start-up without WebDriver on Windows and Linux, after the e2e build', () => {
    const idx = job.steps.findIndex((s) => (s.run ?? '').includes('npm run bench:startup'));
    const e2eIdx = job.steps.findIndex((s) => (s.run ?? '').includes('npm run test:e2e'));
    expect(idx).toBeGreaterThan(e2eIdx);
    expect(job.steps[idx].if).toContain("runner.os != 'macOS'");
    expect(job.steps[idx].run).toContain('xvfb-run -a npm run bench:startup');
  });

  it('R9: runs clippy twice, the second time with --features e2e', () => {
    const clippy = job.steps.map((s) => s.run ?? '').filter((r) => r.includes('cargo clippy'));
    expect(clippy).toHaveLength(2);
    for (const c of clippy) expect(c).toContain('-D clippy::disallowed_methods');
    expect(clippy.filter((c) => c.includes('--features e2e'))).toHaveLength(1);
  });
});

describe('release.yml (§8: packages, signing, checksums)', () => {
  const rel = load('release.yml');
  const build = rel.jobs.build;
  const text = readFileSync(fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)), 'utf8');

  it('I2: reads the repository only, except the publish job', () => {
    expect(rel.permissions).toEqual({ contents: 'read' });
    expect(rel.jobs.publish.permissions).toEqual({ contents: 'write' });
  });

  it('I2: no job-level env holds a secret, so npm ci and the build never see one', () => {
    for (const j of Object.values(rel.jobs)) expect(JSON.stringify(j.env ?? {})).not.toContain('secrets.');
    expect(JSON.stringify(rel.env ?? {})).not.toContain('secrets.');
    const holders = build.steps.filter((s) => JSON.stringify(s.env ?? {}).includes('secrets.'));
    // the flag step (booleans only) and the two signing steps are the only steps that mention a secret
    expect(holders.map((s) => s.name)).toEqual(['Check which secrets exist', 'Windows signing certificate', 'macOS signing and notarization identity']);
    expect(holders[0].run).not.toMatch(/WINDOWS_CERTIFICATE|APPLE_/);
    expect(holders[0].run).not.toContain('secrets.');
  });

  it('I2: signing steps are gated on the flag outputs, not on secrets in if:', () => {
    const signing = build.steps.filter((s) => /signing/i.test(s.name ?? ''));
    expect(signing).toHaveLength(2);
    for (const s of signing) {
      expect(s.if).toContain('steps.have.outputs.');
      expect(s.if).not.toContain('secrets.');
    }
  });

  it('I1: Linux says signing is not applicable and prints no unsigned warning', () => {
    const step = build.steps.find((s) => (s.run ?? '').includes('GITHUB_STEP_SUMMARY')).run;
    expect(step).toContain('Linux: signed: not applicable (SHA-256 checksums, spec §8)');
    expect(step).toMatch(/if \[ "\$RUNNER_OS" = "Linux" \]; then[\s\S]*not applicable[\s\S]*else[\s\S]*Unsigned build[\s\S]*fi/);
  });

  it('runs on version tags and by hand', () => {
    expect(rel.on.push.tags).toEqual(['v*']);
    expect(rel.on).toHaveProperty('workflow_dispatch');
  });

  it('builds the spec’s packages on each platform', () => {
    const bundles = Object.fromEntries(build.strategy.matrix.include.map((m) => [m.os, m.bundles]));
    expect(bundles['windows-latest']).toBe('msi,nsis');
    expect(bundles['macos-latest']).toBe('app,dmg');
    expect(bundles['ubuntu-22.04']).toBe('deb,appimage');
    const mac = build.strategy.matrix.include.find((m) => m.os === 'macos-latest');
    expect(mac.args).toContain('universal-apple-darwin');
  });

  it('release workflow signs only when secrets exist and never enables e2e', () => {
    expect(text).not.toMatch(/e2e/);
    const signing = build.steps.filter((s) => /sign/i.test(s.name ?? ''));
    expect(signing.length).toBeGreaterThanOrEqual(2);
    for (const s of signing) expect(s.if).toMatch(/== 'true'/);
  });

  it('writes SHA-256 checksums and says whether the build was signed', () => {
    expect(runs(build)).toContain('sha256sum');
    expect(runs(build)).toContain('GITHUB_STEP_SUMMARY');
    expect(runs(rel.jobs.publish)).toContain('SHA256SUMS.txt');
  });

  it('hashes the installers without the checksum file hashing itself', () => {
    const collect = runs(build);
    expect(collect).toMatch(/\(cd \.\.\/out && .*sha256sum[^)]*\)\) > \.\.\/SHA256SUMS-/);
    expect(collect).not.toMatch(/cd \.\.\/out && \(sha256sum[^\n]*> SHA256SUMS/);
  });

  it('fails the build when no installers were collected', () => {
    const step = build.steps.find((s) => (s.run ?? '').includes('sha256sum')).run;
    expect(step).toMatch(/ls -A \.\.\/out/);
    expect(step.indexOf('exit 1')).toBeGreaterThan(-1);
    expect(step.indexOf('exit 1')).toBeLessThan(step.indexOf('sha256sum'));
  });

  it('exports the Apple certificate safely even if its base64 has line breaks', () => {
    const step = build.steps.find((s) => (s.name ?? '').startsWith('macOS signing')).run;
    expect(step).toMatch(/APPLE_CERTIFICATE<<\S+/);
    expect(step).not.toMatch(/echo "APPLE_CERTIFICATE=/);
  });

  it('I5: e2e never ships: no all-features, no e2e default feature, tauri build and never tauri bundle', () => {
    expect(text).not.toContain('all-features');
    const cargo = readFileSync(fileURLToPath(new URL('../src-tauri/Cargo.toml', import.meta.url)), 'utf8');
    const features = cargo.slice(cargo.indexOf('[features]')).split(/\n\[/)[0];
    expect(features).not.toMatch(/default\s*=\s*\[[^\]]*e2e/);
    const steps = runs(rel.jobs.build);
    expect(steps).toContain('tauri build');
    expect(steps).not.toContain('tauri bundle');
  });

  it('publishes only as a draft, so a person checks it first', () => {
    expect(runs(rel.jobs.publish)).toContain('--draft');
  });
});

describe('tauri.conf.json (§1, §8)', () => {
  const conf = JSON.parse(readFileSync(fileURLToPath(new URL('../src-tauri/tauri.conf.json', import.meta.url)), 'utf8'));
  it('has no updater and no e2e', () => {
    expect(JSON.stringify(conf)).not.toMatch(/updater|e2e/i);
  });
  it('has the bundle metadata installers show', () => {
    expect(conf.bundle.publisher).toBeTruthy();
    expect(conf.bundle.category).toBe('Productivity');
    expect(conf.bundle.shortDescription).toBeTruthy();
  });
  it('I3: the long description does not claim it sends nothing (pictures load after approval)', () => {
    expect(conf.bundle.longDescription).not.toMatch(/sends nothing/);
    expect(conf.bundle.longDescription).toBe('Markvy opens Markdown documents and wiki folders on your computer, shows them like a book, and lets you edit them like a Word document. It changes your files only when you press Save, rename or delete, and works offline. Pictures from the internet are shown only if you allow it.');
  });
});

describe('Microsoft Store MSI (docs/microsoft-store)', () => {
  const store = JSON.parse(readFileSync(fileURLToPath(new URL('../src-tauri/tauri.microsoftstore.conf.json', import.meta.url)), 'utf8'));
  const conf = JSON.parse(readFileSync(fileURLToPath(new URL('../src-tauri/tauri.conf.json', import.meta.url)), 'utf8'));
  const wf = load('microsoft-store-msi-validation.yml');
  const steps = runs(wf.jobs.validate);

  it('the Store overlay builds an MSI that carries WebView2 offline, so setup never downloads anything', () => {
    expect(store.bundle.targets).toEqual(['msi']);
    expect(store.bundle.windows.webviewInstallMode.type).toBe('offlineInstaller');
  });

  it('pins the MSI UpgradeCode Tauri derived for 0.1.0, so every update replaces the installed app', () => {
    expect(conf.bundle.windows.wix.upgradeCode).toBe('A0568F55-DEF4-5F54-894F-D253A53D88FF');
  });

  it('the validation workflow runs by hand, reads the repository only and publishes nothing', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch']);
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(JSON.stringify(wf)).not.toMatch(/gh release|contents: write/);
  });

  it('builds through the Store script (tauri build, never tauri bundle) and installs only on the disposable runner', () => {
    expect(steps).toContain('Build-MarkvyMicrosoftStore.ps1');
    expect(steps).toContain('Test-MarkvyMicrosoftStore.ps1');
    expect(steps).toContain('-Install');
    expect(steps).not.toContain('tauri bundle');
    expect(wf.jobs.validate['runs-on']).toBe('windows-latest');
  });

  it('keeps secrets out of job-level env and the build step', () => {
    expect(wf.jobs.validate.env).toBeUndefined();
    const build = wf.jobs.validate.steps.find((s) => (s.run ?? '').includes('Build-MarkvyMicrosoftStore.ps1'));
    expect(JSON.stringify(build)).not.toContain('secrets.');
  });
});

describe('GitHub Actions runtime', () => {
  // GitHub retired the Node.js 20 runner for actions; these are the first majors that run on Node.js 24.
  const NODE24 = { 'actions/checkout': 5, 'actions/setup-node': 5, 'actions/upload-artifact': 6, 'actions/download-artifact': 7 };
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/microsoft-store-msi-validation.yml']) {
    it(`${file} uses only actions that run on Node.js 24`, () => {
      const text = readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
      for (const [, name, major] of text.matchAll(/uses:\s*(actions\/[\w-]+)@v(\d+)/g)) {
        expect(NODE24[name], `${name} is not in the list`).toBeDefined();
        expect(Number(major), name).toBeGreaterThanOrEqual(NODE24[name]);
      }
    });
  }
});

describe('keyboard-only editing screen test (app/webtest/screens.pw.ts)', () => {
  const spec = readFileSync(fileURLToPath(new URL('../webtest/screens.pw.ts', import.meta.url)), 'utf8');
  const pane = readFileSync(fileURLToPath(new URL('../src/EditorPane.svelte', import.meta.url)), 'utf8');

  it('waits for what the editor has seen, never for a fixed time', () => {
    const start = spec.indexOf("test('a complete edit with the keyboard only");
    const body = spec.slice(spec.lastIndexOf('const inTable', start), spec.indexOf("\n  test(", start + 1));
    expect(start).toBeGreaterThan(0);
    expect(body).not.toMatch(/waitForTimeout|setTimeout/);
    expect(body).toContain('selectionchange');
  });

  it('the toolbar link (app/src/EditorPane.svelte) uses the addWebLink tested in model.test.ts', () => {
    const local = /import \{[^}]*\baddWebLink(?:\s+as\s+(\w+))?[^}]*\}\s*from\s*'\.\/lib\/editor\/codec'/.exec(pane);
    expect(local, 'EditorPane imports addWebLink from codec').not.toBeNull();
    expect(pane).toContain(`${local[1] ?? 'addWebLink'}(codec, `);
  });
});
