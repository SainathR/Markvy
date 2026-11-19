import katex from 'katex';
import { classifyLink, fileIndex, resolvePath, resolveWiki, safeDecode, type LinkTarget } from './links';
import { slugify, uniqueSlugger } from './slug';

export interface EnhanceContext {
  collectionId: string;
  path: string;
  files: string[];
  assetUrl(collectionId: string, path: string): string;
  /** The reader's choice for pictures from the internet; default 'ask'. */
  remoteImages?: 'ask' | 'block';
}

const CALLOUTS: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

// Only enhance() sets these. data-wiki and data-tex come from the parser and are kept.
const OWN_DATA = ['kind', 'path', 'slug', 'url', 'target', 'src', 'alt', 'act'];

export function enhance(article: HTMLElement, ctx: EnhanceContext): void {
  clearForgedData(article);
  for (const i of article.querySelectorAll('input')) if (i.type !== 'checkbox') i.remove(); // type=image would load its src
  for (const box of article.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')) {
    // A task-list checkbox has no label of its own: name it after its own text: the <li> in a tight list, the <p> in a loose one (never a nested list's).
    const own = [...box.parentElement!.childNodes].filter((n) => !(n instanceof Element && /^(UL|OL|INPUT)$/.test(n.tagName)));
    box.setAttribute('aria-label', own.map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim());
  }
  callouts(article);
  headings(article);
  links(article, ctx);
  images(article, ctx);
  tables(article);
  codeBlocks(article);
  maths(article);
}

const HTML_NS = 'http://www.w3.org/1999/xhtml';

