export interface HeadingInfo { slug: string; text: string; level: number; top: number }
export interface TocNode { slug: string; text: string; level: number; children: TocNode[] }

export function buildToc(headings: HeadingInfo[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const h of headings) {
    if (h.level < 2) continue;
    const node: TocNode = { slug: h.slug, text: h.text, level: h.level, children: [] };
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  }
  return roots;
}

export function currentSlug(headings: HeadingInfo[], scrollTop: number, clientHeight: number, scrollHeight: number, offset = 90): string | null {
  if (!headings.length) return null;
  if (scrollTop > 0 && scrollTop + clientHeight >= scrollHeight - 4) return headings[headings.length - 1].slug;
  let cur = headings[0];
  for (const h of headings) {
    if (h.top <= scrollTop + offset) cur = h;
    else break;
  }
  return cur.slug;
}

export function readingPercent(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight;
  return max <= 4 ? 100 : Math.min(100, Math.max(0, Math.round((scrollTop / max) * 100)));
}
