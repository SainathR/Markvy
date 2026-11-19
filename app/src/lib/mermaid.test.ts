import { describe, expect, it, vi } from 'vitest';
import { drawDiagram, memo, observeDiagrams } from './mermaid';

function figure(src: string): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 'diagram';
  fig.dataset.src = src;
  fig.innerHTML = '<div class="diagram-body"><pre><code>source</code></pre></div>';
  return fig;
}

describe('mermaid', () => {
  it('draws in strict mode with the matching theme', async () => {
    const api = { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg data-test="d"></svg>' }) };
    const fig = figure('flowchart TD\nA-->B');
    await drawDiagram(fig, true, async () => api);
    expect(api.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict', theme: 'dark', suppressErrorRendering: true }));
    expect(api.render.mock.calls[0][1]).toBe('flowchart TD\nA-->B');
    expect(fig.querySelector('svg[data-test="d"]')).not.toBeNull();
  });

  it('shows the description as text when drawing fails', async () => {
    const fig = figure('<img src=x onerror=alert(1)>');
    await drawDiagram(fig, false, async () => { throw new Error('boom'); });
    expect(fig.querySelector('pre')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(fig.querySelector('img')).toBeNull();
    expect(fig.textContent).toContain('couldn’t be drawn');
  });

  it('draws every diagram when there is no IntersectionObserver', async () => {
    const root = document.createElement('div');
    root.append(figure('a'), figure('b'));
    const api = { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }) };
    observeDiagrams(root, false, async () => api);
    await vi.waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
  });

  it('keeps the newest draw when an older render resolves last', async () => {
    const fig = figure('flowchart TD\nA-->B');
    let finishFirst!: (out: { svg: string }) => void;
    const render = vi.fn()
      .mockImplementationOnce(() => new Promise<{ svg: string }>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ svg: '<svg data-test="second"></svg>' });
    const api = { initialize: vi.fn(), render };
    const first = drawDiagram(fig, false, async () => api);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    await drawDiagram(fig, true, async () => api);
    finishFirst({ svg: '<svg data-test="first"></svg>' });
    await first;
    expect(fig.querySelector('svg')!.getAttribute('data-test')).toBe('second');
  });

  it('removes Mermaid leftovers from document.body when a render fails', async () => {
    const fig = figure('flowchart TD\nA-->B');
    const render = vi.fn(async (id: string) => {
      for (const elId of [id, 'd' + id]) {
        const el = document.createElement('div');
        el.id = elId;
        document.body.append(el);
      }
      throw new Error('parse error');
    });
    await drawDiagram(fig, false, async () => ({ initialize: vi.fn(), render }));
    const id = render.mock.calls[0][0];
    expect(document.getElementById('d' + id)).toBeNull();
    expect(document.getElementById(id)).toBeNull();
  });

  it('keeps the newest draw when an older render fails last', async () => {
    const fig = figure('flowchart TD\nA-->B');
    let failFirst!: (e: Error) => void;
    const render = vi.fn()
      .mockImplementationOnce(() => new Promise<{ svg: string }>((_, reject) => { failFirst = reject; }))
      .mockResolvedValueOnce({ svg: '<svg data-test="second"></svg>' });
    const api = { initialize: vi.fn(), render };
    const first = drawDiagram(fig, false, async () => api);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    await drawDiagram(fig, true, async () => api);
    failFirst(new Error('boom'));
    await first;
    expect(fig.querySelector('svg')!.getAttribute('data-test')).toBe('second');
    expect(fig.textContent).not.toContain('couldn’t be drawn');
  });

  it('retries the load after a failed attempt', async () => {
    const api = { initialize: vi.fn(), render: vi.fn() };
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(api);
    const get = memo(load);
    await expect(get()).rejects.toThrow('offline');
    await expect(get()).resolves.toBe(api);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
