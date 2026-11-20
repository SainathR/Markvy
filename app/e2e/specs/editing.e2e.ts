import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evalInPage, invoke, makeFolder } from '../helpers.js';

const surface = () => $('[aria-label="Document text"]');
const save = () => browser.keys(['Control', 's']);
const savedLabel = () => $('span=Saved');
const endOfText = async () => { await surface().click(); await browser.keys(['Control', 'End']); };
const LINKS = `Links${Date.now()}.md`; // unique per run, so an older Recycle Bin item cannot satisfy the check
const read = (root: string, name: string) => readFileSync(path.join(root, name), 'utf8');

describe('Editing (Windows)', () => {
  // Windows scenarios (release checklist 9a). WebKitWebDriver drops keys in the editor (Enter, a repeated letter);
  // macOS and Linux run the vitest round trips instead.
  before(function () { if (process.platform !== 'win32') this.skip(); });
  let root: string;
  before(async () => {
    root = makeFolder({ 'Page.md': '# Page\n\nFirst line.\n\n- one\n- two\n', [LINKS]: 'See [[Page]].\n' });
    await invoke('e2e_set_next_pick', { path: root });
    await $('.action-card*=Open a folder').click();
    await $('.tree-item*=Page').click();
    await $('[aria-label="Edit this page"]').click();
  });

  it('1. edits, saves and the file differs only by the new line', async () => {
    await endOfText();
    await browser.keys('\nAdded line.');
    await save();
    await savedLabel().waitForDisplayed();
    const out = read(root, 'Page.md');
    expect(out).toBe('# Page\n\nFirst line.\n\n- one\n- two\n- Added line.\n'); // Enter at the end of the last bullet starts a new bullet
  });

  it('2. combines a change made outside Markvy', async () => {
    await endOfText();
    await browser.keys(' draft words');
    const file = path.join(root, 'Page.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('# Page', '# Page (outside)'));
    await save();
    await $('button=Combine both').click();
    await browser.waitUntil(() => read(root, 'Page.md').includes('draft words'));
    const out = read(root, 'Page.md');
    expect(out).toContain('# Page (outside)');
    expect(out).toContain('Added line.');
    await $('button=Done').click();
  });

  it('3. renames and updates the link in the other page', async () => {
    await $('.tree-item*=Page').click({ button: 'right' });
    await $('[role="menuitem"]=Rename').click();
    await $('input[aria-describedby="name-problem"]').setValue('Renamed.md');
    await $('p*=1 link in 1 page').waitForDisplayed();
    await $('button=Rename').click();
    await browser.waitUntil(() => existsSync(path.join(root, 'Renamed.md')));
    expect(read(root, LINKS)).toBe('See [[Renamed]].\n');
  });

  it('4. deletes to the Recycle Bin', async () => {
    await $(`.tree-item*=${LINKS.replace('.md', '')}`).click({ button: 'right' });
    await $('[role="menuitem"]=Delete').click();
    await $('button=Move to the Recycle Bin').click();
    await browser.waitUntil(() => !existsSync(path.join(root, LINKS)));
    const bin = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $_.Name }'], { encoding: 'utf8' });
    expect(bin).toContain(LINKS.replace('.md', '')); // the Bin may hide the extension
    // Restoring from the Recycle Bin is checked by hand in the UAT script.
  });

  it('5. a pasted screenshot is saved in images/ and linked', async () => {
    expect(await $('*=changed on disk').isExisting()).toBe(false); // the rename must not leave a stale notice
    await $('.tree-item*=Renamed').click();
    await $('[aria-label="Edit this page"]').click();
    await surface().waitForDisplayed();
    await browser.execute(() => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
      document.querySelector('[aria-label="Document text"]')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(() => existsSync(path.join(root, 'images', 'Renamed-1.png')));
    await surface().$('img').waitForExist();
    await surface().click();
    await save();
    await browser.waitUntil(() => read(root, 'Renamed.md').includes('](images/Renamed-1.png)'));
  });

  // Last: after a crash msedgedriver answers "tab crashed" for the rest of the session, so the page is read over DevTools.
  it('6. offers the draft back after the window crashes', async function () {
    if (process.platform !== 'win32') this.skip();
    await endOfText();
    await browser.keys(' crash draft');
    await browser.pause(1500); // drafts are kept shortly after typing
    try { await browser.execute(() => { void (window as any).__TAURI_INTERNALS__.invoke('e2e_crash_webview'); }); } catch { /* the page may die first */ }
    let lastError = 'none';
    const page = async (js: string) => evalInPage(js).catch((e) => { lastError = String(e); return undefined; });
    await browser.waitUntil(async () => !!(await page('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Restore")')), { timeout: 20_000, interval: 500 })
      .catch(() => { throw new Error(`the Restore banner never appeared; last DevTools error: ${lastError}`); });
    await page('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Restore").click(); 1');
    await browser.waitUntil(async () => String(await page('document.querySelector("[aria-label=\\"Document text\\"]")?.textContent')).includes('crash draft'), { timeout: 10_000, timeoutMsg: 'the draft was not restored' });
  });
});
