import { describe, expect, it } from 'vitest';
import { classifyLink, fileIndex, resolvePath, resolveWiki } from './links';

const paths = ['README.md', 'Getting-Started.md', 'Guides/Security.md', 'My Notes.md', 'Docs/README.md', 'Images/a.svg'];
const files = fileIndex(paths);

describe('resolvePath', () => {
  it('resolves relative to the current document', () => {
    expect(resolvePath('Guides/Security.md', '../Images/a.svg')).toBe('Images/a.svg');
    expect(resolvePath('Guides/Security.md', 'Troubleshooting.md')).toBe('Guides/Troubleshooting.md');
    expect(resolvePath('Guides/Security.md', '/README.md')).toBe('README.md');
  });
});

describe('classifyLink', () => {
  it('recognises website, email and in-page links', () => {
    expect(classifyLink('https://example.org', 'README.md', files)).toEqual({ kind: 'external', url: 'https://example.org' });
    expect(classifyLink('mailto:desk@example.org', 'README.md', files).kind).toBe('external');
    expect(classifyLink('#remote-images', 'README.md', files)).toEqual({ kind: 'anchor', slug: 'remote-images' });
  });

  it('opens pages linked Windows-style, in another case, encoded, or without an extension', () => {
    expect(classifyLink('Guides\\Security.md', 'README.md', files)).toEqual({ kind: 'internal', path: 'Guides/Security.md', slug: '' });
    expect(classifyLink('guides/security.md#passwords', 'README.md', files)).toEqual({ kind: 'internal', path: 'Guides/Security.md', slug: 'passwords' });
    expect(classifyLink('guides/security.md#Passwords', 'README.md', files)).toEqual({ kind: 'internal', path: 'Guides/Security.md', slug: 'passwords' });
    expect(classifyLink('#Remote-Images', 'README.md', files)).toEqual({ kind: 'anchor', slug: 'remote-images' });
    expect(classifyLink('My%20Notes.md', 'README.md', files)).toEqual({ kind: 'internal', path: 'My Notes.md', slug: '' });
    expect(classifyLink('Getting-Started', 'README.md', files)).toEqual({ kind: 'internal', path: 'Getting-Started.md', slug: '' });
    expect(classifyLink('Docs/', 'README.md', files)).toEqual({ kind: 'internal', path: 'Docs/README.md', slug: '' });
  });

  it('marks missing pages and refuses other link types', () => {
    expect(classifyLink('Network-Setup.md', 'Guides/Security.md', files)).toEqual({ kind: 'broken', target: 'Network-Setup.md' });
    expect(classifyLink('file:///C:/secret.md', 'README.md', files)).toEqual({ kind: 'refused', url: 'file:///C:/secret.md' });
    expect(classifyLink('%E0%A4%A', 'README.md', files).kind).toBe('broken');
    expect(classifyLink('Images/a.svg', 'README.md', files)).toEqual({ kind: 'broken', target: 'Images/a.svg' });
  });
});

describe('resolveWiki', () => {
  it('matches file names loosely', () => {
    expect(resolveWiki('getting started', paths)).toBe('Getting-Started.md');
    expect(resolveWiki('Security', paths)).toBe('Guides/Security.md');
    expect(resolveWiki('Printer Manual', paths)).toBeNull();
  });
});
