import { LEVEL_NAMES, parseCode } from '../../core/codes.js';
import { writeFrontmatter } from '../../core/frontmatter.js';
import type { Fetcher } from '../fetcher.js';
import { slugify } from '../html.js';
import { extractPdfItems } from '../pdf/extract.js';
import { groupLines } from '../pdf/lines.js';
import type { Adapter, FetchedSource } from '../types.js';
import { assemble } from './document.js';
import { findEoLinks } from './links.js';
import { documentCodes, eoMarkdown } from './markdown.js';
import { readPage } from './page.js';

const PAGE = 'https://education.gov.scot/curriculum-for-excellence/experiences-and-outcomes/';
export const EO_HOSTS = ['education.gov.scot'];

/** `Sat, 01 Nov 2025 10:00:00 GMT` as `2025-11-01`. */
export function isoDay(httpDate: string | null): string | undefined {
  if (!httpDate) return undefined;
  const d = new Date(httpDate);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

async function convert(source: FetchedSource) {
  const name = String(source.ref.data?.name ?? 'Experiences and outcomes');
  const title = `${name}: experiences and outcomes`;
  const pages = (await extractPdfItems(source.body)).map((items) => readPage(groupLines(items)));
  const doc = assemble(pages);
  const codes = documentCodes(doc);
  if (codes.length === 0) throw new Error('no experiences and outcomes found in the PDF');
  const levels = new Set(codes.map((c) => parseCode(c)?.level));
  const frontmatter = {
    title,
    source_url: source.ref.url,
    licence: 'OGL-UK-3.0',
    fetched_at: source.fetchedOn,
    source_modified: isoDay(source.lastModified),
    content_hash: source.sha256,
    type: 'experiences-and-outcomes',
    subject: [name],
    level: LEVEL_NAMES.filter((_, i) => levels.has(i)),
    codes,
  };
  return [{ path: `${slugify(name)}.md`, content: writeFrontmatter(frontmatter, eoMarkdown(title, doc)) }];
}

export const educationScotlandEo: Adapter = {
  meta: {
    id: 'education-scotland-eo',
    name: 'Curriculum for Excellence: experiences and outcomes',
    publisher: 'Education Scotland',
    description:
      'The experiences and outcomes for each curriculum area, Early to Fourth level, one per line with its code (such as MNU 2-03a), under headings for area, organiser and level. English versions.',
    licence: 'OGL-UK-3.0',
    licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    homepage: PAGE,
    sources: [{ url: PAGE, description: 'The page that links a PDF for each curriculum area; the English ones are read.' }],
  },
  async discover(fetcher: Fetcher) {
    const links = findEoLinks(await fetcher.getText(PAGE), PAGE);
    if (links.length === 0) throw new Error(`no experiences and outcomes PDFs linked from ${PAGE}`);
    return links.map((l) => ({ url: l.url, data: { name: l.name } }));
  },
  convert,
};
