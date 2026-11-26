/**
 * Reference files (shared `ReferenceFile`): read-only files that the model can consult, in a
 * project (its Context) or in one chat (added with "+" under the chat box). A chat's files have
 * the same limits as a project's, counted for that chat. The browser converts a file to text in pages and posts them; the service checks the
 * limits (config `references`), stores the text one row a page, and logs `reference_upload`
 * once the file is ready. With a bucket the original goes there through a signed PUT and the
 * file stays `pending` until `complete` finds it; without one it is ready at once and only the
 * text is kept. The model sees only ready, undeleted files (`readerFor`).
 */
import type { Transaction } from '../db/types.js';
import {
  estimateTokens,
  newUlid,
  nowIso,
  REFERENCE_MIMES,
  REFERENCE_PAGE_MAX,
  ReferenceFile,
  type ReferenceBlock,
  type ReferenceLimits,
  type ReferenceMime,
} from '@edw/shared';
import type { Bucket } from '../assets/bucket.js';
import { bucketKey } from '../assets/store.js';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { conflict, HttpError, notFound } from '../http-error.js';

/** The bucket id of a reference's original (bucketKey(session, this)). */
export const referenceBucketId = (id: string) => `ref_${id}`;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function rowToReference(row: Record<string, unknown>): ReferenceFile {
  return ReferenceFile.parse({
    id: row.id,
    session_id: row.session_id,
    project_id: str(row.project_id),
    thread_id: str(row.thread_id),
    name: row.name,
    mime: row.mime,
    bytes: Number(row.bytes),
    pages: Number(row.pages),
    chars: Number(row.chars),
    est_tokens: Number(row.est_tokens),
    summary: str(row.summary),
    status: row.status,
    ...(row.blocks != null ? { editable: true } : {}),
    created_at: row.created_at,
    deleted_at: str(row.deleted_at),
  });
}

export interface NewReference {
  name: string;
  mime: ReferenceMime;
  bytes: number;
  /** The extracted text, a page each. */
  pages: string[];
  /** A Word file's blocks (kept so it can be opened as an editable doc). */
  blocks?: ReferenceBlock[];
}

export interface CreatedReference {
  file: ReferenceFile;
  /** With a bucket: where the browser PUTs the original before calling `complete`. */
  upload: { method: 'PUT'; url: string; headers: Record<string, string> } | null;
}

