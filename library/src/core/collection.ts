import type { CurriculumData } from '../curriculum/types.js';
import { loadPedagogy } from '../pedagogy/load.js';
import { parseFrontmatter } from './frontmatter.js';
import type { Collection, CollectionMeta, LibraryDoc } from './types.js';
import { collectionVersion } from './version.js';

/**
 * Builds a collection from its files, keyed by path inside the collection folder
 * (`collection.json`, `sources.lock.json`, `docs/a/b.md`, or a pedagogy collection's
 * `pedagogy.yaml`). Pure, so tests need no disk.
 */
export function buildCollection(files: ReadonlyMap<string, string>): Collection {
  const metaText = files.get('collection.json');
  if (metaText === undefined) throw new Error('collection.json is missing');
  const meta = parseMeta(JSON.parse(metaText));

  const docs: LibraryDoc[] = [];
  for (const [path, text] of files) {
    if (!path.startsWith('docs/') || !path.endsWith('.md')) continue;
    docs.push(parseDoc(path.slice('docs/'.length), text));
  }
  docs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const fetched = docs.map((d) => d.frontmatter.fetched_at).filter((v): v is string => typeof v === 'string');
  const updatedAt = fetched.length > 0 ? fetched.sort().at(-1)! : null;
  const out: Collection = { meta, docs, version: collectionVersion(files), updatedAt };
  if (meta.kind === 'pedagogy') {
    const text = files.get('pedagogy.yaml');
    if (text === undefined) throw new Error(`${meta.id}: a pedagogy collection needs pedagogy.yaml`);
    out.pedagogy = loadPedagogy(text);
  }
  if (meta.kind === 'curriculum') {
    const text = files.get('curriculum.json');
    if (text === undefined) throw new Error(`${meta.id}: a curriculum collection needs curriculum.json`);
    out.curriculum = JSON.parse(text) as CurriculumData;
  }
  return out;
}

export function parseDoc(path: string, text: string): LibraryDoc {
  const { data, body } = parseFrontmatter(text);
  const lines = body.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const heading = lines.find((l) => l.startsWith('# '));
  const title = typeof data.title === 'string' ? data.title : heading ? heading.slice(2).trim() : path;
  return { path, title, frontmatter: data, lines };
}

function parseMeta(raw: unknown): CollectionMeta {
  if (!raw || typeof raw !== 'object') throw new Error('collection.json is not an object');
  const r = raw as Record<string, unknown>;
  const str = (k: string) => {
    if (typeof r[k] !== 'string') throw new Error(`collection.json: ${k} must be a string`);
    return r[k] as string;
  };
  return {
    id: str('id'),
    kind: r.kind === 'pedagogy' || r.kind === 'curriculum' ? r.kind : 'documents',
    name: str('name'),
    publisher: str('publisher'),
    description: str('description'),
    licence: str('licence'),
    licence_url: typeof r.licence_url === 'string' ? r.licence_url : null,
    homepage: str('homepage'),
    sources: Array.isArray(r.sources) ? (r.sources as CollectionMeta['sources']) : [],
  };
}
