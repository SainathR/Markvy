import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Calls one of Markvy's commands from inside the page. */
export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.executeAsync((c: string, a: Record<string, unknown>, done: (v: unknown) => void) => {
    (window as any).__TAURI_INTERNALS__.invoke(c, a).then(done, (e: unknown) => done({ failed: e }));
  }, cmd, args) as Promise<T>;
}

/** A folder of documents, written by the test (never by Markvy). Returns its path. */
export function makeFolder(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'markvy-docs-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}

export const heading1 = () => $('[aria-label="Document"] h1');

/** The innermost element whose text contains `t`. (WebdriverIO's bare `*=text` only matches links.) */
export const text = (t: string) =>
  $(`//*[contains(normalize-space(.), "${t}") and not(*[contains(normalize-space(.), "${t}")])]`);

/** A link or other element inside the reading pane, found by its text. */
export const inDoc = (selector: string) => $('[aria-label="Document"]').$(selector);

export async function openSample(): Promise<void> {
  await $('button*=Explore the sample library').click();
  await heading1().waitForDisplayed();
}

export function bench(name: string, ms: number): void {
  console.log(`BENCH ${name}=${Math.round(ms)}`);
}

/**
 * Runs JavaScript in Markvy's page over the web view's DevTools port, without the WebDriver session.
 * Needed after a renderer crash: msedgedriver keeps answering "tab crashed" for the rest of the session,
 * even though the page has reloaded (Inspector.targetReloadedAfterCrash).
 */
export async function evalInPage(expression: string): Promise<unknown> {
  // WebDriver starts the web view with --remote-debugging-port=0 and a data folder scoped_dir*/EBWebView in the temp
  // folder; the real port is the first line of DevToolsActivePort there. scoped_dir* is the naming of every
  // msedgedriver/chromedriver session, so only files written since this session began are candidates, and the target
  // must be Markvy's own origin.
  const since = Number(process.env.MARKVY_E2E_SESSION_START ?? 0);
  const files = readdirSync(os.tmpdir())
    .filter((n) => n.startsWith('scoped_dir'))
    .map((n) => path.join(os.tmpdir(), n, 'EBWebView', 'DevToolsActivePort'))
    .filter((f) => existsSync(f) && statSync(f).mtimeMs >= since)
    .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs);
  for (const file of files) {
    const port = readFileSync(file, 'utf8').split(/\r?\n/)[0];
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json`).catch(() => undefined))?.json().catch(() => [])) as { type: string; url: string; webSocketDebuggerUrl: string }[] | undefined;
    const page = targets?.find((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/'));
    if (page) return runOverDevTools(page.webSocketDebuggerUrl, expression);
  }
  throw new Error(`Markvy’s DevTools page was not found (${files.length} DevToolsActivePort file(s) written since the session began under ${os.tmpdir()}${path.sep}scoped_dir*).`);
}

function runOverDevTools(url: string, expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const finish = (fn: () => void) => { clearTimeout(timer); ws.close(); fn(); };
    const timer = setTimeout(() => finish(() => reject(new Error('DevTools did not answer in 5 seconds.'))), 5000);
    ws.onerror = () => finish(() => reject(new Error('DevTools connection failed.')));
    ws.onclose = () => finish(() => reject(new Error('DevTools closed before answering.'))); // a no-op once settled
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id !== 1) return;
      finish(() => (d.result?.exceptionDetails ? reject(new Error(d.result.exceptionDetails.text)) : resolve(d.result?.result?.value)));
    };
  });
}
