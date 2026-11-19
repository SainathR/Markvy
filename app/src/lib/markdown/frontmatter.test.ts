import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
  it('parses scalars and lists, and returns the body', () => {
    const { frontmatter, body } = splitFrontmatter('---\ntitle: "Hello"\ntags: [a, b]\n---\n# Body\n');
    expect(frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] });
    expect(body).toBe('# Body\n');
  });

  it('handles Windows line endings', () => {
    expect(splitFrontmatter('---\r\nauthor: Priya\r\n---\r\nText').frontmatter).toEqual({ author: 'Priya' });
  });

  it('leaves documents without frontmatter untouched', () => {
    expect(splitFrontmatter('# Just text')).toEqual({ frontmatter: {}, body: '# Just text' });
  });

  it('keeps text between leading horizontal rules', () => {
    const text = '---\n\n# Title\n\nintro\n\n---\nmore';
    const { frontmatter, body } = splitFrontmatter(text);
    expect(body).toBe(text);
    expect(frontmatter).toEqual({});
  });

  it('accepts an empty block', () => {
    expect(splitFrontmatter('---\n---\nBody')).toEqual({ frontmatter: {}, body: 'Body' });
  });
});
