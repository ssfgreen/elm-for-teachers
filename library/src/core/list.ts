import { matchesFilters } from './filters.js';
import { asList } from './frontmatter.js';
import { matchesGlob } from './glob.js';
import type { Collection, Filters, LibraryDoc } from './types.js';

export interface ListArgs {
  path_glob?: string;
  filters?: Filters;
}

export interface ListedFile {
  path: string;
  title: string;
  lines: number;
  subject: string[];
  level: string[];
  type: string | null;
}

/** The documents that pass the glob and the filters, in path order. */
export function selectDocs(collection: Collection, args: ListArgs): LibraryDoc[] {
  return collection.docs.filter((d) => matchesGlob(d.path, args.path_glob) && matchesFilters(d, args.filters));
}

export function list(collection: Collection, args: ListArgs = {}): { files: ListedFile[] } {
  const files = selectDocs(collection, args).map((d) => ({
    path: d.path,
    title: d.title,
    lines: d.lines.length,
    subject: asList(d.frontmatter.subject),
    level: asList(d.frontmatter.level),
    type: typeof d.frontmatter.type === 'string' ? d.frontmatter.type : null,
  }));
  return { files };
}
