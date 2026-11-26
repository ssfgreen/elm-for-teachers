/**
 * Comments (shared `Comment`): threads on a doc's blocks, by the teacher or the model. Every
 * change is logged (comment_create, comment_edit, comment_resolve, comment_delete) in the same
 * transaction as the write. Only the teacher's own comments can be edited or deleted; any
 * thread can be resolved. A resolved thread takes no replies until it is reopened.
 */
import type { Row, Transaction } from '../db/types.js';
import { run, type DbOrTx } from '../db/run.js';
import { newUlid, nowIso, type Comment, type CommentAuthor } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { HttpError, notFound } from '../http-error.js';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function rowToComment(row: Row): Comment {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    doc_id: String(row.doc_id),
    block_id: String(row.block_id),
    root_id: str(row.root_id),
    author: String(row.author) as CommentAuthor,
    body: String(row.body),
    quote: str(row.quote),
    turn_id: str(row.turn_id),
    created_at: String(row.created_at),
    edited_at: str(row.edited_at),
    resolved_at: str(row.resolved_at),
    deleted_at: str(row.deleted_at),
  };
}

export interface NewComment {
  doc_id: string;
  /** For a root: the block it is about. A reply takes its root's. */
  block_id?: string;
  /** Set for a reply. */
  root_id?: string | null;
  author: CommentAuthor;
  body: string;
  quote?: string | null;
  turn_id?: string | null;
}

export interface CommentStore {
  /** A doc's comments that are not deleted, oldest first. */
  list(sessionId: string, docId: string, x?: DbOrTx): Promise<Comment[]>;
  get(sessionId: string, id: string, x?: DbOrTx): Promise<Comment | null>;
  /** Checks the doc, block and root belong together, writes the comment and logs it. */
  create(sessionId: string, c: NewComment, envelope: ServerEnvelope, tx?: Transaction): Promise<Comment>;
  /** Marks it deleted (a root with its replies) and logs it; null when there is no such comment. */
  remove(sessionId: string, id: string, envelope: ServerEnvelope): Promise<Comment | null>;
  /** Changes a teacher comment's body and logs it; null when there is no such comment. */
  edit(sessionId: string, id: string, body: string, envelope: ServerEnvelope): Promise<Comment | null>;
  /** Resolves or reopens a thread (by its root) and logs it; null when there is no such comment. */
  resolve(sessionId: string, id: string, resolved: boolean, envelope: ServerEnvelope): Promise<Comment | null>;
}

const badRequest = (message: string) => new HttpError(400, message, 'invalid_request');
const notYours = () => new HttpError(403, 'The assistant’s comments can’t be changed or deleted. You can resolve the thread instead.', 'comment_not_yours');

