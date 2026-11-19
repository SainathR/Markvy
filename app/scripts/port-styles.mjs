// One-off: copies the approved prototype's CSS and icon sprite (index.html) into the app.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OVERRIDES = `
/* ---------- Desktop app overrides (no prototype strip; the window is the app) ---------- */
body { padding: 0; background: var(--paper); }
#app { height: 100%; }
.app { border: 0; border-radius: 0; box-shadow: none; grid-template-rows: auto minmax(0, 1fr); }
.pane > .findbar { grid-row: 4; }
.pane > .scroller { grid-row: 5; }
.pane > .statusbar { grid-row: 6; } /* with no find bar, its row is empty and takes no space */
.result h2 mark { background: var(--mark); color: var(--mark-ink); border-radius: 2px; }
main { position: relative; }
.notice { position: absolute; z-index: 15; top: .75rem; left: 50%; transform: translateX(-50%); max-width: min(40rem, 90%); display: flex; gap: .75rem; align-items: center; margin: 0; padding: .55rem .9rem; border-radius: 8px; background: var(--ink); color: var(--paper); box-shadow: var(--shadow); font-size: .875rem; }
.notice-region { position: absolute; inset: 0 0 auto 0; z-index: 15; pointer-events: none; }
.notice-region .notice { pointer-events: auto; }
.notice .link-btn { color: var(--paper); }
button[aria-disabled="true"] { cursor: default; opacity: .4; } /* stays focusable, unlike :disabled */
.btn[aria-disabled="true"]:hover { background: var(--page); }
.dlg-actions .btn { overflow-wrap: anywhere; }
.dlg-body strong { overflow-wrap: anywhere; }
`;

export function splitPrototype(raw) {
  const html = raw.replace(/\r\n/g, '\n'); // the working copy is CRLF on Windows (core.autocrlf)
  const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'));
  const resetAt = css.indexOf('*, *::before, *::after { box-sizing');
  const tokens = css.slice(0, resetAt);
  const sections = css.slice(resetAt).split(/\n(?=\/\* [^\n]*\*\/\n)/);
  const app = [];
  const doc = [];
  for (const section of sections) {
    const title = (section.match(/^\/\* (.*?) \*\//)?.[1] ?? '').replace(/-+/g, '').trim();
    if (title === 'Rendered document') doc.push(section);
    else app.push(section);
  }
  const appCss = app.join('\n').split('\n').filter((line) => !line.startsWith('.proto-')).join('\n') + OVERRIDES;
  const spriteStart = html.indexOf('<svg width="0" height="0"');
  const sprite = html.slice(spriteStart, html.indexOf('</svg>', spriteStart) + '</svg>'.length);
  return { tokens, app: appCss, doc: doc.join('\n'), sprite };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const out = splitPrototype(html);
  const write = (rel, text) => writeFileSync(new URL(rel, import.meta.url), text.trimEnd() + '\n');
  write('../src/styles/tokens.css', out.tokens);
  write('../src/styles/app.css', out.app);
  write('../src/styles/doc.css', out.doc);
  // svelte-check cannot resolve a component with no <script>, so the generated sprite carries an empty one.
  write('../src/IconSprite.svelte', `<script lang="ts"></script>\n${out.sprite}`);
  console.log('Wrote tokens.css, app.css, doc.css and IconSprite.svelte.');
}
