import { describe, expect, it } from 'vitest';
import { copyName, nameProblem, suggestFileName } from './names';

describe('names', () => {
  it('suggests names in the folder’s style', () => {
    expect(suggestFileName('Payment Rules', ['00-Module-Overview.md', 'Data-Model.md'])).toBe('Payment-Rules.md');
    expect(suggestFileName('Payment Rules', ['my notes.md', 'other page.md'])).toBe('Payment Rules.md');
    expect(suggestFileName('Payment Rules', ['a_b.md', 'c_d.md'])).toBe('Payment_Rules.md');
    expect(suggestFileName('What? Why: How', [])).toBe('What-Why-How.md');
  });
  it('mirrors the core’s rules', () => {
    expect(nameProblem('', [])).toBe('Empty');
    expect(nameProblem('a:b.md', [])).toBe('Invalid');
    expect(nameProblem('con.md', [])).toBe('Reserved');
    expect(nameProblem('README.md', ['readme.md'])).toBe('Taken');
    expect(nameProblem('README.md', ['readme.md'], { except: 'readme.md' })).toBeNull();
    expect(nameProblem('x.pdf', [], { document: true })).toBe('WrongType');
  });
  it('numbers copies', () => {
    expect(copyName('Page.md', ['Page.md'])).toBe('Page (my copy).md');
    expect(copyName('Page.md', ['Page.md', 'Page (my copy).md'])).toBe('Page (my copy 2).md');
  });
});
