import type { RemoteImage } from './core';

export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/** The fetched picture as a data: URL (allowed by the CSP's img-src). Only picture types get one. */
export function dataUrl(img: RemoteImage): string {
  if (!img.mime.startsWith('image/')) throw new Error(`not a picture: ${img.mime}`);
  return `data:${img.mime};base64,${img.base64}`;
}

/** Replaces a picture placeholder with the picture, keeping its description as alt text and caption. */
export function showRemoteImage(fig: HTMLElement, src: string): void {
  const doc = fig.ownerDocument;
  const hadFocus = fig.contains(doc.activeElement);
  const alt = fig.dataset.alt ?? '';
  const img = doc.createElement('img');
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  fig.replaceChildren(img);
  if (alt) {
    const caption = doc.createElement('figcaption');
    caption.textContent = alt;
    fig.append(caption);
  }
  fig.classList.replace('remote-img', 'remote-shown');
  if (hadFocus) {
    fig.setAttribute('tabindex', '-1'); // the button that had focus is gone; keep the reader's place
    fig.focus();
  }
}
