/**
 * Chat threads. Each thread owns its docs and its conversation; the model only ever
 * sees one thread's docs and history. A new thread starts with one blank doc, because
 * this is a document editor, not a plain chat. A thread is "Untitled" until the teacher
 * names it, or the model does (threads/title.ts).
 */
import type { Transaction } from '../db/types.js';
import { newUlid, nowIso, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { Db } from '../db/client.js';
import { rowToThread } from '../db/rows.js';
import type { EventStore, ServerEnvelope, ThreadService } from '../deps.js';
import { badRequest, conflict, notFound } from '../http-error.js';

/** Where a new chat goes: a project, a class, a year group, or a needs group (needs_group_id may combine with class_id). */
export interface ThreadPlace {
  project_id?: string | null;
  class_id?: string | null;
  year_group_id?: string | null;
  needs_group_id?: string | null;
}

/** 404 for a row that is not this session's, 409 for an archived one. */
async function mustBeOpen(
  tx: Transaction,
  table: 'projects' | 'classes' | 'year_groups' | 'needs_groups',
  what: string,
  sessionId: string,
  id: string,
): Promise<void> {
  const r = await tx.execute({ sql: `SELECT * FROM ${table} WHERE session_id = ? AND id = ?`, args: [sessionId, id] });
  if (!r.rows[0] || (table === 'projects' && r.rows[0].deleted_at != null)) throw notFound(what);
  const code =
    table === 'projects' ? 'project_archived' : table === 'classes' ? 'class_archived' : table === 'year_groups' ? 'year_group_archived' : 'needs_group_archived';
  if (r.rows[0].archived_at != null) throw conflict(`that ${what} is archived`, code);
}

/** A chat keeps this title until the teacher names it. */
export const NEW_THREAD_TITLE = 'Untitled';
export const NEW_DOC_NAME = 'Untitled';

export function createThreadService(db: Db, canvas: CanvasServiceImpl, events: EventStore): ThreadService {
  const run = (tx: Transaction | undefined, sql: string, args: (string | number | null)[]) => (tx ? tx.execute({ sql, args }) : db.execute(sql, args));

  return {
    async list(sessionId) {
      const r = await db.execute('SELECT * FROM threads WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
      return r.rows.map(rowToThread);
    },

    async listForTeacher(sessionId) {
      const r = await db.execute(
        'SELECT t.* FROM threads t LEFT JOIN projects p ON p.id = t.project_id WHERE t.session_id = ? AND p.deleted_at IS NULL ORDER BY t.created_at, t.id',
        [sessionId],
      );
      return r.rows.map(rowToThread);
    },

    async get(sessionId, threadId, tx) {
      const r = await run(tx, 'SELECT * FROM threads WHERE session_id = ? AND id = ?', [sessionId, threadId]);
      return r.rows[0] ? rowToThread(r.rows[0]) : null;
    },

    async create(sessionId, envelope, outer, place = null) {
      const where: ThreadPlace = typeof place === 'string' ? { project_id: place } : (place ?? {});
      const projectId = where.project_id ?? null;
      const classId = where.class_id ?? null;
      const yearGroupId = where.year_group_id ?? null;
      const needsGroupId = where.needs_group_id ?? null;
      if ([projectId, classId, yearGroupId].filter(Boolean).length > 1) throw badRequest('a chat is in at most one of a project, a class and a year group');
      if (needsGroupId && (projectId || yearGroupId)) throw badRequest('a needs group chat may only combine with a class');
      const work = async (tx: Transaction) => {
        if (projectId) await mustBeOpen(tx, 'projects', 'project', sessionId, projectId);
        if (classId) await mustBeOpen(tx, 'classes', 'class', sessionId, classId);
        if (yearGroupId) await mustBeOpen(tx, 'year_groups', 'year group', sessionId, yearGroupId);
        if (needsGroupId) await mustBeOpen(tx, 'needs_groups', 'needs group', sessionId, needsGroupId);
        const thread: Thread = {
          id: newUlid(),
          session_id: sessionId,
          title: NEW_THREAD_TITLE,
          project_id: projectId,
          class_id: classId,
          year_group_id: yearGroupId,
          needs_group_id: needsGroupId,
          created_at: nowIso(),
        };
        await tx.execute({
          sql: 'INSERT INTO threads (id, session_id, title, running_summary, project_id, class_id, year_group_id, needs_group_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)',
          args: [thread.id, sessionId, thread.title, projectId, classId, yearGroupId, needsGroupId, thread.created_at],
        });
        const env: ServerEnvelope = { ...envelope, thread_id: thread.id };
        const doc = await canvas.createTeacherDoc(sessionId, { thread_id: thread.id, name: NEW_DOC_NAME }, env, tx);
        const placed = { ...(classId ? { class_id: classId } : {}), ...(yearGroupId ? { year_group_id: yearGroupId } : {}) };
        await events.appendServer(sessionId, 'thread_create', { thread_id: thread.id, doc_id: doc.id, project_id: projectId, ...placed }, { ...env, doc_id: doc.id }, tx);
        return { thread, doc };
      };
      return outer ? work(outer) : db.transaction(work);
    },

    async setTitle(threadId, title, tx) {
      await tx.execute({ sql: 'UPDATE threads SET title = ? WHERE id = ?', args: [title, threadId] });
    },

    async rename(sessionId, threadId, title, envelope, auto, ifTitle) {
      return db.transaction(async (tx) => {
        const r = await tx.execute({ sql: 'SELECT * FROM threads WHERE session_id = ? AND id = ?', args: [sessionId, threadId] });
        if (!r.rows[0]) return null;
        const current = rowToThread(r.rows[0]);
        if (ifTitle !== undefined && current.title !== ifTitle) return current;
        await tx.execute({ sql: 'UPDATE threads SET title = ? WHERE id = ?', args: [title, threadId] });
        await events.appendServer(sessionId, 'thread_rename', { thread_id: threadId, title, ...(auto ? { auto: true } : {}) }, { ...envelope, thread_id: threadId }, tx);
        return { ...current, title };
      });
    },

    async runningSummary(threadId, tx) {
      const r = await run(tx, 'SELECT running_summary FROM threads WHERE id = ?', [threadId]);
      const v = r.rows[0]?.running_summary;
      return v === null || v === undefined ? null : String(v);
    },

    async summaryState(threadId, tx) {
      const r = await run(tx, 'SELECT running_summary, summary_turns FROM threads WHERE id = ?', [threadId]);
      const row = r.rows[0];
      return {
        summary: row?.running_summary == null ? null : String(row.running_summary),
        turns: row?.summary_turns == null ? null : Number(row.summary_turns),
      };
    },

    async setRunningSummary(threadId, summary, tx, turns = null) {
      await run(tx, 'UPDATE threads SET running_summary = ?, summary_turns = ? WHERE id = ?', [summary, turns, threadId]);
    },
  };
}
