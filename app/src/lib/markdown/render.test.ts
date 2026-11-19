import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderDocument } from './render';

// Vite rewrites a literal new URL(..., import.meta.url) under jsdom, so resolve the path explicitly.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/sample-wiki') + '/';
const list = (dir: string, prefix = ''): string[] =>
  readdirSync(dir).flatMap((name) => {
    const rel = prefix + name;
    return statSync(dir + name).isDirectory() ? list(`${dir}${name}/`, `${rel}/`) : [rel];
  });

let files: string[];
beforeAll(() => { files = list(root); });

const render = (path: string, assetUrl = (c: string, p: string) => `markvy://localhost/${c}/${p}`) =>
  renderDocument(readFileSync(root + path, 'utf8'), { collectionId: 'sample', path, files, assetUrl });

describe('renderDocument on the sample library', () => {
  it('uses the frontmatter title and parses tags', () => {
    const r = render('README.md');
    expect(r.title).toBe('Welcome to the Library Handbook');
    expect(r.frontmatter.tags).toEqual(['handbook', 'start-here']);
  });

  it('resolves wiki links, including ones with a section', () => {
    const intro = render('README.md').article.querySelector('a[data-path="Guides/Introduction.md"]');
    expect(intro?.textContent).toBe('Introduction');
    const wifi = render('References/Glossary.md').article.querySelector('a[data-path="Guides/Troubleshooting.md"][data-slug="wi-fi-wont-connect"]');
    expect(wifi?.textContent).toContain('Wi-Fi troubleshooting');
  });

  it('flags exactly the two deliberately broken links', () => {
    const broken = [...render('Guides/Troubleshooting.md').article.querySelectorAll<HTMLElement>('a.broken')].map((a) => a.dataset.target);
    expect(broken).toEqual(['Network-Setup.md', 'Printer Manual']);
  });

  it('turns all five callout types into notes', () => {
    const kinds = [...render('Getting-Started.md').article.querySelectorAll('aside.callout')].map((a) => a.className);
    expect(kinds).toEqual(['callout callout-note', 'callout callout-tip', 'callout callout-important', 'callout callout-warning', 'callout callout-caution']);
  });

  it('gives headings stable slugs', () => {
    expect(render('README.md').article.querySelector('h2[data-slug="whats-inside"]')).not.toBeNull();
  });

  it('serves local images through the asset URL and renders maths', () => {
    const assetUrl = vi.fn((c: string, p: string) => `markvy://localhost/${c}/${p}`);
    const { article } = render('Technical/Architecture.md', assetUrl);
    expect(assetUrl).toHaveBeenCalledWith('sample', 'Images/architecture.svg');
    expect(article.querySelectorAll('math').length).toBeGreaterThanOrEqual(4);
  });

  it('holds back internet pictures behind a placeholder', () => {
    const { article } = render('Guides/Introduction.md');
    const fig = article.querySelector<HTMLElement>('figure.remote-img');
    expect(fig?.dataset.src).toBe('https://images.example.org/elm-street/reading-room.jpg');
    expect(fig?.textContent).toContain('images.example.org');
    expect(article.querySelector('img[src^="http"]')).toBeNull();
  });

  it('keeps diagram source for later drawing', () => {
    const figs = render('Technical/Diagrams.md').article.querySelectorAll<HTMLElement>('figure.diagram');
    expect(figs).toHaveLength(2);
    expect(figs[0].dataset.src).toContain('flowchart TD');
  });

  it('marks website links as external', () => {
    const a = render('README.md').article.querySelector<HTMLElement>('a[data-kind="external"]');
    expect(a?.dataset.url).toBe('https://www.example.org/library');
    expect(a?.querySelector('svg.i.ext-i use[href="#i-external"]')).not.toBeNull();
    expect(a?.querySelector('.vh')?.textContent).toBe(' (opens in your web browser)');
  });

  it('neutralises hostile markup', () => {
    const hostile = [
      '[x](javascript:alert(1))',
      '<p onclick="alert(1)">p</p>',
      '<a data-kind="external" data-url="javascript:alert(1)">forged</a>',
      '<svg><a xlink:href="https://evil.example"><text>s</text></a></svg>',
      '<img src="Images/a.svg" srcset="https://evil.example/x.png 1x">',
      '<video src="https://evil.example/v.mp4"></video>',
      '<table background="https://evil.example/t.png"><tr><td background="https://evil.example/c.png">c</td></tr></table>',
      '<input type="image" src="https://evil.example/i.png">',
      '<math href="https://evil.example/m"><mtext>m</mtext></math>',
      '<math><mrow href="https://evil.example/r"><mi>x</mi></mrow></math>',
      '<map><area href="https://evil.example/a"></map>',
    ].join('\n\n');
    const { article } = renderDocument(hostile, { collectionId: 's', path: 'a.md', files: ['Images/a.svg'], assetUrl: () => 'markvy://localhost/a.svg' });
    for (const bad of ['javascript:', 'onclick', 'evil.example', 'srcset', '<video']) expect(article.innerHTML).not.toContain(bad);
    const forged = [...article.querySelectorAll('[data-kind="external"]')].filter((a) => a.textContent?.includes('forged'));
    expect(forged).toHaveLength(0);
    expect(render('README.md').article.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it('names each task-list checkbox after its item, so a screen reader can read it', () => {
    const boxes = [...render('README.md').article.querySelectorAll('li > input[type="checkbox"]')];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toContain('Review the security guide (October)');
  });

  it('names task-list checkboxes in a loose list, and keeps nested items out of the label', () => {
    const { article } = renderDocument('- [ ] first item\n\n- [x] second item\n\n  - [ ] nested item\n', { collectionId: 's', path: 'a.md', files: [], assetUrl: () => '' });
    const labels = [...article.querySelectorAll('input[type="checkbox"]')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['first item', 'second item', 'nested item']);
  });

  it('labels code fences by own names only', () => {
    const { article } = renderDocument('```constructor\nx\n```', { collectionId: 's', path: 'a.md', files: [], assetUrl: () => '' });
    expect(article.querySelector('.code-head')?.textContent).toBe('CONSTRUCTOR');
  });

  it('offers to review an internet picture, or points to the setting that blocks it', () => {
    const ask = render('Guides/Introduction.md').article.querySelector<HTMLElement>('figure.remote-img')!;
    expect(ask.querySelector('button[data-act="remote-img"]')?.textContent).toBe('Review and show picture…');
    expect(ask.querySelector('svg use')?.getAttribute('href')).toBe('#i-image');
    const text = readFileSync(root + 'Guides/Introduction.md', 'utf8');
    const blocked = renderDocument(text, { collectionId: 'sample', path: 'Guides/Introduction.md', files, assetUrl: (c, p) => `${c}/${p}`, remoteImages: 'block' });
    const fig = blocked.article.querySelector<HTMLElement>('figure.remote-img')!;
    expect(fig.querySelector('button')?.textContent).toBe('Change privacy settings');
    expect(fig.textContent).toContain('Your privacy settings block pictures from the internet.');
  });

  it('removes a data-act a document tries to set itself', () => {
    const { article } = renderDocument('<p data-act="remote-img">x</p>', { collectionId: 'c', path: 'a.md', files: [], assetUrl: (c, p) => p });
    expect(article.querySelector('[data-act]')).toBeNull();
  });
});
