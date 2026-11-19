import type { Frontmatter } from './markdown/frontmatter';

export interface DocumentDetails {
  words: number;
  sections: number;
  pageLinks: number;
  webLinks: number;
  broken: string[];
  localPictures: number;
  remotePictures: number;
  /** The frontmatter, as written. */
  written: [string, string][];
}

/** What the details dialog reports about a rendered document. */
export function describeDocument(article: HTMLElement, text: string, frontmatter: Frontmatter): DocumentDetails {
  const all = (selector: string) => [...article.querySelectorAll<HTMLElement>(selector)];
  return {
    words: (text.match(/\S+/g) ?? []).length,
    sections: all('h2, h3, h4, h5, h6').length,
    pageLinks: all('a[data-kind="internal"]').length,
    webLinks: all('a[data-kind="external"]').length,
    broken: [...new Set(all('a[data-kind="broken"]').map((a) => a.dataset.target ?? ''))],
    localPictures: all('figure img, .missing-img').length,
    remotePictures: all('.remote-img').length,
    written: Object.entries(frontmatter).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]),
  };
}
