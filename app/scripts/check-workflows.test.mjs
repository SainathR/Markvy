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

  it('R2: installs tauri-driver and msedgedriver-tool from git, never the crates.io name', () => {
    const all = runs(job);
    expect(all).toContain('cargo install tauri-driver --locked');
    expect(all).toContain('cargo install --git https://github.com/chippers/msedgedriver-tool --locked');
    expect(all).not.toContain('cargo install msedgedriver-tool');
    expect(all).toMatch(/cd e2e\/\.driver && msedgedriver-tool/);
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
