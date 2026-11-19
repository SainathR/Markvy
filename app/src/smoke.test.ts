import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests in a DOM environment', () => {
    expect(document.createElement('p').tagName).toBe('P');
  });
});
