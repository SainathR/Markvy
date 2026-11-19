import { describe, expect, it } from 'vitest';
import { describeDocument } from './details';
import { renderDocument } from './markdown/render';

describe('describeDocument', () => {
  it('counts sections, links and pictures, and lists broken links once', () => {
    const text = [
      '---', 'title: Guide', 'tags: [a, b]', '---',
      '# Guide', '## One', '## Two', '[[Missing]] [[Missing]] [[Other]] [web](https://example.org)',
      '![local](pic.png) ![remote](https://example.org/x.png) ![gone](nope.png)',
    ].join('\n');
    const files = ['Guide.md', 'Other.md', 'pic.png'];
    const r = renderDocument(text, { collectionId: 'c', path: 'Guide.md', files, assetUrl: (c, p) => `markvy://localhost/${c}/${p}` });
    expect(describeDocument(r.article, text, r.frontmatter)).toEqual({
      words: text.match(/\S+/g)!.length,
      sections: 2,
      pageLinks: 1,
      webLinks: 1,
      broken: ['Missing'],
      localPictures: 2,
      remotePictures: 1,
      written: [['title', 'Guide'], ['tags', 'a, b']],
    });
  });
});
