import { enhance, type EnhanceContext } from './enhance';
import { splitFrontmatter, type Frontmatter } from './frontmatter';
import { toHtml } from './parser';
import { sanitize } from './sanitize';
import { friendlyName } from './slug';

export type { EnhanceContext } from './enhance';

export interface Rendered { article: HTMLElement; frontmatter: Frontmatter; title: string }

export function renderDocument(text: string, ctx: EnhanceContext, doc: Document = document): Rendered {
  const { frontmatter, body } = splitFrontmatter(text);
  // Parse and enhance in an inert document so nothing starts loading before enhance() has vetted it.
  const inert = doc.implementation.createHTMLDocument('');
  const article = inert.createElement('article');
  article.className = 'doc';
  article.innerHTML = sanitize(toHtml(body));
  enhance(article, ctx);
  const fmTitle = typeof frontmatter.title === 'string' ? frontmatter.title : '';
  const title = fmTitle || article.querySelector('h1')?.textContent?.trim() || friendlyName(ctx.path);
  return { article: doc.adoptNode(article), frontmatter, title };
}
