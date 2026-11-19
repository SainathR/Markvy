import { describe, expect, it } from 'vitest';
import { toHtml } from './parser';

describe('toHtml', () => {
  it('renders GitHub-flavored tables and task lists', () => {
    const html = toHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
  });

  it('renders wiki links with optional labels', () => {
    expect(toHtml('See [[Security]].')).toContain('<a href="#" data-wiki="Security">Security</a>');
    expect(toHtml('[[Troubleshooting#Wi-Fi|help]]')).toContain('data-wiki="Troubleshooting#Wi-Fi">help</a>');
  });

  it('marks inline and block maths without touching dollar amounts', () => {
    expect(toHtml('Area $a^2$ here.')).toContain('<span class="math" data-tex="a^2">');
    expect(toHtml('$$\nS = n \\times d\n$$\n')).toContain('class="math math-block" data-tex="S = n \\times d"');
    expect(toHtml('It costs $5 and $10.')).not.toContain('class="math"');
  });

  it('block maths does not backtrack on long whitespace', () => {
    for (const src of ['$$' + ' '.repeat(5000) + 'x', 'x $$' + ' '.repeat(5000)]) {
      const start = performance.now();
      toHtml(src);
      expect(performance.now() - start).toBeLessThan(200);
    }
  });
});
