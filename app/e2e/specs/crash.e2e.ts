import { evalInPage, heading1, inDoc, openSample } from '../helpers.js';

// After a crash msedgedriver answers "tab crashed" for the rest of the session, even though the page has reloaded,
// so everything after the crash is read from the page over its DevTools port (see evalInPage).
const crashViaDriver = async () => {
  try {
    await browser.execute(() => { void (window as any).__TAURI_INTERNALS__.invoke('e2e_crash_webview'); });
  } catch { /* the page may die before the driver gets its answer */ }
};
let lastError = 'none';
const pageText = async () => String(await evalInPage('document.body.innerText').catch((e) => { lastError = String(e); return ''; }));
const pageShows = (needle: string) =>
  browser.waitUntil(async () => (await pageText()).includes(needle), { timeout: 20_000, interval: 500 })
    .catch(() => { throw new Error(`"${needle}" never appeared after the crash; last DevTools error: ${lastError}`); });

describe('Web view crash (§5, A12)', function () {
  // WebKitWebDriver cannot survive a web-process kill either; Linux crash recovery is on the manual checklist.
  before(function () { if (process.platform !== 'win32') this.skip(); });

  it('reloads and brings the tabs back', async () => {
    await openSample();
    await inDoc('a=Introduction').click();
    await expect(heading1()).toHaveText('Introduction to Digital Services');
    await browser.pause(1500); // the session is saved at most once per second
    await crashViaDriver();
    await pageShows('Your tabs are back.');
    expect(await evalInPage('document.querySelector("[aria-label=Document] h1")?.textContent')).toBe('Introduction to Digital Services');
  });

  it('a second crash within a minute reloads without reopening the tabs', async () => {
    // The page dying before it replies is the expected outcome, so a rejected answer is ignored.
    await evalInPage('window.__TAURI_INTERNALS__.invoke("e2e_crash_webview"); 1').catch(() => {});
    await pageShows('Your tabs weren’t reopened');
    expect(await pageText()).toContain('Restore previous session');
  });
});
