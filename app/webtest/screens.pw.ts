import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Rule ids that would need the approved design changed: each is listed with its reason in docs/release/accessibility-findings.md. */
const EXEMPT: string[] = [];

async function noViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(EXEMPT).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function openSample(page: Page) {
  await page.getByRole('button', { name: /Explore the sample library/ }).click();
  await expect(page.locator('article h1')).toBeVisible();
}

const openDoc = (page: Page, name: RegExp) => page.locator('.tree-item', { hasText: name }).first().click();

test('Home', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1, name: /Welcome to Markvy/ })).toBeVisible();
  await noViolations(page);
});

test('Reading workspace', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await noViolations(page);
});

test('Search', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.getByLabel('Search documents').fill('printing');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Introduction to Digital Services').first()).toBeVisible();
  await noViolations(page);
});

test('Side-by-side reading', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.getByLabel('Read side by side').click();
  await expect(page.getByLabel('Open documents, right side')).toBeVisible();
  await noViolations(page);
});

test('Reading preferences', async ({ page }) => {
  await page.goto('');
  await page.getByLabel('Preferences').click();
  await expect(page.getByRole('heading', { name: 'Reading preferences' })).toBeVisible();
  await noViolations(page);
});

test('Library and bookmarks', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible();
  await noViolations(page);
});

test('Help dialog', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Help for this screen' }).click();
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await noViolations(page);
});

test('Privacy, security and help', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Help for this screen' }).click();
  await page.getByRole('button', { name: 'All help topics' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy, security and help' })).toBeVisible();
  await noViolations(page);
});

test('Internet picture dialog', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await openDoc(page, /Introduction/);
  await page.getByRole('button', { name: /Review and show picture/ }).click();
  await expect(page.getByRole('heading', { name: 'Show a picture from the internet?' })).toBeVisible();
  await noViolations(page);
});

test('Broken link dialog', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await openDoc(page, /Troubleshooting/);
  await page.locator('article a', { hasText: 'Printer Manual' }).click();
  await expect(page.getByRole('heading', { name: 'This page can’t be found' })).toBeVisible();
  await noViolations(page);
});

test('Recovery notice after a crash reload restores the tabs', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.waitForTimeout(1500); // saved at most once per second
  await page.goto('?recovered=restore');
  await expect(page.getByText('Markvy had a problem and reloaded. Your tabs are back.')).toBeVisible();
  await expect(page.locator('article h1')).toBeVisible();
});

// Automatic follows the system setting, so it is checked once light and once dark.
const THEMES = [
  { name: 'Automatic', scheme: 'light' }, { name: 'Automatic', scheme: 'dark' },
  { name: 'Paper' }, { name: 'Sepia' }, { name: 'Slate' }, { name: 'Rose' }, { name: 'Night' }, { name: 'Dusk' }, { name: 'Ember' },
] as const;
for (const { name, ...rest } of THEMES) {
  const scheme = 'scheme' in rest ? rest.scheme : undefined;
  test(`Reading workspace contrast: ${name}${scheme ? ` (${scheme})` : ''}`, async ({ page }) => {
    if (scheme) await page.emulateMedia({ colorScheme: scheme });
    await page.goto('');
    await openSample(page);
    await page.getByLabel('Appearance').click();
    const swatch = page.locator('#appearance-pop').getByRole('button', { name, exact: true });
    await swatch.click();
    await expect(swatch).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await noViolations(page);
  });
}

for (const theme of ['Paper', 'Night']) {
  test(`Reading workspace contrast: High contrast over ${theme}`, async ({ page }) => {
    await page.goto('');
    await page.getByLabel('Preferences').click();
    await page.locator('label.swatch', { hasText: theme }).click(); // the swatch chip sits over the radio itself
    await page.getByLabel('High contrast').check();
    await page.getByRole('button', { name: /Markvy — Home/ }).click();
    await openSample(page);
    await noViolations(page);
  });
}

async function openDocs(page: Page) {
  await page.goto('?collection=docs');
  await page.getByRole('button', { name: /Restore previous session/ }).click();
  await expect(page.locator('article h1')).toBeVisible();
}

