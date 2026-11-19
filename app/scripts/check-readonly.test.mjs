import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findNetwork, findWrites } from './check-readonly.mjs';

describe('read-only check', () => {
  it('flags write calls in core modules', () => {
    const hits = findWrites('reader.rs', 'fn x() {\n    std::fs::write(p, b)?;\n}\n');
    expect(hits).toEqual(['reader.rs:2: std::fs::write(p, b)?;']);
  });

  it('flags OpenOptions, File::create, rename and remove', () => {
    const src = 'OpenOptions::new()\nFile::create(p)\nfs::rename(a, b)\nfs::remove_file(p)';
    expect(findWrites('paths.rs', src)).toHaveLength(4);
  });

  it('allows the library store and the log', () => {
    expect(findWrites('library.rs', 'fs::write(&temp, bytes)?;')).toEqual([]);
    expect(findWrites('src/log.rs', 'OpenOptions::new().append(true)')).toEqual([]);
  });

  it('ignores test modules', () => {
    const src = 'fn read() {}\n#[cfg(test)]\nmod tests { fn f() { fs::write(p, b).unwrap(); } }';
    expect(findWrites('reader.rs', src)).toEqual([]);
  });

  it('flags production code after a test-gated use or fn', () => {
    const hits = findWrites('reader.rs', '#[cfg(test)]\nuse std::fs;\nfn prod() { std::fs::write(p, b); }');
    expect(hits).toEqual(['reader.rs:3: fn prod() { std::fs::write(p, b); }']);
  });

  it('strips only the test module in the middle of a file', () => {
    const src = '#[cfg(test)]\nmod t { fn f() { fs::write(a, b); } }\nfn p() { fs::write(p, b); }';
    const hits = findWrites('reader.rs', src);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^reader\.rs:3: /);
  });

  it('flags a grouped std::fs import of a mutator', () => {
    expect(findWrites('reader.rs', 'use std::fs::{self, write};\nfn f() { write(p, b); }').length).toBeGreaterThanOrEqual(1);
  });

  it('flags File::options and File::create_new', () => {
    expect(findWrites('reader.rs', 'std::fs::File::options().write(true).open(p)').length).toBeGreaterThanOrEqual(1);
    expect(findWrites('reader.rs', 'File::create_new(p)').length).toBeGreaterThanOrEqual(1);
  });

  it('ignores write calls mentioned in comments', () => {
    expect(findWrites('reader.rs', 'fn f() {}\n// std::fs::write(p, b) is banned here')).toEqual([]);
  });

  it('flags network code outside net.rs, and allows it in net.rs', () => {
    expect(findNetwork('commands.rs', 'let r = ureq::get(url).call();')).toEqual(['commands.rs:1: let r = ureq::get(url).call();']);
    expect(findNetwork('src/net.rs', 'let a = ureq::AgentBuilder::new();')).toEqual([]);
    expect(findNetwork('reader.rs', '#[cfg(test)]\nmod t { use std::net::TcpStream; }')).toEqual([]);
    expect(findNetwork('reader.rs', 'let l = TcpListener::bind(a);')).toEqual(['reader.rs:1: let l = TcpListener::bind(a);']);
  });

  it('lets edit.rs write and nothing new besides', () => {
    expect(findWrites('edit.rs', 'fs::rename(&temp, target)?;')).toEqual([]);
    expect(findWrites('reader.rs', 'fs::rename(&a, b)?;').length).toBe(1);
  });

  it('passes on the real Rust core via the CLI', () => {
    const cli = resolve('scripts', 'check-readonly.mjs'); // vitest runs from app/
    const r = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
