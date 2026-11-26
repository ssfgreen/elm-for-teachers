/**
 * What the model can do with a project's reference files during a turn: see the catalogue,
 * read a file a page range at a time, and search them by keyword. Only ready, undeleted files
 * are visible. Search narrows the pages in SQL (LIKE on each term) and ranks them here: there is
 * no full-text index (FTS5 is not relied on, so Turso needs nothing special), which is fine at
 * 20 files a project.
 */
import { ReferenceFile, type ReferenceBlock } from '@edw/shared';
import type { Db } from '../db/client.js';

export interface ReferencePageRange {
  file: ReferenceFile;
  text: string;
  first: number;
  last: number;
}

export interface SearchHit {
  file_id: string;
  name: string;
  page: number;
  snippet: string;
  score: number;
}

export interface ReferenceReader {
  /** The project's ready files, oldest first (the catalogue). */
  files: ReferenceFile[];
  /** Pages from `fromPage`, as many whole pages as fit in `maxChars` (always at least one); null for a file not in the catalogue. */
  read(fileId: string, fromPage: number, maxChars: number): Promise<ReferencePageRange | null>;
  /** The best-matching pages for a query, best first, with a snippet around the match. */
  search(query: string, fileIds?: string[], limit?: number): Promise<SearchHit[]>;
  /** A catalogue file's blocks, when it is `editable` (a Word file); else null. */
  blocks(fileId: string): Promise<ReferenceBlock[] | null>;
}

const STOP = new Set(['a', 'an', 'is', 'of', 'to', 'in', 'on', 'it', 'be', 'or', 'as', 'at', 'by', 'the', 'and', 'for', 'are', 'was', 'with', 'that', 'this', 'from', 'what', 'which', 'about', 'into', 'have', 'has', 'how', 'why', 'who', 'does', 'did', 'not', 'any', 'all', 'can', 'its']);
const SNIPPET = 320;

/** The words of a query worth searching for: lower case, two characters or more, no common words, at most eight. */
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 2 && !STOP.has(w)))].slice(0, 8);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function countOf(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Score a page: each term found counts (more for repeats, with diminishing returns), the whole phrase most. */
export function scorePage(text: string, terms: string[], phrase: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  let found = 0;
  for (const t of terms) {
    const n = countOf(lower, t);
    if (n > 0) {
      found++;
      score += 1 + Math.log2(n);
    }
  }
  if (found === 0) return 0;
  score *= found / terms.length;
  if (terms.length > 1 && phrase && lower.includes(phrase)) score += 3;
  return Math.round(score * 100) / 100;
}

/** About SNIPPET characters around the first place the phrase (else the rarest-first term) appears, at word boundaries. */
export function snippetOf(text: string, terms: string[], phrase: string): string {
  const lower = text.toLowerCase();
  let at = phrase ? lower.indexOf(phrase) : -1;
  for (const t of terms) {
    if (at !== -1) break;
    at = lower.indexOf(t);
  }
  if (at === -1) at = 0;
  let from = Math.max(0, at - SNIPPET / 3);
  let to = Math.min(text.length, from + SNIPPET);
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (to < text.length) to = text.lastIndexOf(' ', to) > from ? text.lastIndexOf(' ', to) : to;
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`;
}

/** A project's files (a string), or a chat's: its own and its project's. */
export async function readerFor(db: Db, sessionId: string, scope: string | { projectId: string | null; threadId: string }): Promise<ReferenceReader> {
  const { projectId, threadId } = typeof scope === 'string' ? { projectId: scope, threadId: null } : scope;
  // '' matches no row, so a missing project or chat adds nothing.
  const rows = await db.execute(
    "SELECT * FROM reference_files WHERE session_id = ? AND (project_id = ? OR thread_id = ?) AND status = 'ready' AND deleted_at IS NULL ORDER BY created_at, id",
    [sessionId, projectId ?? '', threadId ?? ''],
  );
  const files = rows.rows.map((r) =>
    ReferenceFile.parse({ ...r, project_id: r.project_id ?? null, thread_id: r.thread_id ?? null, bytes: Number(r.bytes), pages: Number(r.pages), chars: Number(r.chars), est_tokens: Number(r.est_tokens), summary: r.summary ?? null, deleted_at: null, ...(r.blocks != null ? { editable: true } : {}) }),
  );
  const byId = new Map(files.map((f) => [f.id, f]));

  return {
    files,

    async blocks(fileId) {
      if (!byId.get(fileId)?.editable) return null;
      const r = await db.execute('SELECT blocks FROM reference_files WHERE id = ?', [fileId]);
      const raw = r.rows[0]?.blocks;
      return raw == null ? null : (JSON.parse(String(raw)) as ReferenceBlock[]);
    },

    async read(fileId, fromPage, maxChars) {
      const file = byId.get(fileId);
      if (!file) return null;
      const first = Math.min(Math.max(1, Math.floor(fromPage)), file.pages);
      // Pages are at most REFERENCE_PAGE_MAX characters, so this many always covers maxChars.
      const r = await db.execute('SELECT page, text FROM reference_pages WHERE file_id = ? AND page >= ? ORDER BY page LIMIT ?', [fileId, first, Math.max(1, Math.ceil(maxChars / 500))]);
      const shown: string[] = [];
      let size = 0;
      let last = first - 1;
      for (const row of r.rows) {
        const entry = `[page ${Number(row.page)}]\n${String(row.text)}`;
        if (shown.length > 0 && size + entry.length + 2 > maxChars) break;
        shown.push(entry);
        size += entry.length + 2;
        last = Number(row.page);
      }
      return { file, text: shown.join('\n\n'), first, last };
    },

    async search(query, fileIds, limit = 8) {
      const terms = queryTerms(query);
      if (terms.length === 0) return [];
      const ids = (fileIds?.length ? fileIds.filter((id) => byId.has(id)) : files.map((f) => f.id));
      if (ids.length === 0) return [];
      const phrase = query.toLowerCase().replace(/\s+/g, ' ').trim();
      const r = await db.execute(
        `SELECT file_id, page, text FROM reference_pages WHERE file_id IN (${ids.map(() => '?').join(', ')}) AND (${terms.map(() => "text LIKE ? ESCAPE '\\'").join(' OR ')}) LIMIT 500`,
        [...ids, ...terms.map((t) => `%${escapeLike(t)}%`)],
      );
      return r.rows
        .map((row) => {
          const text = String(row.text);
          const fileId = String(row.file_id);
          return { file_id: fileId, name: byId.get(fileId)!.name, page: Number(row.page), text, score: scorePage(text, terms, phrase) };
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score || a.file_id.localeCompare(b.file_id) || a.page - b.page)
        .slice(0, limit)
        .map(({ text, ...h }) => ({ ...h, snippet: snippetOf(text, terms, phrase) }));
    },
  };
}
