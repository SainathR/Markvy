export type NameProblem = 'Empty' | 'Invalid' | 'Reserved' | 'Taken' | 'TooLong' | 'WrongType';
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DOC = /\.(md|markdown|txt)$/i;

export function nameProblem(name: string, siblings: string[], opts: { document?: boolean; except?: string } = {}): NameProblem | null {
  if (!name.trim()) return 'Empty';
  if (new TextEncoder().encode(name).length > 255) return 'TooLong';
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || name.startsWith('.')) return 'Invalid';
  if (RESERVED.test(name.split('.')[0])) return 'Reserved';
  if (opts.document && !DOC.test(name)) return 'WrongType';
  if (siblings.some((s) => s.toLowerCase() === name.toLowerCase() && s !== opts.except)) return 'Taken';
  return null;
}

export function suggestFileName(title: string, siblings: string[]): string {
  const stems = siblings.filter((s) => DOC.test(s)).map((s) => s.replace(DOC, ''));
  const score = (re: RegExp) => stems.filter((s) => re.test(s)).length;
  const sep = [['-', score(/-/)], ['_', score(/_/)], [' ', score(/ /)]].reduce((x, y) => ((y[1] as number) > (x[1] as number) ? y : x))[0] as string;
  const words = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const stem = words.join(stems.length ? sep : '-').replace(/[. ]+$/, '') || 'Untitled';
  return `${stem}.md`;
}

export function copyName(name: string, siblings: string[]): string {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const lower = new Set(siblings.map((s) => s.toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = `${stem} (my copy${n > 1 ? ` ${n}` : ''})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
