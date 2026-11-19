import path from 'node:path';
import { bench, invoke, makeFolder, text } from '../helpers.js';

// The 1.5 s start-up target is checked without WebDriver attached: `npm run bench:startup`.
describe('Speed targets (§7)', () => {
  it('reports how long start-up took with WebDriver attached (information only)', async () => {
    await $('h1*=Welcome to Markvy').waitForDisplayed();
    const { sinceStart, painted } = await browser.executeAsync((done: (v: { sinceStart: number; painted: number }) => void) => {
      (window as any).__TAURI_INTERNALS__.invoke('e2e_uptime_ms').then((uptime: number) => {
        const paint = performance.getEntriesByName('first-contentful-paint')[0];
        done({ sinceStart: uptime, painted: performance.timeOrigin + paint.startTime - (Date.now() - uptime) });
      });
    });
    bench('startup_webdriver_ms', painted);
    bench('startup_when_asked_ms', sinceStart);
  });

  it('shows a 1,000-file folder’s tree in under 2 seconds (median of 3, a fresh folder each time)', async () => {
    const times: number[] = [];
    for (let run = 1; run <= 3; run++) {
      const files: Record<string, string> = {};
      for (let s = 0; s < 20; s++) for (let f = 0; f < 50; f++) files[path.join(`Run ${run} Section ${String(s).padStart(2, '0')}`, `Page ${f}.md`)] = `# Page ${f}\n`;
      await invoke('e2e_set_next_pick', { path: makeFolder(files) });
      await $('[aria-label$="Home"]').click();
      const started = Date.now();
      await $('.action-card*=Open a folder').click();
      await text(`Run ${run} Section 19`).waitForDisplayed();
      const ms = Date.now() - started;
      bench(`tree_1000_run${run}_ms`, ms);
      times.push(ms);
    }
    const median = [...times].sort((a, b) => a - b)[1];
    bench('tree_1000_median_ms', median);
    expect(median).toBeLessThan(2000);
  });
});
