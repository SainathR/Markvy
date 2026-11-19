import { describe, expect, it } from 'vitest';
import { inboundLinks, planRename } from './linkedit';

const docs = new Map([
  ['Old Page.md', '# Old\n\nSelf [[Old Page#Intro]].\n'],
  ['Guides/A.md', 'See [[Old Page]], [[old page|label]] and [x](../Old%20Page.md#part).\n\n`[[Old Page]]` in code\n\n```\n[[Old Page]]\n```\n'],
  ['B.md', 'Nothing here. [[Other]]\n'],
  ['Team/C.md', '[up](../Team/D.md) [[D]]\n'],
  ['Team/D.md', '# D\n'],
]);

describe('planRename', () => {
  it('updates every link form outside code and nothing else', () => {
    const plan = planRename(docs, 'Old Page.md', 'New-Page.md');
    const a = plan.find((p) => p.path === 'Guides/A.md')!;
    expect(a.count).toBe(3);
    expect(a.text).toBe('See [[New-Page]], [[New-Page|label]] and [x](../New-Page.md#part).\n\n`[[Old Page]]` in code\n\n```\n[[Old Page]]\n```\n');
    expect(plan.find((p) => p.path === 'Old Page.md')!.text).toBe('# Old\n\nSelf [[New-Page#Intro]].\n');
    expect(plan.some((p) => p.path === 'B.md')).toBe(false);
  });
  it('rename inside a renamed folder keeps relative links working', () => {
    const plan = planRename(docs, 'Team', 'Crew');
    const c = plan.find((p) => p.path === 'Team/C.md')!;
    expect(c.text).toBe('[up](D.md) [[D]]\n');
    expect(c.count).toBe(1);
  });
});

describe('planRename link forms', () => {
  const forms = new Map([
    ['Old Page.md', '# Old\n'],
    ['Team/D.md', '# D\n'],
    ['P.md', '[c](<Old Page.md>) [d](Old%20Page.md \'t\') [e](Old%20Page.md (t)) [f](<Old Page.md> "t")\n\n[ref]: <Old Page.md>\n[ref2]: Old%20Page.md\n\n[[Team/D]] [[Team/D.md|x]]\n'],
    ['Page (my copy).md', '# copy\n'],
    ['Q.md', '[g](Page%20(my%20copy).md) [h](<Page (my copy).md>)\n'],
  ]);
  it('rewrites each form, encoding bare destinations with spaces', () => {
    const p = planRename(forms, 'Old Page.md', 'New Page.md').find((x) => x.path === 'P.md')!;
    expect(p.text).toBe('[c](<New Page.md>) [d](New%20Page.md \'t\') [e](New%20Page.md (t)) [f](<New Page.md> "t")\n\n[ref]: <New Page.md>\n[ref2]: New%20Page.md\n\n[[Team/D]] [[Team/D.md|x]]\n');
    expect(p.count).toBe(6);
  });
  it('encodes a new name with spaces', () => {
    const d = new Map([['Old-Page.md', '# O\n'], ['B.md', '[b](Old-Page.md)\n']]);
    expect(planRename(d, 'Old-Page.md', 'New Page.md').find((x) => x.path === 'B.md')!.text).toBe('[b](New%20Page.md)\n');
  });
  it('rewrites path-qualified wiki links when a folder is renamed and counts only changes', () => {
    const p = planRename(forms, 'Team', 'Crew').find((x) => x.path === 'P.md')!;
    expect(p.text).toContain('[[Crew/D]] [[Crew/D.md|x]]');
    expect(p.count).toBe(2);
  });
  it('handles balanced parentheses in destinations', () => {
    const q = planRename(forms, 'Page (my copy).md', 'Plain.md').find((x) => x.path === 'Q.md')!;
    expect(q.text).toBe('[g](Plain.md) [h](<Plain.md>)\n');
    expect(inboundLinks(forms, ['Page (my copy).md'])).toEqual([{ path: 'Q.md', count: 2 }]);
  });
  it('counts every form as inbound', () => {
    expect(inboundLinks(forms, ['Old Page.md'])).toEqual([{ path: 'P.md', count: 6 }]);
  });
});

describe('inboundLinks', () => {
  it('counts links that would break', () => {
    expect(inboundLinks(docs, ['Old Page.md'])).toEqual([{ path: 'Guides/A.md', count: 3 }]);
  });
});
