import type { CurriculumData } from '../curriculum/types.js';
import type { PedagogyLibrary } from '../pedagogy/types.js';

/** What `collection.json` holds. */
export interface CollectionMeta {
  id: string;
  /** `documents` (markdown files, the default) or `pedagogy` (a pedagogy.yaml of entries and claims). */
  kind?: 'documents' | 'pedagogy' | 'curriculum';
  name: string;
  publisher: string;
  description: string;
  licence: string;
  licence_url: string | null;
  /** How the licence was found, when it needs saying. */
  licence_note?: string;
  homepage: string;
  sources: { url: string; description: string }[];
}

/** One markdown document, parsed. Line numbers count from 1 over `lines`, the body after the frontmatter. */
export interface LibraryDoc {
  /** Path under the collection's `docs/` folder, with forward slashes. */
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  lines: string[];
}

export interface Collection {
  meta: CollectionMeta;
  docs: LibraryDoc[];
  /** Short hash of every file's path and content. */
  version: string;
  /** Latest `fetched_at` of any document, or null. */
  updatedAt: string | null;
  /** A pedagogy collection's entries and claims (kind `pedagogy`). */
  pedagogy?: PedagogyLibrary;
  /** A curriculum collection's outcomes and benchmarks (kind `curriculum`). */
  curriculum?: CurriculumData;
}

/** Frontmatter filters: each given key must match; a list value matches if any of its values does. */
export interface Filters {
  subject?: string | string[];
  level?: string | string[];
  type?: string | string[];
  code?: string | string[];
}
