import { describe, expect, it } from 'vitest';
import { splitBlocks } from './blocks';
import { DEFAULT_STYLE, detectStyle, stringifyOptions } from './style';

const style = (md: string) => detectStyle(splitBlocks(md).blocks);

describe('detectStyle', () => {
  it('finds the most used bullet marker', () => expect(style('* a\n* b\n\n- c\n').bullet).toBe('*'));
  it('finds emphasis and strong markers', () => {
    expect(style('Some _em_ and __strong__ text.\n')).toMatchObject({ emphasis: '_', strong: '_' });
    expect(style('Some *em* and **strong**.\n')).toMatchObject({ emphasis: '*', strong: '*' });
  });
  it('finds the code fence', () => expect(style('~~~\nx\n~~~\n').fence).toBe('~'));
  it('sees underlined headings', () => expect(style('Title\n=====\n\nText.\n\nPart\n----\n\nMore.\n').setext).toBe(true));
  it('sees hash headings', () => expect(style('# Title\n\nText.\n').setext).toBe(false));
  it('sees all-ones numbering', () => expect(style('1. a\n1. b\n1. c\n').incrementListMarker).toBe(false));
  it('sees compact tables', () => expect(style('|a|b|\n|-|-|\n|1|2|\n').tablePadding).toBe(false));
  it('falls back for what the file does not show', () => {
    expect(style('Just text.\n')).toEqual(DEFAULT_STYLE);
    expect(detectStyle(splitBlocks('x\n').blocks, { ...DEFAULT_STYLE, bullet: '+' }).bullet).toBe('+');
  });
  it('turns a style into serializer options', () => {
    expect(stringifyOptions({ ...DEFAULT_STYLE, bullet: '*', emphasis: '_' })).toMatchObject({ bullet: '*', emphasis: '_', strong: '*', fence: '`', incrementListMarker: true, tablePipeAlign: true, tableCellPadding: true });
    expect(stringifyOptions({ ...DEFAULT_STYLE, setext: true })).toMatchObject({ setext: true });
  });
});
