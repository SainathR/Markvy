import { Key } from 'webdriverio';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { heading1, inDoc, invoke, makeFolder, openSample, text } from '../helpers.js';

describe('The brief’s 12 UAT scenarios (§7, brief section 12)', () => {
  it('1. a first-time user sees the welcome screen and no saved session', async () => {
    await $('h1*=Welcome to Markvy').waitForDisplayed();
    await expect(text('No saved session yet.')).toBeDisplayed();
  });

  it('2. opens an individual Markdown document', async () => {
    const root = makeFolder({ 'Trip plan.md': '# Trip plan\n\nPack the [[Checklist]].\n', 'Checklist.md': '# Checklist\n\n- Passport\n' });
    await invoke('e2e_set_next_pick', { path: path.join(root, 'Trip plan.md') });
    await $('button*=Open a document').click();
    await expect(heading1()).toHaveText('Trip plan');
    await $('a=Checklist').click(); // its folder opened too (A1), so the wiki link works
    await expect(heading1()).toHaveText('Checklist');
  });

  it('3. browses an interconnected wiki', async () => {
    await $('[aria-label$="Home"]').click();
    await openSample();
    await inDoc('a=Introduction').click();
    await expect(heading1()).toHaveText('Introduction to Digital Services');
  });

  it('4. searches for a specific topic', async () => {
    const box = $('[aria-label="Search documents"]');
    await box.setValue('printing');
    await browser.keys(Key.Enter);
    await expect(text('Introduction to Digital Services')).toBeDisplayed();
  });

  it('5. goes to the matching section', async () => {
    await text('Printing from a public computer').click();
    const section = inDoc('h3*=Printing from a public computer');
    await section.waitForDisplayed();
    await expect(section).toBeDisplayedInViewport();
  });

  it('6. opens multiple tabs', async () => {
    await $('[aria-label$="Home"]').click();
    await openSample();
    const link = inDoc('a=Glossary');
    await browser.action('key').down(Key.Ctrl).perform(true);
    await link.click();
    await browser.action('key').up(Key.Ctrl).perform();
    await browser.waitUntil(async () => (await $$('[aria-label="Open documents"] .tab')).length >= 2);
  });

  it('7. reads two documents side by side', async () => {
    await $('[aria-label="Read side by side"]').click();
    await expect($('[aria-label="Open documents, right side"]')).toBeDisplayed();
    await $('[aria-label="Back to single page"]').click();
  });

  it('8. changes reading preferences', async () => {
    const size = () => browser.execute(() => getComputedStyle(document.querySelector('[aria-label="Document"] p')!).fontSize);
    const before = await size();
    await $('[aria-label="Appearance"]').click();
    await $('[aria-label="Smaller text"]').click();
    await browser.keys(Key.Escape);
    await browser.waitUntil(async () => (await size()) !== before);
  });

  it('9. bookmarks a section, and the bookmark is saved in the test’s own data folder', async () => {
    const mark = $('[aria-label="Bookmark this section"]');
    await mark.moveTo();
    await mark.click();
    await expect(text('Bookmarked “')).toBeDisplayed();
    await browser.pause(1500); // the library saves at most once per second
    expect(existsSync(path.join(process.env.MARKVY_DATA_DIR!, 'library.json'))).toBe(true);
  });

  it('10. returns to the previous reading session', async () => {
    await browser.reloadSession(); // a new Markvy process with the same data folder
    await $('button*=Restore previous session').click();
    await browser.waitUntil(async () => (await $$('[aria-label="Open documents"] .tab')).length >= 2);
  });

  it('11. sees that a link is broken', async () => {
    await $('[aria-label$="Home"]').click();
    await openSample();
    await inDoc('a=Introduction').click();
    await inDoc('a=Security').click();
    await inDoc('a=Troubleshooting').click();
    await inDoc('a=Printer Manual').click();
    await expect($('h2=This page can’t be found')).toBeDisplayed();
    await browser.keys(Key.Escape);
  });

  it('12. understands the internet picture prompt, and nothing is fetched without asking', async () => {
    await $('[aria-label="Back (Alt + Left)"]').click();
    await $('[aria-label="Back (Alt + Left)"]').click();
    await expect(heading1()).toHaveText('Introduction to Digital Services');
    await $('button*=Review and show picture').click();
    await expect($('h2=Show a picture from the internet?')).toBeDisplayed();
    await expect($('dialog')).toHaveText(expect.stringContaining('images.example.org'));
    await $('dialog').$('button=Keep hidden').click();
    await expect($('button*=Review and show picture')).toBeDisplayed();
  });
});
