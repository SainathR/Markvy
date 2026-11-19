export interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

/** Caches a successful load. A failed load is dropped, so the next call retries. */
export function memo(load: () => Promise<MermaidApi>): () => Promise<MermaidApi> {
  let cached: Promise<MermaidApi> | null = null;
  return () => (cached ??= load().catch((e) => { cached = null; throw e; }));
}

/** Mermaid is large; it loads only when a document actually contains a diagram. */
const loadMermaid = memo(() => import('mermaid').then((m) => m.default as unknown as MermaidApi));

let seq = 0;
const FAILED = 'This diagram couldn’t be drawn. Its description is shown instead.';

export async function drawDiagram(fig: HTMLElement, dark: boolean, load: () => Promise<MermaidApi> = loadMermaid): Promise<void> {
  const body = fig.querySelector<HTMLElement>('.diagram-body');
  if (!body) return;
  const source = fig.dataset.src ?? '';
  // A theme change can start a second draw while this one is rendering; only the last draw may touch the figure.
  const token = String(++seq);
  fig.dataset.drawId = token;
  const id = `markvy-diagram-${token}`;
  const isCurrent = () => fig.dataset.drawId === token;
  try {
    const mermaid = await load();
    if (!isCurrent()) return;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: dark ? 'dark' : 'neutral', fontFamily: 'Figtree, system-ui, sans-serif' });
    const { svg } = await mermaid.render(id, source);
    if (!isCurrent()) return;
    body.innerHTML = svg; // produced by Mermaid in strict mode, which sanitizes every label
  } catch {
    const doc = fig.ownerDocument;
    // Mermaid 11 can leave its temporary elements in document.body when a render fails.
    doc.getElementById(id)?.remove();
    doc.getElementById('d' + id)?.remove();
    if (!isCurrent()) return;
    const note = doc.createElement('p');
    note.className = 'muted small';
    note.textContent = FAILED;
    const pre = doc.createElement('pre');
    pre.textContent = source;
    body.replaceChildren(note, pre);
  }
}

/** Callers must call the previous stop() before observing again. In-flight draws are not cancelled; the newest draw wins. */
export function observeDiagrams(root: HTMLElement, dark: boolean, load: () => Promise<MermaidApi> = loadMermaid): () => void {
  const figures = [...root.querySelectorAll<HTMLElement>('figure.diagram')];
  if (!figures.length) return () => {};
  if (typeof IntersectionObserver === 'undefined') {
    for (const f of figures) void drawDiagram(f, dark, load);
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      void drawDiagram(e.target as HTMLElement, dark, load);
    }
  }, { rootMargin: '200px' });
  for (const f of figures) io.observe(f);
  return () => io.disconnect();
}
