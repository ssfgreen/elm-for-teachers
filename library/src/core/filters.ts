import { asList } from './frontmatter.js';
import type { Filters, LibraryDoc } from './types.js';

const KEYS = ['subject', 'level', 'type', 'code'] as const;

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Whether a document's frontmatter matches the filters. Matching ignores case and extra spaces.
 * `code` reads the `codes` field and also matches by prefix, so `MNU 2` finds every
 * second level numeracy code.
 */
export function matchesFilters(doc: LibraryDoc, filters: Filters | undefined): boolean {
  if (!filters) return true;
  for (const key of KEYS) {
    const wanted = asList(filters[key]).map(norm).filter((v) => v.length > 0);
    if (wanted.length === 0) continue;
    const field = key === 'code' ? 'codes' : key;
    const have = asList(doc.frontmatter[field]).map(norm);
    const hit = key === 'code' ? wanted.some((w) => have.some((h) => h.startsWith(w))) : wanted.some((w) => have.includes(w));
    if (!hit) return false;
  }
  return true;
}
