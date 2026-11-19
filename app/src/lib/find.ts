import { matcher } from './search';

// Text the reader doesn't read as prose: drawn diagrams, formulas, controls and screen-reader-only notes.
const SKIP = 'svg, math, .katex, .diagram, .remote-img, button, .vh, .doc-meta';

/** Removes find highlights, leaving the text as it was. */
export function clearMarks(root: HTMLElement): void {
  for (const mark of [...root.querySelectorAll('mark.hit')]) {
    const parent = mark.parentNode!;
    parent.replaceChild(root.ownerDocument.createTextNode(mark.textContent ?? ''), mark);
    parent.normalize();
  }
}

function markText(root: HTMLElement, re: RegExp): HTMLElement[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) || !n.nodeValue?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const marks: HTMLElement[] = [];
  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const found = [...text.matchAll(re)];
    if (!found.length) continue;
    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const m of found) {
      frag.append(text.slice(last, m.index));
      const mark = doc.createElement('mark');
      mark.className = 'hit';
      mark.textContent = m[0];
      frag.append(mark);
      marks.push(mark);
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  return marks;
}

/** Highlights a query in the document: the whole phrase, or failing that each word. */
export function markMatches(root: HTMLElement, q: string, wholeWords: boolean): HTMLElement[] {
  clearMarks(root);
  for (const words of [false, true]) {
    const re = matcher(q, wholeWords, words);
    const marks = re ? markText(root, re) : [];
    if (marks.length) return marks;
  }
  return [];
}

/** The first match after the heading `slug`, so a search result opens at the section it came from. */
export function firstMatchAfter(marks: HTMLElement[], root: HTMLElement, slug: string | null): number {
  const heading = slug ? [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')].find((h) => h.dataset.slug === slug) : undefined;
  if (!heading) return 0;
  return Math.max(0, marks.findIndex((m) => heading.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING));
}
