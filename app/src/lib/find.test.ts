import { describe, expect, it } from 'vitest';
import { clearMarks, firstMatchAfter, markMatches } from './find';

function article(html: string): HTMLElement {
  const el = document.createElement('article');
  el.innerHTML = html;
  return el;
}

describe('find in document', () => {
  it('marks every match and leaves buttons, diagrams and hidden text alone', () => {
    const a = article('<h2 data-slug="wifi">Wi-Fi</h2><p>The wi-fi is free. WI-FI again.</p><button>wi-fi</button><div class="diagram">wi-fi</div><span class="vh">wi-fi</span>');
    const marks = markMatches(a, 'wi-fi', false);
    expect(marks.map((m) => m.textContent)).toEqual(['Wi-Fi', 'wi-fi', 'WI-FI']);
    expect(a.querySelector('button')!.innerHTML).toBe('wi-fi');
  });

  it('falls back to single words when the phrase is not there', () => {
    expect(markMatches(article('<p>guest network and the printer</p>'), 'printer guest', false).map((m) => m.textContent)).toEqual(['guest', 'printer']);
  });

  it('clears its marks and restores the text exactly', () => {
    const a = article('<p>one two one</p>');
    markMatches(a, 'one', false);
    clearMarks(a);
    expect(a.innerHTML).toBe('<p>one two one</p>');
    expect(a.querySelector('p')!.childNodes).toHaveLength(1);
  });

  it('starts at the first match after the section heading', () => {
    const a = article('<p>lamp</p><a data-slug="setup">lamp link</a><h2 data-slug="setup">Setup</h2><p>lamp here</p>');
    const marks = markMatches(a, 'lamp', false);
    expect(firstMatchAfter(marks, a, 'setup')).toBe(2);
    expect(firstMatchAfter(marks, a, 'missing')).toBe(0);
    expect(firstMatchAfter(marks, a, null)).toBe(0);
  });
});
