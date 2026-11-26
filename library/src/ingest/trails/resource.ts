import { CODE_RE } from '../../core/codes.js';
import { writeFrontmatter } from '../../core/frontmatter.js';
import { htmlToText, slugify } from '../html.js';
import { filesFolder } from './files.js';
import { htmlToMarkdown, linkedFiles } from './markdown.js';

/** The fields of a TRAILS resource the converter reads, with taxonomy ids already named. */
export interface TrailsResource {
  id: number;
  slug: string;
  link: string;
  modified_gmt: string;
  title: string;
  content: string;
  excerpt: string;
  areas: string[];
  levels: string[];
  topics: string[];
}

/**
 * TRAILS level names carry the school years (`Early (Pre 5 & P1)`); the library uses the
 * level alone: Early, First, Second, Third, Senior Phase, or For teachers.
 */
export function levelName(name: string): string {
  const bare = name.replace(/\s*\(.*\)\s*$/, '').trim();
  return /^senior/i.test(bare) ? 'Senior Phase' : /teacher/i.test(bare) ? 'For teachers' : bare;
}

export interface ResourceMeta {
  licence: string;
  fetchedOn: string;
  sha256: string;
}

/** One resource as a markdown document: what it is, its text, and the files it links to. */
export function resourceDoc(r: TrailsResource, meta: ResourceMeta): { path: string; content: string } {
  const title = htmlToText(r.title);
  const body = htmlToMarkdown(r.content);
  const files = linkedFiles(r.content);
  const codes = [...new Set([...htmlToText(r.content).matchAll(CODE_RE)].map((m) => m[0]))];
  const summary = htmlToText(r.excerpt.replace(/<a [^>]*class="more-link"[\s\S]*?<\/a>/i, ''));

  const out = [`# ${title}`, '', body];
  if (files.length > 0) {
    out.push('', '## Linked files', '', `Files on the resource page; Word, PowerPoint, PDF and zip files are read into this library under \`${filesFolder(r.slug)}/\`:`, '');
    for (const f of files) out.push(`- [${f.text}](${f.url})`);
  }
  const frontmatter = {
    title,
    source_url: r.link,
    licence: meta.licence,
    fetched_at: meta.fetchedOn,
    source_modified: r.modified_gmt.slice(0, 10),
    content_hash: meta.sha256,
    type: 'resource',
    subject: r.areas,
    level: r.levels,
    topics: r.topics,
    codes: codes.length > 0 ? codes : undefined,
    summary: summary || undefined,
    files: files.length > 0 ? files.map((f) => f.url) : undefined,
    trails_id: r.id,
  };
  return { path: `${slugify(r.slug) || String(r.id)}.md`, content: writeFrontmatter(frontmatter, out.join('\n')) };
}