const MB = 1024 * 1024;
const mb = (bytes: number) => (bytes < MB ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`);
/** Teachers think in words, not tokens: about three words for every four tokens. */
const words = (tokens: number) => `about ${Math.round((tokens * 0.75) / 1000) * 1000 || Math.round(tokens * 0.75)} words`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const tooLarge = (message: string) => new HttpError(413, message, 'reference_too_large');
const overLimit = (message: string) => new HttpError(409, message, 'reference_limit');

export interface ReferenceService {
  /** A project's files that are not deleted (pending ones too), oldest first. */
  list(sessionId: string, projectId: string): Promise<ReferenceFile[]>;
  /** The same for a chat's own files. */
  listForThread(sessionId: string, threadId: string): Promise<ReferenceFile[]>;
  get(sessionId: string, id: string): Promise<ReferenceFile | null>;
  /** Checks the project (a string) or the chat, and the limits; stores the text and, when ready, logs the upload. */
  create(sessionId: string, owner: string | { thread_id: string }, f: NewReference, envelope: ServerEnvelope): Promise<CreatedReference>;
  /** The original has been PUT to the bucket: check it and make the file ready (and log it). */
  complete(sessionId: string, id: string, envelope: ServerEnvelope): Promise<ReferenceFile>;
  /** Marks it deleted and logs it; null when there is no such file. */
  remove(sessionId: string, id: string, envelope: ServerEnvelope): Promise<ReferenceFile | null>;
  setSummary(id: string, summary: string): Promise<void>;
  /** The full text of a file, `[page N]` before each page (export). */
  text(id: string): Promise<string>;
  /** A Word file's blocks, or null (another type, or added before blocks were kept). */
  blocks(sessionId: string, id: string): Promise<ReferenceBlock[] | null>;
  /** A file's pages as the model reads them (the teacher's preview). */
  pages(id: string): Promise<{ page: number; text: string }[]>;
}

export function createReferenceService(db: Db, events: EventStore, limits: ReferenceLimits, bucket: Bucket | null = null): ReferenceService {
  const get = async (sessionId: string, id: string, tx?: Transaction) => {
    const sql = 'SELECT * FROM reference_files WHERE session_id = ? AND id = ?';
    const r = tx ? await tx.execute({ sql, args: [sessionId, id] }) : await db.execute(sql, [sessionId, id]);
    return r.rows[0] ? rowToReference(r.rows[0] as Record<string, unknown>) : null;
  };

  const logUpload = (f: ReferenceFile, envelope: ServerEnvelope, tx: Transaction) =>
    events.appendServer(
      f.session_id,
      'reference_upload',
      { reference_id: f.id, project_id: f.project_id, thread_id: f.thread_id, name: f.name, mime: f.mime, bytes: f.bytes, pages: f.pages, est_tokens: f.est_tokens },
      envelope,
      tx,
    );

  return {
    async list(sessionId, projectId) {
      const r = await db.execute('SELECT * FROM reference_files WHERE session_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY created_at, id', [sessionId, projectId]);
      return r.rows.map((row) => rowToReference(row as Record<string, unknown>));
    },

    async listForThread(sessionId, threadId) {
      const r = await db.execute('SELECT * FROM reference_files WHERE session_id = ? AND thread_id = ? AND deleted_at IS NULL ORDER BY created_at, id', [sessionId, threadId]);
      return r.rows.map((row) => rowToReference(row as Record<string, unknown>));
    },

    get: (sessionId, id) => get(sessionId, id),

    async create(sessionId, owner, f, envelope) {
      const projectId = typeof owner === 'string' ? owner : null;
      const threadId = typeof owner === 'string' ? null : owner.thread_id;
      if (!(f.mime in REFERENCE_MIMES)) throw new HttpError(415, `Files of type ${f.mime} can't be added yet.`, 'unsupported_media_type');
      const pages = f.pages.map((p) => p.trim());
      const chars = pages.reduce((n, p) => n + p.length, 0);
      if (chars === 0) throw new HttpError(422, `No text could be read from “${f.name}”. Scanned PDFs and images can't be added yet.`, 'reference_no_text');
      if (pages.some((p) => p.length > REFERENCE_PAGE_MAX)) throw new HttpError(400, `a page is longer than ${REFERENCE_PAGE_MAX} characters`, 'invalid_request');
      if (f.bytes > limits.file_bytes) throw tooLarge(`“${f.name}” is ${mb(f.bytes)}; a file can be at most ${mb(limits.file_bytes)}.`);
      const est = estimateTokens(chars);
      // Only a Word file has blocks worth keeping; with none, the file is text only.
      const blocks = f.mime === DOCX && f.blocks?.length ? f.blocks : null;
      if (est > limits.file_tokens) throw tooLarge(`“${f.name}” has too much text (${words(est)}); one file can have ${words(limits.file_tokens)}.`);

      return db.transaction(async (tx) => {
        if (projectId) {
          const p = await tx.execute({ sql: 'SELECT archived_at FROM projects WHERE session_id = ? AND id = ?', args: [sessionId, projectId] });
          if (!p.rows[0]) throw notFound('project');
          if (p.rows[0].archived_at != null) throw conflict('that project is archived', 'project_archived');
        } else {
          const t = await tx.execute({ sql: 'SELECT id FROM threads WHERE session_id = ? AND id = ?', args: [sessionId, threadId] });
          if (!t.rows[0]) throw notFound('thread');
        }
        const place = projectId ? 'project' : 'chat';
        const inOwner = (
          await tx.execute({
            sql: `SELECT COUNT(*) AS n, COALESCE(SUM(est_tokens), 0) AS t FROM reference_files WHERE session_id = ? AND ${projectId ? 'project_id' : 'thread_id'} = ? AND deleted_at IS NULL`,
            args: [sessionId, projectId ?? threadId],
          })
        ).rows[0]!;
        if (Number(inOwner.n) >= limits.files_per_project) throw overLimit(`This ${place} already has ${limits.files_per_project} files, the most it can hold. Delete one to add another.`);
        const ownerTokens = Number(inOwner.t) + est;
        if (ownerTokens > limits.project_tokens) throw overLimit(`With “${f.name}” this ${place}'s files would have ${words(ownerTokens)} of text; the most is ${words(limits.project_tokens)}. Delete a file to make room.`);
        const stored = Number((await tx.execute({ sql: 'SELECT COALESCE(SUM(bytes), 0) AS b FROM reference_files WHERE session_id = ? AND deleted_at IS NULL', args: [sessionId] })).rows[0]!.b);
        if (stored + f.bytes > limits.workspace_bytes) throw overLimit(`With “${f.name}” the files in this workspace would take ${mb(stored + f.bytes)}; the most is ${mb(limits.workspace_bytes)}. Delete a file to make room.`);

        const id = newUlid();
        const storageKey = bucket ? bucketKey(sessionId, referenceBucketId(id)) : null;
        const file: ReferenceFile = {
          id,
          session_id: sessionId,
          project_id: projectId,
          thread_id: threadId,
          name: f.name,
          mime: f.mime,
          bytes: f.bytes,
          pages: pages.length,
          chars,
          est_tokens: est,
          summary: null,
          status: bucket ? 'pending' : 'ready',
          ...(blocks ? { editable: true } : {}),
          created_at: nowIso(),
          deleted_at: null,
        };
        await tx.execute({
          sql: 'INSERT INTO reference_files (id, session_id, project_id, thread_id, name, mime, bytes, pages, chars, est_tokens, storage_key, summary, status, created_at, deleted_at, blocks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)',
          args: [id, sessionId, projectId, threadId, file.name, file.mime, file.bytes, file.pages, chars, est, storageKey, file.status, file.created_at, blocks ? JSON.stringify(blocks) : null],
        });
        for (const [i, text] of pages.entries()) {
          await tx.execute({ sql: 'INSERT INTO reference_pages (file_id, session_id, page, text) VALUES (?, ?, ?, ?)', args: [id, sessionId, i + 1, text] });
        }
        if (file.status === 'ready') await logUpload(file, envelope, tx);
        const upload = bucket && storageKey ? { method: 'PUT' as const, url: bucket.presignPut(storageKey, f.mime), headers: { 'Content-Type': f.mime } } : null;
        return { file, upload };
      });
    },

    async complete(sessionId, id, envelope) {
      const f = await get(sessionId, id);
      if (!f || f.deleted_at) throw notFound('reference');
      if (f.status === 'ready') return f;
      if (!bucket) throw notFound('reference');
      // Trust what is in the bucket, not what the browser said it would send.
      const stored = await bucket.head(bucketKey(sessionId, referenceBucketId(id)));
      if (!stored) throw new HttpError(409, 'the file has not arrived in the bucket', 'upload_missing');
      if (stored.bytes > limits.file_bytes) throw tooLarge(`“${f.name}” is ${mb(stored.bytes)}; a file can be at most ${mb(limits.file_bytes)}.`);
      return db.transaction(async (tx) => {
        const ready: ReferenceFile = { ...f, bytes: stored.bytes, status: 'ready' };
        await tx.execute({ sql: "UPDATE reference_files SET status = 'ready', bytes = ? WHERE id = ?", args: [stored.bytes, id] });
        await logUpload(ready, envelope, tx);
        return ready;
      });
    },

    remove(sessionId, id, envelope) {
      return db.transaction(async (tx) => {
        const f = await get(sessionId, id, tx);
        if (!f || f.deleted_at) return null;
        const at = nowIso();
        await tx.execute({ sql: 'UPDATE reference_files SET deleted_at = ? WHERE id = ?', args: [at, id] });
        await events.appendServer(sessionId, 'reference_delete', { reference_id: id, project_id: f.project_id, thread_id: f.thread_id }, envelope, tx);
        return { ...f, deleted_at: at };
      });
    },

    async setSummary(id, summary) {
      await db.execute('UPDATE reference_files SET summary = ? WHERE id = ?', [summary, id]);
    },

    async blocks(sessionId, id) {
      const r = await db.execute('SELECT blocks FROM reference_files WHERE session_id = ? AND id = ? AND deleted_at IS NULL', [sessionId, id]);
      const raw = r.rows[0]?.blocks;
      return raw == null ? null : (JSON.parse(String(raw)) as ReferenceBlock[]);
    },

    async pages(id) {
      const r = await db.execute('SELECT page, text FROM reference_pages WHERE file_id = ? ORDER BY page', [id]);
      return r.rows.map((row) => ({ page: Number(row.page), text: String(row.text) }));
    },

    async text(id) {
      const r = await db.execute('SELECT page, text FROM reference_pages WHERE file_id = ? ORDER BY page', [id]);
      return r.rows.map((row) => `[page ${Number(row.page)}]\n${String(row.text)}`).join('\n\n');
    },
  };
}
