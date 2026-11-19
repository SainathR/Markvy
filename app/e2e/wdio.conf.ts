import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(appDir, 'src-tauri', 'target');
const binary = path.join(targetDir, 'release', process.platform === 'win32' ? 'markvy.exe' : 'markvy');
const localEdgeDriver = path.join(appDir, 'e2e', '.driver', 'msedgedriver.exe');
const nativeDriver = process.env.MARKVY_NATIVE_DRIVER ?? (process.platform === 'win32' && existsSync(localEdgeDriver) ? localEdgeDriver : undefined);
let driver: ChildProcess | undefined;

const listening = (port: number) => new Promise<boolean>((resolve) => {
  const socket = net.connect(port, '127.0.0.1', () => { socket.end(); resolve(true); });
  socket.on('error', () => resolve(false));
});

/** tauri-driver starts the native driver (port 4445) when it starts; a session asked for before that is refused. */
async function waitForNativeDriver(timeoutMs = 30_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && !(await listening(4445))) await new Promise((r) => setTimeout(r, 200));
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4444,
  capabilities: [{ 'tauri:options': { application: binary } } as WebdriverIO.Capabilities],
  logLevel: 'warn',
  waitforTimeout: 10_000,
  waitforInterval: 20,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
  onPrepare() {
    if (process.env.MARKVY_E2E_SKIP_BUILD) return;
    // WebdriverIO sets NODE_ENV=test, which would make Vite build the development flavour of Svelte and of the Markdown
    // parser (assertions, debug calls): several times slower than the release build the speed checks stand for.
    const env = { ...process.env, NODE_ENV: 'production' };
    const built = spawnSync('npm', ['run', 'tauri', 'build', '--', '--no-bundle', '--features', 'e2e'], { cwd: appDir, stdio: 'inherit', shell: true, env });
    if (built.status !== 0) throw new Error('The e2e build failed.');
  },
  // One fresh data folder per spec file: never the tester's own library (A13).
  async beforeSession() {
    process.env.MARKVY_E2E_SESSION_START = String(Date.now() - 1000);
    process.env.MARKVY_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'markvy-e2e-'));
    const args = nativeDriver ? ['--native-driver', nativeDriver] : [];
    driver = spawn(path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver'), args, { stdio: [null, process.stdout, process.stderr], env: process.env });
    await waitForNativeDriver(); // otherwise WebdriverIO's few quick retries can all land before it listens (a cold first start)
  },
  afterSession() {
    driver?.kill();
  },
};
