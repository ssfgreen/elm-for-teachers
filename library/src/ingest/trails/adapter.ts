import { decodeEntities } from '../html.js';
import type { Fetcher } from '../fetcher.js';
import type { Adapter, FetchedSource, SourceRef } from '../types.js';
import { fileDocs, type FileOf } from './files.js';
import { linkedFiles } from './markdown.js';
import { levelName, resourceDoc, type TrailsResource } from './resource.js';

const API = 'https://trails.scot/wp-json/wp/v2';
export const TRAILS_HOSTS = ['trails.scot', 'www.trails.scot'];
const MAX_PAGES = 20;
/** Files read into the library; images and videos stay links. */
const READABLE_LINK = /\.(docx|pptx|pdf|zip)$/i;
const LICENCE = 'All rights reserved';
const FIELDS = 'id,slug,link,modified_gmt,title,content,excerpt,curriculum_area,curriculum_level,topics_and_themes';

interface RawResource {
  id: number;
  slug: string;
  link: string;
  modified_gmt: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  curriculum_area: number[];
  curriculum_level: number[];
  topics_and_themes: number[];
}

/** Every item of a WordPress REST listing, following its page count. */
async function allPages<T>(fetcher: Fetcher, url: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetcher.get(`${url}&page=${page}`);
    if (res.status !== 200 || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    out.push(...(JSON.parse(new TextDecoder().decode(res.body)) as T[]));
    if (page >= Number(res.headers.get('x-wp-totalpages') ?? 1)) break;
  }
  return out;
}

async function taxonomy(fetcher: Fetcher, name: string): Promise<Map<number, string>> {
  const terms = await allPages<{ id: number; name: string }>(fetcher, `${API}/${name}?per_page=100&_fields=id,name`);
  return new Map(terms.map((t) => [t.id, decodeEntities(t.name)]));
}

export const trails: Adapter = {
  meta: {
    id: 'trails',
    name: 'TRAILS: Teaching Responsible AI Literacy in Schools',
    publisher: 'Data Education in Schools, University of Edinburgh',
    description:
      'Lessons, activities and guidance for teaching AI literacy in Scottish schools, from trails.scot, with curriculum area, level and topics, and the text of their slides, worksheets and guides (Word, PowerPoint, PDF, and those in zips) under files/.',
    licence: LICENCE,
    licence_url: null,
    licence_note:
      'The site footer reads "© Data Education in Schools All Rights Reserved." Used in this library with the publisher\'s agreement (Sam Green, whose team publishes it, 8 Nov 2026). Ask before reusing it elsewhere.',
    homepage: 'https://trails.scot/',
    sources: [{ url: `${API}/resource`, description: 'The WordPress REST API: every resource, with its taxonomies.' }],
  },
  async discover(fetcher: Fetcher): Promise<SourceRef[]> {
    const areas = await taxonomy(fetcher, 'curriculum_area');
    const levels = await taxonomy(fetcher, 'curriculum_level');
    const topics = await taxonomy(fetcher, 'topics_and_themes');
    const raw = await allPages<RawResource>(fetcher, `${API}/resource?per_page=100&_fields=${FIELDS}`);
    const names = (ids: number[], map: Map<number, string>) => ids.map((id) => map.get(id) ?? `#${id}`);
    return raw.flatMap((r) => {
      const resource: TrailsResource = {
        id: r.id,
        slug: r.slug,
        link: r.link,
        modified_gmt: r.modified_gmt,
        title: r.title.rendered,
        content: r.content.rendered,
        excerpt: r.excerpt.rendered,
        areas: names(r.curriculum_area, areas),
        levels: names(r.curriculum_level, levels).map(levelName),
        topics: names(r.topics_and_themes, topics),
      };
      const page: SourceRef = { url: r.link, inline: { body: JSON.stringify(resource), lastModified: r.modified_gmt } };
      // Each file the page links to on trails.scot is a source of its own, so a changed slide deck is noticed alone.
      const of = { id: r.id, slug: r.slug, link: r.link, title: decodeEntities(r.title.rendered), areas: resource.areas, levels: resource.levels, topics: resource.topics };
      const files: SourceRef[] = linkedFiles(r.content.rendered)
        .filter((f) => TRAILS_HOSTS.includes(new URL(f.url).hostname) && READABLE_LINK.test(new URL(f.url).pathname))
        .map((f) => ({ url: f.url, data: { ...({ kind: 'file', text: f.text, resource: of } satisfies FileOf) } }));
      return [page, ...files];
    });
  },
  async convert(source: FetchedSource) {
    if (source.ref.data?.kind === 'file') return fileDocs(source.ref.url, source.ref.data as unknown as FileOf, source.body, { licence: LICENCE, fetchedOn: source.fetchedOn, sha256: source.sha256 });
    const resource = JSON.parse(new TextDecoder().decode(source.body)) as TrailsResource;
    return [resourceDoc(resource, { licence: LICENCE, fetchedOn: source.fetchedOn, sha256: source.sha256 })];
  },
};