export function createCommentStore(db: Db, events: EventStore): CommentStore {
  const get = async (sessionId: string, id: string, x: DbOrTx = db) => {
    const r = await run(x, { sql: 'SELECT * FROM comments WHERE session_id = ? AND id = ?', args: [sessionId, id] });
    return r.rows[0] ? rowToComment(r.rows[0]) : null;
  };

  const create = async (sessionId: string, c: NewComment, envelope: ServerEnvelope, tx: Transaction): Promise<Comment> => {
    const doc = await run(tx, { sql: 'SELECT id FROM docs WHERE session_id = ? AND id = ? AND deleted_at IS NULL', args: [sessionId, c.doc_id] });
    if (!doc.rows[0]) throw notFound('doc');
    let blockId = c.block_id ?? null;
    let quote = c.quote ?? null;
    if (c.root_id) {
      const root = await get(sessionId, c.root_id, tx);
      if (!root || root.deleted_at) throw notFound('comment');
      if (root.root_id) throw badRequest('reply to the thread’s first comment');
      // The model's answer to a comment still lands if the thread was resolved while it worked.
      if (root.resolved_at && c.author === 'teacher') throw new HttpError(409, 'This thread is resolved. Reopen it to reply.', 'comment_resolved');
      if (root.doc_id !== c.doc_id) throw badRequest('the reply is on a different doc from its thread');
      blockId = root.block_id;
      quote = null;
    }
    if (!blockId) throw badRequest('a new comment needs a block_id');
    const block = await run(tx, { sql: 'SELECT id FROM blocks WHERE session_id = ? AND doc_id = ? AND id = ?', args: [sessionId, c.doc_id, blockId] });
    if (!block.rows[0]) throw notFound('block');
    const comment: Comment = {
      id: newUlid(),
      session_id: sessionId,
      doc_id: c.doc_id,
      block_id: blockId,
      root_id: c.root_id ?? null,
      author: c.author,
      body: c.body,
      quote,
      turn_id: c.turn_id ?? null,
      created_at: nowIso(),
      edited_at: null,
      resolved_at: null,
      deleted_at: null,
    };
    await run(tx, { sql: 'INSERT INTO comments (id, session_id, doc_id, block_id, root_id, author, body, quote, turn_id, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)', args: [
      comment.id,
      sessionId,
      comment.doc_id,
      comment.block_id,
      comment.root_id,
      comment.author,
      comment.body,
      comment.quote,
      comment.turn_id,
      comment.created_at,
    ] });
    await events.appendServer(
      sessionId,
      'comment_create',
      { comment_id: comment.id, root_id: comment.root_id, doc_id: comment.doc_id, block_id: comment.block_id, author: comment.author, body: comment.body, quote: comment.quote, turn_id: comment.turn_id },
      { ...envelope, doc_id: comment.doc_id },
      tx,
    );
    return comment;
  };

  return {
    async list(sessionId, docId, x = db) {
      const r = await run(x, { sql: 'SELECT * FROM comments WHERE session_id = ? AND doc_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid', args: [sessionId, docId] });
      return r.rows.map(rowToComment);
    },
    get,
    create(sessionId, c, envelope, tx) {
      return tx ? create(sessionId, c, envelope, tx) : db.transaction((t) => create(sessionId, c, envelope, t));
    },
    remove(sessionId, id, envelope) {
      return db.transaction(async (tx) => {
        const c = await get(sessionId, id, tx);
        if (!c || c.deleted_at) return null;
        if (c.author !== 'teacher') throw notYours();
        const at = nowIso();
        const replies = c.root_id ? [] : (await run(tx, { sql: 'SELECT id FROM comments WHERE session_id = ? AND root_id = ? AND deleted_at IS NULL', args: [sessionId, id] })).rows.map((r) => String(r.id));
        await run(tx, { sql: 'UPDATE comments SET deleted_at = ? WHERE session_id = ? AND (id = ? OR root_id = ?) AND deleted_at IS NULL', args: [at, sessionId, id, c.root_id ? '' : id] });
        await events.appendServer(sessionId, 'comment_delete', { comment_id: id, replies }, { ...envelope, doc_id: c.doc_id }, tx);
        return { ...c, deleted_at: at };
      });
    },
    edit(sessionId, id, body, envelope) {
      return db.transaction(async (tx) => {
        const c = await get(sessionId, id, tx);
        if (!c || c.deleted_at) return null;
        if (c.author !== 'teacher') throw notYours();
        if (c.body === body) return c;
        const at = nowIso();
        await run(tx, { sql: 'UPDATE comments SET body = ?, edited_at = ? WHERE session_id = ? AND id = ?', args: [body, at, sessionId, id] });
        await events.appendServer(sessionId, 'comment_edit', { comment_id: id, body, previous: c.body }, { ...envelope, doc_id: c.doc_id }, tx);
        return { ...c, body, edited_at: at };
      });
    },
    resolve(sessionId, id, resolved, envelope) {
      return db.transaction(async (tx) => {
        const c = await get(sessionId, id, tx);
        if (!c || c.deleted_at) return null;
        if (c.root_id) throw badRequest('resolve the thread by its first comment');
        if (Boolean(c.resolved_at) === resolved) return c;
        const at = resolved ? nowIso() : null;
        await run(tx, { sql: 'UPDATE comments SET resolved_at = ? WHERE session_id = ? AND id = ?', args: [at, sessionId, id] });
        await events.appendServer(sessionId, 'comment_resolve', { comment_id: id, resolved }, { ...envelope, doc_id: c.doc_id }, tx);
        return { ...c, resolved_at: at };
      });
    },
  };
}
