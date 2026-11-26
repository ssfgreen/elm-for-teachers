/**
 * The files a TRAILS resource links to (slides, worksheets, guides, zips of them), each read into
 * a markdown document under `files/<resource>/`. They carry their resource's subject, level and
 * topics, so a filter on a level finds the lesson's slides as well as its page.
 */
import { writeFrontmatter } from '../../core/frontmatter.js';
import { fileParts } from '../files/convert.js';
import { slugify } from '../html.js';
import type { OutputDoc } from '../types.js';
import type { ResourceMeta } from './resource.js';

/** What a file's source carries from its resource (SourceRef `data`). */
export interface FileOf {
  kind: 'file';
  /** The link's text on the resource page. */
  text: string;
  resource: { id: number; slug: string; link: string; title: string; areas: string[]; levels: string[]; topics: string[] };
}

/** The folder a resource's files go in, under `docs/`. */
export const filesFolder = (resourceSlug: string) => `files/${slugify(resourceSlug) || 'resource'}`;

const baseName = (path: string) => decodeURIComponent(path.split('/').pop() ?? path).replace(/\.[a-z0-9]+$/i, '');
/** A file name as a title: `AI-01-My-Thinking-vs-AIs-Thinking` becomes `AI 01 My Thinking vs AIs Thinking`. */
const titleOf = (name: string) => baseName(name).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function fileDocs(url: string, of: FileOf, body: Uint8Array, meta: ResourceMeta): Promise<OutputDoc[]> {
  const download = baseName(new URL(url).pathname);
  const isZip = /\.zip$/i.test(new URL(url).pathname);
  const parts = await fileParts(new URL(url).pathname, body);
  const folder = filesFolder(of.resource.slug);
  return parts.map((part) => {
    const title = isZip ? titleOf(part.name) : of.text && !/^download$/i.test(of.text) ? of.text : titleOf(part.name);
    // A zip often holds one folder named like itself: that folder is left out of the path.
    const segments = part.name.replace(/\.[a-z0-9]+$/i, '').split('/').map(slugify).filter(Boolean);
    if (segments.length > 1 && segments[0] === slugify(download)) segments.shift();
    // The format is in the name: a lesson often offers the same file as Word and as PDF.
    const path = isZip ? `${folder}/${slugify(download)}/${segments.join('/') || 'file'}.${part.format}.md` : `${folder}/${slugify(download) || 'file'}.${part.format}.md`;
    const frontmatter = {
      title,
      source_url: url,
      ...(isZip ? { in_zip: part.name } : {}),
      resource: of.resource.title,
      resource_url: of.resource.link,
      licence: meta.licence,
      fetched_at: meta.fetchedOn,
      content_hash: meta.sha256,
      type: 'lesson-file',
      format: part.format,
      subject: of.resource.areas,
      level: of.resource.levels,
      topics: of.resource.topics,
      trails_id: of.resource.id,
    };
    const heading = `# ${title}\n\nFrom the TRAILS resource [${of.resource.title}](${of.resource.link}) (${part.format.toUpperCase()}${isZip ? `, in ${download}.zip` : ''}).`;
    return { path, content: writeFrontmatter(frontmatter, `${heading}\n\n${part.markdown}`) };
  });
}
