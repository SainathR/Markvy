// Start-up time without WebDriver attached: launches the e2e build 3 times and takes the median (target: under 1.5 s).
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(appDir, 'src-tauri', 'target');
const binary = path.join(targetDir, 'release', process.platform === 'win32' ? 'markvy.exe' : 'markvy');
const times = [];
for (let i = 0; i < 3; i++) {
  const env = { ...process.env, MARKVY_E2E_STARTUP_EXIT: '1', MARKVY_DATA_DIR: mkdtempSync(path.join(os.tmpdir(), 'markvy-bench-')) };
  const run = spawnSync(binary, [], { env, encoding: 'utf8', timeout: 30_000 });
  const ms = Number(/BENCH startup_ms=(\d+)/.exec(run.stdout ?? '')?.[1]);
  if (!Number.isFinite(ms)) { console.error(`Run ${i + 1} printed no start-up time.`, run.stderr); process.exit(1); }
  console.log(`BENCH startup_ms=${ms}`);
  times.push(ms);
}
const median = [...times].sort((a, b) => a - b)[1];
console.log(`BENCH startup_median_ms=${median}`);
process.exit(median >= 1500 ? 1 : 0);
