import { describe, expect, it } from 'vitest';
import { merge3 } from './merge';

const base = '# T\n\nA\n\nB\n\nC\n';
describe('merge3', () => {
  it('combines edits to different blocks', () => {
    expect(merge3(base, '# T\n\nA2\n\nB\n\nC\n', '# T\n\nA\n\nB\n\nC2\n')).toEqual({ kind: 'clean', text: '# T\n\nA2\n\nB\n\nC2\n' });
  });
  it('combines an insertion on one side with an edit on the other', () => {
    expect(merge3(base, '# T\n\nA\n\nNew\n\nB\n\nC\n', '# T\n\nA\n\nB2\n\nC\n')).toEqual({ kind: 'clean', text: '# T\n\nA\n\nNew\n\nB2\n\nC\n' });
  });
  it('reports both versions when the same block changed', () => {
    expect(merge3(base, '# T\n\nA\n\nTheirs\n\nC\n', '# T\n\nA\n\nMine\n\nC\n')).toEqual({ kind: 'clash', clashes: [{ theirs: 'Theirs\n\n', mine: 'Mine\n\n' }] });
  });
  it('accepts identical changes on both sides', () => {
    expect(merge3(base, '# T\n\nX\n\nB\n\nC\n', '# T\n\nX\n\nB\n\nC\n').kind).toBe('clean');
  });
  it('keeps a block appended at the end apart from an edit elsewhere', () => {
    expect(merge3(base, '# T\n\nA\n\nB\n\nC\n\nD\n', '# T\n\nA\n\nB2\n\nC\n')).toEqual({ kind: 'clean', text: '# T\n\nA\n\nB2\n\nC\n\nD\n' });
    expect(merge3(base, '# T\n\nA\n\nB\n\nC\n\nD\n', '# T\n\nA\n\nB\n\nC2\n')).toEqual({ kind: 'clean', text: '# T\n\nA\n\nB\n\nC2\n\nD\n' });
  });
  it('combines an insertion on my side with an edit on theirs', () => {
    expect(merge3(base, '# T\n\nA\n\nB2\n\nC\n', '# T\n\nA\n\nNew\n\nB\n\nC\n')).toEqual({ kind: 'clean', text: '# T\n\nA\n\nNew\n\nB2\n\nC\n' });
  });
  it('clashes when both sides insert different blocks at the same spot', () => {
    expect(merge3(base, '# T\n\nA\n\nX\n\nB\n\nC\n', '# T\n\nA\n\nY\n\nB\n\nC\n').kind).toBe('clash');
  });

  it('combines edits to different blocks when no block is untouched', () => {
    expect(merge3('A\n\nB\n', 'A2\n\nB\n', 'A\n\nB2\n')).toEqual({ kind: 'clean', text: 'A2\n\nB2\n' });
    expect(merge3('A\n\nB\n\nC\n', 'A2\n\nB\n\nC\n', 'A\n\nB2\n\nC2\n')).toEqual({ kind: 'clean', text: 'A2\n\nB2\n\nC2\n' });
  });

  it('lists only the position both sides edited', () => {
    expect(merge3('A\n\nB\n', 'A2\n\nB1\n', 'A\n\nB2\n')).toEqual({ kind: 'clash', clashes: [{ theirs: 'B1\n', mine: 'B2\n' }] });
  });
});
