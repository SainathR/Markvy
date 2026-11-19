export const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

export function uniqueSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  const issued = new Set<string>();
  return (text) => {
    const base = slugify(text);
    let n = seen.get(base) ?? 0;
    let slug = n ? `${base}-${n}` : base;
    while (issued.has(slug)) slug = `${base}-${++n}`;
    seen.set(base, n + 1);
    issued.add(slug);
    return slug;
  };
}

export const friendlyName = (path: string) =>
  (path.split('/').pop() ?? path).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ');
