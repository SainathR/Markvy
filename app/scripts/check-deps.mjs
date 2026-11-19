// Every new dependency needs a person to check it makes no network calls (spec §6, amendment A14).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const LIST = here('./reviewed-deps.json');

export const cargoNames = (text) => [...new Set([...text.matchAll(/^\[\[package\]\]\r?\nname = "([^"]+)"/gm)].map((m) => m[1]))].sort();

export const npmProdNames = (lock) =>
  [...new Set(Object.entries(lock.packages ?? {})
    .filter(([key, meta]) => key && !meta.dev)
    .map(([key]) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)))].sort();

export const unreviewed = (names, reviewed) => names.filter((n) => !reviewed.includes(n));

function current() {
  return {
    cargo: cargoNames(readFileSync(here('../src-tauri/Cargo.lock'), 'utf8')),
    npm: npmProdNames(JSON.parse(readFileSync(here('../package-lock.json'), 'utf8'))),
  };
}

export function check() {
  const now = current();
  const reviewed = JSON.parse(readFileSync(LIST, 'utf8'));
  return { cargo: unreviewed(now.cargo, reviewed.cargo), npm: unreviewed(now.npm, reviewed.npm) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--update')) {
    writeFileSync(LIST, JSON.stringify(current(), null, 2) + '\n');
    console.log('Reviewed list updated. Commit it with a note on what you checked.');
  } else {
    const missing = check();
    const all = [...missing.cargo.map((n) => `crate ${n}`), ...missing.npm.map((n) => `npm ${n}`)];
    if (all.length) {
      console.error(`New dependencies need review (does any of them use the network?):\n  ${all.join('\n  ')}\nAfter checking, run: npm run check:deps -- --update`);
      process.exit(1);
    }
    console.log('Dependency review passed.');
  }
}