function clearForgedData(article: HTMLElement) {
  for (const node of article.querySelectorAll('*')) {
    for (const k of OWN_DATA) node.removeAttribute(`data-${k}`);
    // Only an HTML <a> may carry an href. WebKit follows href on MathML elements, SVG links and <area>.
    if (node.namespaceURI !== HTML_NS || node.localName !== 'a') {
      node.removeAttribute('href');
      node.removeAttribute('xlink:href');
      node.removeAttributeNS(XLINK_NS, 'href');
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(article: HTMLElement, tag: K, className = '', text = '') {
  const node = article.ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(article: HTMLElement, name: string, extra = '') {
  const doc = article.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', extra ? `i ${extra}` : 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function callouts(article: HTMLElement) {
  for (const quote of [...article.querySelectorAll('blockquote')]) {
    const p = quote.firstElementChild;
    const first = p?.tagName === 'P' ? p.firstChild : null;
    const m = first?.nodeType === Node.TEXT_NODE ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(first.textContent ?? '') : null;
    if (!p || !first || !m) continue;
    const type = m[1].toLowerCase();
    first.textContent = (first.textContent ?? '').slice(m[0].length);
    if (!p.textContent?.trim() && !p.querySelector('*')) p.remove();
    const box = el(article, 'aside', `callout callout-${type}`);
    box.setAttribute('role', 'note');
    box.append(el(article, 'p', 'callout-title', CALLOUTS[type]), ...quote.childNodes);
    quote.replaceWith(box);
  }
}

function headings(article: HTMLElement) {
  const next = uniqueSlugger();
  for (const h of article.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    h.dataset.slug = next(h.textContent ?? '');
    h.tabIndex = -1;
  }
}

function hidden(article: HTMLElement, text: string) {
  return el(article, 'span', 'vh', text);
}

function applyLink(a: HTMLAnchorElement, t: LinkTarget, article: HTMLElement) {
  a.dataset.kind = t.kind;
  a.setAttribute('href', '#');
  switch (t.kind) {
    case 'external':
      a.dataset.url = t.url;
      a.setAttribute('href', t.url);
      a.rel = 'noopener noreferrer';
      a.append(hidden(article, ' (opens in your web browser)'));
      a.append(icon(article, 'external', 'ext-i'));
      break;
    case 'anchor':
      a.dataset.slug = t.slug;
      break;
    case 'internal':
      a.dataset.path = t.path;
      a.dataset.slug = t.slug;
      break;
    case 'broken':
      a.dataset.target = t.target;
      a.classList.add('broken');
      a.title = 'This page can’t be found';
      a.append(hidden(article, ' (missing page)'));
      break;
    case 'refused':
      a.dataset.url = t.url;
      a.title = 'Markvy only opens web and email links';
      break;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function unlink(a: Element) {
  a.removeAttribute('href');
  a.removeAttributeNS(XLINK_NS, 'href');
}

function links(article: HTMLElement, ctx: EnhanceContext) {
  const index = fileIndex(ctx.files);
  for (const a of article.querySelectorAll('a')) {
    const wiki = a.dataset.wiki;
    const href = a.getAttribute('href');
    let target: LinkTarget;
    if (a.namespaceURI === SVG_NS) {
      unlink(a); // SVG links are never followed
      continue;
    }
    if (wiki) {
      const [name, section = ''] = wiki.split('#');
      const found = resolveWiki(name, ctx.files);
      target = found ? { kind: 'internal', path: found, slug: section ? slugify(section) : '' } : { kind: 'broken', target: name };
    } else if (href !== null) {
      target = classifyLink(href, ctx.path, index);
    } else {
      unlink(a); // the sanitizer removed an unsafe href; the text stays, the link does nothing
      continue;
    }
    applyLink(a, target, article);
  }
}

/** A fresh image carrying only what we vouch for, never a copy of the author's attributes. */
function cleanImg(article: HTMLElement, src: string, alt: string, title: string) {
  const img = el(article, 'img');
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  if (title) img.setAttribute('title', title);
  img.setAttribute('loading', 'lazy');
  return img;
}

function images(article: HTMLElement, ctx: EnhanceContext) {
  const index = fileIndex(ctx.files);
  for (const img of [...article.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? '';
    const alt = img.getAttribute('alt') ?? '';
    const fig = el(article, 'figure');
    if (/^https?:/i.test(src)) {
      let host = src;
      try { host = new URL(src).host; } catch { /* keep the raw address */ }
      const blocked = ctx.remoteImages === 'block';
      fig.className = 'remote-img';
      fig.dataset.src = src;
      fig.dataset.alt = alt;
      const title = el(article, 'p');
      title.append(el(article, 'strong', '', 'Picture from the internet not shown'));
      if (alt) title.append(article.ownerDocument.createElement('br'), alt);
      const where = el(article, 'p', '', `It's stored on ${host}. ${blocked ? 'Your privacy settings block pictures from the internet.' : 'Loading it would let that website know you are reading this page.'}`);
      const button = el(article, 'button', 'btn sm', blocked ? 'Change privacy settings' : 'Review and show picture…');
      button.type = 'button';
      button.dataset.act = 'remote-img';
      const text = el(article, 'div');
      text.append(title, where, button);
      const box = el(article, 'div', 'remote-box');
      box.append(icon(article, 'image'), text);
      fig.append(box);
    } else if (src.startsWith('data:image/')) {
      fig.append(cleanImg(article, src, alt, img.title));
    } else {
      const found = index.has(resolvePath(ctx.path, safeDecode(src).replace(/\\/g, '/')));
      if (found) {
        fig.append(cleanImg(article, ctx.assetUrl(ctx.collectionId, found), alt, img.title));
        if (alt) fig.append(el(article, 'figcaption', '', alt));
      } else {
        fig.className = 'missing-img';
        fig.append(el(article, 'p', '', `Picture not found: “${src}” isn't in this collection.`));
      }
    }
    const parent = img.parentElement;
    if (parent?.tagName === 'P' && parent.childNodes.length === 1) parent.replaceWith(fig);
    else img.replaceWith(fig);
  }
}

function tables(article: HTMLElement) {
  for (const table of [...article.querySelectorAll('table')]) {
    const wrap = el(article, 'div', 'table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Table');
    table.replaceWith(wrap);
    wrap.append(table);
  }
}

const CODE_LABELS: Record<string, string> = { yaml: 'Settings file (YAML)', json: 'Data (JSON)', bash: 'Command', powershell: 'Command' };

function codeBlocks(article: HTMLElement) {
  for (const code of [...article.querySelectorAll('pre > code')]) {
    const pre = code.parentElement!;
    const lang = /language-(\S+)/.exec(code.className)?.[1];
    if (lang === 'mermaid') {
      const src = code.textContent ?? '';
      const label = /^%%\s*(.+)$/m.exec(src)?.[1] ?? 'Diagram';
      const fig = el(article, 'figure', 'diagram');
      fig.dataset.src = src;
      const body = el(article, 'div', 'diagram-body');
      body.setAttribute('role', 'img');
      body.setAttribute('aria-label', label);
      body.append(pre.cloneNode(true)); // drawn by Mermaid in Plan 2; readable source until then
      fig.append(body, el(article, 'figcaption', '', label));
      pre.replaceWith(fig);
      continue;
    }
    const box = el(article, 'div', 'code-block');
    box.append(el(article, 'div', 'code-head', (lang && Object.hasOwn(CODE_LABELS, lang) ? CODE_LABELS[lang] : undefined) ?? (lang ? lang.toUpperCase() : 'Text')));
    pre.replaceWith(box);
    box.append(pre);
  }
}

function maths(article: HTMLElement) {
  for (const node of article.querySelectorAll<HTMLElement>('.math')) {
    try {
      // KaTeX's own output with trust off; MathML needs no stylesheet.
      node.innerHTML = katex.renderToString(node.dataset.tex ?? '', {
        displayMode: node.classList.contains('math-block'), output: 'mathml', throwOnError: false, trust: false,
      });
    } catch {
      node.classList.add('math-error'); // the TeX source stays visible
    }
  }
}
