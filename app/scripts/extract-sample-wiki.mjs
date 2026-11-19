// One-off: copies the prototype's sample library out of /index.html into real files.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const outDir = new URL('../tests/fixtures/sample-wiki/', import.meta.url);
const write = (rel, body) => {
  const file = fileURLToPath(new URL(rel, outDir));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

const blocks = [...html.matchAll(/<script type="text\/markdown" data-col="sample" data-path="([^"]+)" data-modified="[^"]*">\r?\n([\s\S]*?)<\/script>/g)];
for (const [, path, body] of blocks) write(path, body.replace(/\.png\)/g, '.svg)').trimEnd() + '\n');

const TXT = 'font-family="Figtree, Segoe UI, sans-serif"';
for (const name of ['architecture', 'workflow']) {
  const m = html.match(new RegExp(`'Images/${name}\\.png': \`([\\s\\S]*?)\`,`));
  if (!m) throw new Error(`Image ${name} not found in index.html`);
  write(`Images/${name}.svg`, m[1].replaceAll('${TXT}', TXT) + '\n');
}
rmSync(new URL('.keep', outDir), { force: true });
console.log(`Wrote ${blocks.length} documents and 2 images.`);