/** Presses a key (Tab by default) until the focused element has this accessible label or is inside this selector; keyboard only. */
async function focusByKeys(page: Page, match: { label?: string; inside?: string }, key = 'Tab') {
  for (let i = 0; i < 80; i++) {
    const hit = await page.evaluate(({ label, inside }) => {
      const el = document.activeElement;
      return !!el && ((label !== undefined && el.getAttribute('aria-label') === label) || (inside !== undefined && !!el.closest(inside)));
    }, match);
    if (hit) return;
    await page.keyboard.press(key);
  }
  throw new Error(`keyboard never reached ${JSON.stringify(match)}`);
}
const inTable = (page: Page) => page.evaluate(() => !!document.getSelection()?.anchorNode?.parentElement?.closest('td, th'));
const fakeDoc = (page: Page, path: string) => page.evaluate((p) => (window as any).__fakeDoc(p) as string, path);

test.describe('editing', () => {
  test('a complete edit with the keyboard only: heading, list, table row, link, save', async ({ page }) => {
    await openDocs(page);
    const before = await fakeDoc(page, 'Notes.md');
    await focusByKeys(page, { label: 'Edit this page' });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
    await focusByKeys(page, { inside: '.ed-host [contenteditable="true"]' });
    // The editor puts its own caret in the first text a moment after opening; go to the end of the title line once that is done.
    await expect.poll(async () => {
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('End');
      return page.evaluate(() => { const s = document.getSelection(); return !!s?.anchorNode && s.anchorOffset === s.anchorNode.textContent?.length && s.anchorNode.parentElement?.closest('h1') !== null; });
    }).toBe(true);
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Added heading');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- Eggs');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('See site');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft'); // select "site": it becomes the link text
    await focusByKeys(page, { label: 'Link to a web address' }, 'Shift+Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.type('https://example.org');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (let i = 0; i < 40 && !(await inTable(page)); i++) await page.keyboard.press('ArrowDown');
    expect(await inTable(page)).toBe(true);
    await focusByKeys(page, { label: 'Add table row' }, 'Shift+Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    const after = await fakeDoc(page, 'Notes.md');
    expect(after).toContain('## Added heading');
    expect(after).toMatch(/^[-*] Eggs$/m);
    expect(after).toContain('[site](https://example.org)');
    const rows = (t: string) => t.split('\n').filter((l) => l.startsWith('|')).length;
    expect(rows(after)).toBe(rows(before) + 1);
    for (const line of before.split('\n').filter((l) => l && !l.startsWith('|'))) expect(after).toContain(line);
  });

  test('edit mode, cards and every editor dialog have no accessibility violations', async ({ page }) => {
    await openDocs(page);
    await page.getByRole('button', { name: 'Edit this page' }).click();
    await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
    await expect(page.locator('.ed-card[data-kind]').first()).toBeVisible();
    await expect(page.locator('.ed-host table')).toBeVisible();
    await noViolations(page);
    await page.getByRole('button', { name: 'Link to a web address' }).click();
    await expect(page.getByRole('dialog', { name: 'Link to a web address' })).toBeVisible();
    await noViolations(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Link to another page' }).click();
    await expect(page.getByRole('dialog', { name: 'Link to another page' })).toBeVisible();
    await noViolations(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit source' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Edit source' })).toBeVisible();
    await noViolations(page);
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: 'Document text' }).focus();
    await page.keyboard.type('x');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
    await noViolations(page);
  });

  for (const [name, downs] of [['New page', 0], ['Rename', 1], ['Move to the Recycle Bin', 2]] as const) {
    test(`the ${name} dialog opened from the tree menu by keyboard has no accessibility violations`, async ({ page }) => {
      await openDocs(page);
      await page.locator('.tree-item', { hasText: /Notes/ }).first().focus();
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menu')).toBeVisible();
      for (let i = 0; i < downs; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name })).toBeVisible();
      await noViolations(page);
    });
  }

  test('the Sample library has no Edit button', async ({ page }) => {
    await page.goto('');
    await openSample(page);
    await expect(page.getByRole('button', { name: 'Edit this page' })).toHaveCount(0);
  });
});
