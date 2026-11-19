import { describe, expect, it } from 'vitest';
import { dataUrl, hostOf, showRemoteImage } from './remote';

describe('remote pictures', () => {
  it('reads a lower-case host, or nothing for a bad address', () => {
    expect(hostOf('https://Images.Example.org/a.png')).toBe('images.example.org');
    expect(hostOf('not a url')).toBe('');
  });

  it('builds a data URL only for pictures', () => {
    expect(dataUrl({ mime: 'image/png', base64: 'AA==' })).toBe('data:image/png;base64,AA==');
    expect(() => dataUrl({ mime: 'text/html', base64: 'AA==' })).toThrow();
  });

  it('swaps the placeholder for the picture and keeps the description', () => {
    const fig = document.createElement('figure');
    fig.className = 'remote-img';
    fig.dataset.src = 'https://x.org/a.png';
    fig.dataset.alt = 'A reading room';
    fig.innerHTML = '<div class="remote-box"><button data-act="remote-img">Review</button></div>';
    showRemoteImage(fig, 'data:image/png;base64,AA==');
    expect(fig.classList.contains('remote-img')).toBe(false);
    expect(fig.classList.contains('remote-shown')).toBe(true);
    expect(fig.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
    expect(fig.querySelector('img')?.getAttribute('alt')).toBe('A reading room');
    expect(fig.querySelector('figcaption')?.textContent).toBe('A reading room');
    expect(fig.querySelector('button')).toBeNull();
    expect(fig.dataset.src).toBe('https://x.org/a.png');
  });

  it('keeps keyboard focus on the picture when the focused button goes away', () => {
    const fig = document.createElement('figure');
    fig.className = 'remote-img';
    fig.innerHTML = '<button data-act="remote-img">Review</button>';
    document.body.append(fig);
    fig.querySelector('button')!.focus();
    showRemoteImage(fig, 'data:image/png;base64,AA==');
    expect(document.activeElement).toBe(fig);
    expect(fig.getAttribute('tabindex')).toBe('-1');
    fig.remove();
  });

  it('does not take focus when it was elsewhere', () => {
    const fig = document.createElement('figure');
    fig.className = 'remote-img';
    document.body.append(fig);
    showRemoteImage(fig, 'data:image/png;base64,AA==');
    expect(document.activeElement).not.toBe(fig);
    expect(fig.hasAttribute('tabindex')).toBe(false);
    fig.remove();
  });
});
