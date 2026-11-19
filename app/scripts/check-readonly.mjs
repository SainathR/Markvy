// Fails the build if file-writing code appears outside library.rs, log.rs and edit.rs (spec §6, amendment A16).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRITE_PATTERNS = [
  /\bfs::write\b/, /\bFile::create\b/, /\bFile::options\b/, /\bcreate_new\b/, /\bOpenOptions\b/,
  /\bfs::rename\b/, /\bfs::remove_(file|dir|dir_all)\b/, /\bfs::create_dir(_all)?\b/, /\bfs::copy\b/,
  /\bhard_link\b/, /\bsymlink\b/, /\bset_permissions\b/, /\bset_len\b/,
  /\buse\s+std::fs::\{[^}]*\b(write|rename|remove_file|remove_dir|remove_dir_all|create_dir|create_dir_all|copy|hard_link|set_permissions)\b/,
];
export const ALLOWED_FILES = new Set(['library.rs', 'src/library.rs', 'log.rs', 'src/log.rs', 'edit.rs', 'src/edit.rs']);
export const NETWORK_PATTERNS = [/\bureq\b/, /\breqwest\b/, /\bhyper\b/, /\bTcpStream\b/, /\bTcpListener\b/, /\bUdpSocket\b/];
export const NETWORK_FILES = new Set(['net.rs', 'src/net.rs']);

const TEST_MOD = /#\[cfg\(test\)\]\s*mod\s+\w+\s*\{/g;

// Blanks each `#[cfg(test)] mod name { ... }` block, keeping its newlines so line numbers hold.
// ponytail: brace counter ignores braces inside string literals, upgrade to a real parser if that bites.
function stripTestModules(source) {
  let out = '';
  let last = 0;
  for (const m of source.matchAll(TEST_MOD)) {
    if (m.index < last) continue;
    let depth = 0;
    let i = m.index + m[0].length - 1; // the opening brace
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) break;
    }
    out += source.slice(last, m.index) + source.slice(m.index, i + 1).replace(/[^\n]/g, '');
    last = i + 1;
  }
  return out + source.slice(last);
}

function scan(fileName, source, patterns) {
  const code = stripTestModules(source.replace(/\/\/.*$/gm, '')); // drop // comments first
  const lines = code.split('\n');
  const hits = new Map(); // line number -> text, one hit per line
  for (const p of patterns) {
    for (const m of code.matchAll(new RegExp(p.source, 'gm'))) {
      const n = code.slice(0, m.index).split('\n').length;
      if (!hits.has(n)) hits.set(n, lines[n - 1].trim());
    }
  }
  return [...hits].sort((a, b) => a[0] - b[0]).map(([n, text]) => `${fileName}:${n}: ${text}`);
}

export function findWrites(fileName, source) {
  return ALLOWED_FILES.has(fileName) ? [] : scan(fileName, source, WRITE_PATTERNS);
}

export function findNetwork(fileName, source) {
  return NETWORK_FILES.has(fileName) ? [] : scan(fileName, source, NETWORK_PATTERNS);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const crate = fileURLToPath(new URL('../src-tauri/', import.meta.url));
  const rsFiles = readdirSync(join(crate, 'src'), { recursive: true })
    .map((f) => `src/${f.split(/[\\/]/).join('/')}`)
    .filter((f) => f.endsWith('.rs'));
  if (rsFiles.length === 0) {
    console.error('No .rs files found under src-tauri/src. Check the path.');
    process.exit(1);
  }
  const files = existsSync(join(crate, 'build.rs')) ? [...rsFiles, 'build.rs'] : rsFiles;
  const sources = files.map((f) => [f, readFileSync(join(crate, f), 'utf8')]);
  const hits = sources.flatMap(([f, src]) => findWrites(f, src));
  if (hits.length) {
    console.error('Write calls found outside library.rs and log.rs. Markvy must stay read-only:\n' + hits.join('\n'));
    process.exit(1);
  }
  const netHits = sources.flatMap(([f, src]) => findNetwork(f, src));
  if (netHits.length) {
    console.error('Network code found outside net.rs. Only net.rs may use the network:\n' + netHits.join('\n'));
    process.exit(1);
  }
  console.log('Read-only check passed.');
}
