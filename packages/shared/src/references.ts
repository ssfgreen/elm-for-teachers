import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";
import { BlockType } from "./enums.js";

/**
 * Reference files: read-only files in a project that the model can consult (not to be confused
 * with "Upload .docx", which makes an editable doc). The browser converts each file to text, in
 * pages: a PDF keeps its own pages; other formats are cut into pages of about
 * `REFERENCE_PAGE_CHARS` at paragraph breaks, so reading and search can cite a page either way.
 * Deleting marks `deleted_at`; rows are kept for the study record.
 */

/** File types the first version converts. Images and scanned PDFs come later. */
export const REFERENCE_MIMES = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
} as const;
export type ReferenceMime = keyof typeof REFERENCE_MIMES;
export const ReferenceMime = z.enum(Object.keys(REFERENCE_MIMES) as [ReferenceMime, ...ReferenceMime[]]);

/** Target size of a page cut from a file that has no pages of its own. */
export const REFERENCE_PAGE_CHARS = 4000;
/** No page may be longer than this (a PDF page of tiny print, or a file with no paragraph breaks). */
export const REFERENCE_PAGE_MAX = 20_000;
export const REFERENCE_NAME_MAX = 200;

/**
 * A Word file's blocks, as "Upload .docx" would make them (tables, lists and headings kept), so
 * the model can open the file as an editable doc (`open_reference_as_doc`) instead of retyping it.
 */
export const REFERENCE_BLOCKS_MAX = 5000;
export const ReferenceBlock = z.object({ type: BlockType, content: z.string().max(200_000) });
export type ReferenceBlock = z.infer<typeof ReferenceBlock>;

export const ReferenceStatus = z.enum(["pending", "ready"]);
export type ReferenceStatus = z.infer<typeof ReferenceStatus>;

export const ReferenceFile = z.object({
  id: Ulid,
  session_id: z.string(),
  /** A file belongs to a project (its Context) or to one chat (added with "+"), never both. */
  project_id: Ulid.nullable(),
  thread_id: Ulid.nullable(),
  name: z.string().min(1).max(REFERENCE_NAME_MAX),
  mime: ReferenceMime,
  /** Size of the original file. */
  bytes: z.number().int().nonnegative(),
  pages: z.number().int().positive(),
  chars: z.number().int().nonnegative(),
  /** Estimated tokens of the extracted text (characters / 4). */
  est_tokens: z.number().int().nonnegative(),
  /** A one-line description, written by the model at upload (null until then, or if that failed). */
  summary: z.string().nullable(),
  /** `pending` until the original has reached the bucket; the model sees only `ready` files. */
  status: ReferenceStatus,
  /** It can be opened as an editable doc (a Word file added with its blocks). */
  editable: z.boolean().optional(),
  created_at: Timestamp,
  deleted_at: Timestamp.nullable(),
});
export type ReferenceFile = z.infer<typeof ReferenceFile>;

/** The usual estimate: about four characters a token. */
export const estimateTokens = (chars: number): number => Math.ceil(chars / 4);

/**
 * Cut text with no pages of its own into pages of about `size` characters, at paragraph breaks
 * where it can (then line breaks, then spaces), never longer than `REFERENCE_PAGE_MAX`.
 * Whitespace-only text gives no pages.
 */
export function splitIntoPages(text: string, size = REFERENCE_PAGE_CHARS): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  const pages: string[] = [];
  let rest = clean;
  while (rest.length > size) {
    const window = rest.slice(0, Math.min(rest.length, Math.max(size * 1.5, size + 1), REFERENCE_PAGE_MAX));
    const cut = [window.lastIndexOf("\n\n", size * 1.25), window.lastIndexOf("\n", size * 1.25), window.lastIndexOf(" ", size)].find((i) => i >= size / 2);
    const at = cut ?? Math.min(size, window.length);
    pages.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) pages.push(rest);
  return pages.filter(Boolean);
}
