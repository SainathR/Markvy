import { describe, expect, it } from 'vitest';
import { cargoNames, npmProdNames, unreviewed } from './check-deps.mjs';

describe('dependency review (§6, A14)', () => {
  it('reads crate names from Cargo.lock', () => {
    const lock = '[[package]]\nname = "ureq"\nversion = "2.12.1"\n\n[[package]]\nname = "url"\nversion = "2.5.4"\n';
    expect(cargoNames(lock)).toEqual(['ureq', 'url']);
  });

  it('reads only production npm packages', () => {
    const lock = { packages: { '': {}, 'node_modules/marked': {}, 'node_modules/vitest': { dev: true }, 'node_modules/a/node_modules/b': {} } };
    expect(npmProdNames(lock)).toEqual(['b', 'marked']);
  });

  it('reports names nobody has reviewed yet', () => {
    expect(unreviewed(['marked', 'evil-telemetry'], ['marked'])).toEqual(['evil-telemetry']);
  });

  it('the committed lists are fully reviewed', async () => {
    const { check } = await import('./check-deps.mjs');
    expect(check()).toEqual({ cargo: [], npm: [] });
  });
});
