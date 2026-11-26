/**
 * A class's readings (#187): list, set, update and remove, and the docs a reading can be set from.
 * Setting a reading stores a frozen copy of the doc (copy.ts), so later edits to the doc do not
 * change it; setting the same doc again for the class replaces its reading with a fresh copy (the
 * old one is removed). Prompts are the library's (reader-prompts/), by id, so a prompt edited
 * later is used as edited; a reading's prompts are kept in the library's order as it was when they were
 * saved, so sending the same prompts in another order changes nothing. A removed reading keeps its row (`removed_at`). Every change is logged
 * in the same transaction as the write, with ids, and for a set or update the limit and the copy's hash (#195). This module never writes docs or blocks.
 */
import { newUlid, nowIso, type Reading, type ReadingFields, type ReadingPatch, type ReadingSource, type ReaderPrompt } from '@edw/shared';
import type { ClassService } from '../classes/service.js';
import type { Db } from '../db/client.js';
import type { Transaction } from '../db/types.js';
import type { CanvasService, EventStore, ServerEnvelope } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { frozenCopy } from './copy.js';

export interface ReadingStore {
  /** The docs a reading can be set from: not deleted, not in a deleted project, newest first. */
  sources(sessionId: string): Promise<ReadingSource[]>;
  /** The class's readings (not removed), newest first; 404 for a class not this workspace's. */
  list(sessionId: string, classId: string): Promise<Reading[]>;
  /** 404 for a class or doc not this workspace's (or a deleted doc), 409 for an archived class or a prompt not in the library. */
  set(sessionId: string, classId: string, fields: ReadingFields, envelope: ServerEnvelope): Promise<Reading>;
  /** Changes the prompts and/or the follow-up limit; logged only when something changed. */
  update(sessionId: string, classId: string, readingId: string, patch: ReadingPatch, envelope: ServerEnvelope): Promise<Reading>;
  remove(sessionId: string, classId: string, readingId: string, envelope: ServerEnvelope): Promise<void>;
}

export interface ReadingStoreDeps {
  db: Db;
  events: EventStore;
  classes: Pick<ClassService, 'get'>;
  canvas: Pick<CanvasService, 'loadState'>;
  /** The workspace's prompt library (reader-prompts/store.ts `list`). */
  prompts: (sessionId: string) => Promise<ReaderPrompt[]>;
}

const SOURCES_SQL = `SELECT d.id, d.name, d.created_at, t.title FROM docs d
  JOIN threads t ON t.id = d.thread_id
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE d.session_id = ? AND d.deleted_at IS NULL AND p.deleted_at IS NULL`;

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function createReadingStore({ db, events, classes, canvas, prompts }: ReadingStoreDeps): ReadingStore {
  /** Every id must be a prompt in the library now (not removed); returns them in the library's order. */
  const checkPrompts = async (sessionId: string, ids: readonly string[]) => {
    const library = (await prompts(sessionId)).map((p) => p.id);
    if (!ids.every((id) => library.includes(id))) throw conflict('a prompt is no longer in the library: reload and try again', 'prompt_unavailable');
    return library.filter((id) => ids.includes(id));
  };

  const classOf = async (tx: Transaction, sessionId: string, classId: string) => {
    const c = await classes.get(sessionId, classId, tx);
    if (!c) throw notFound('class');
    return c;
  };

  const promptIdsOf = async (tx: Transaction, readingIds: string[]) => {
    const out = new Map<string, string[]>(readingIds.map((id) => [id, []]));
    if (readingIds.length === 0) return out;
    const r = await tx.execute({
      sql: `SELECT reading_id, prompt_id FROM reading_prompts WHERE reading_id IN (${readingIds.map(() => '?').join(', ')}) ORDER BY position`,
      args: readingIds,
    });
    for (const row of r.rows) out.get(String(row.reading_id))?.push(String(row.prompt_id));
    return out;
  };

  const rows = async (tx: Transaction, sessionId: string, classId: string, readingId?: string): Promise<Reading[]> => {
    const r = await tx.execute({
      sql: `SELECT id, class_id, doc_id, name, follow_ups_max, created_at, updated_at FROM readings WHERE session_id = ? AND class_id = ? AND removed_at IS NULL${readingId ? ' AND id = ?' : ''} ORDER BY created_at DESC, id DESC`,
      args: readingId ? [sessionId, classId, readingId] : [sessionId, classId],
    });
    const ids = r.rows.map((row) => String(row.id));
    const byReading = await promptIdsOf(tx, ids);
    return r.rows.map((row) => ({
      id: String(row.id),
      class_id: String(row.class_id),
      doc_id: String(row.doc_id),
      name: String(row.name),
      prompt_ids: byReading.get(String(row.id)) ?? [],
      follow_ups_max: row.follow_ups_max == null ? null : Number(row.follow_ups_max),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
  };

  const one = async (tx: Transaction, sessionId: string, classId: string, readingId: string) => {
    const r = (await rows(tx, sessionId, classId, readingId))[0];
    if (!r) throw notFound('reading');
    return r;
  };

  const putPrompts = async (tx: Transaction, sessionId: string, readingId: string, ids: readonly string[]) => {
    await tx.execute({ sql: 'DELETE FROM reading_prompts WHERE reading_id = ?', args: [readingId] });
    for (const [i, id] of ids.entries()) {
      await tx.execute({ sql: 'INSERT INTO reading_prompts (reading_id, prompt_id, session_id, position) VALUES (?, ?, ?, ?)', args: [readingId, id, sessionId, i] });
    }
  };

  const markRemoved = async (tx: Transaction, sessionId: string, r: Reading, envelope: ServerEnvelope) => {
    const now = nowIso();
    await tx.execute({ sql: 'UPDATE readings SET removed_at = ?, updated_at = ? WHERE session_id = ? AND id = ?', args: [now, now, sessionId, r.id] });
    await events.appendServer(sessionId, 'reading_remove', { reading_id: r.id, class_id: r.class_id, doc_id: r.doc_id }, envelope, tx);
  };

  return {
    async sources(sessionId) {
      const r = await db.execute(`${SOURCES_SQL} ORDER BY d.created_at DESC, d.id DESC`, [sessionId]);
      return r.rows.map((row) => ({ doc_id: String(row.id), name: String(row.name), thread_title: String(row.title), created_at: String(row.created_at) }));
    },

    list: (sessionId, classId) =>
      db.transaction(async (tx) => {
        await classOf(tx, sessionId, classId);
        return rows(tx, sessionId, classId);
      }),

    async set(sessionId, classId, fields, envelope) {
      // The library is read before the write: its list may put config's defaults in, in a transaction of its own.
      const promptIds = await checkPrompts(sessionId, fields.prompt_ids);
      return db.transaction(async (tx) => {
        const c = await classOf(tx, sessionId, classId);
        if (c.archived_at) throw conflict('that class is archived', 'class_archived');
        const source = await tx.execute({ sql: `${SOURCES_SQL} AND d.id = ?`, args: [sessionId, fields.doc_id] });
        const state = await canvas.loadState(sessionId, tx);
        const doc = state.docs.get(fields.doc_id);
        if (!source.rows[0] || !doc) throw notFound('doc');
        const copy = frozenCopy(state, doc.id);

        // The same doc set again replaces its reading in this class with a fresh copy.
        for (const old of (await rows(tx, sessionId, classId)).filter((r) => r.doc_id === doc.id)) await markRemoved(tx, sessionId, old, envelope);

        const now = nowIso();
        const reading: Reading = { id: newUlid(), class_id: classId, doc_id: doc.id, name: doc.name, prompt_ids: promptIds, follow_ups_max: fields.follow_ups_max, created_at: now, updated_at: now };
        await tx.execute({
          sql: 'INSERT INTO readings (id, session_id, class_id, doc_id, name, blocks, content_hash, follow_ups_max, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [reading.id, sessionId, classId, doc.id, doc.name, JSON.stringify(copy.blocks), copy.content_hash, reading.follow_ups_max, now, now],
        });
        await putPrompts(tx, sessionId, reading.id, reading.prompt_ids);
        await events.appendServer(sessionId, 'reading_set', { reading_id: reading.id, class_id: classId, doc_id: doc.id, prompt_ids: reading.prompt_ids, follow_ups_max: reading.follow_ups_max, content_hash: copy.content_hash }, envelope, tx);
        return reading;
      });
    },

    async update(sessionId, classId, readingId, patch, envelope) {
      const promptIds = patch.prompt_ids ? await checkPrompts(sessionId, patch.prompt_ids) : undefined;
      return db.transaction(async (tx) => {
        await classOf(tx, sessionId, classId);
        const was = await one(tx, sessionId, classId, readingId);
        const now: Reading = { ...was, ...(promptIds ? { prompt_ids: promptIds } : {}), ...(patch.follow_ups_max !== undefined ? { follow_ups_max: patch.follow_ups_max } : {}) };
        if (sameIds(now.prompt_ids, was.prompt_ids) && now.follow_ups_max === was.follow_ups_max) return was;
        now.updated_at = nowIso();
        await tx.execute({ sql: 'UPDATE readings SET follow_ups_max = ?, updated_at = ? WHERE session_id = ? AND id = ?', args: [now.follow_ups_max, now.updated_at, sessionId, readingId] });
        if (!sameIds(now.prompt_ids, was.prompt_ids)) await putPrompts(tx, sessionId, readingId, now.prompt_ids);
        const hash = (await tx.execute({ sql: 'SELECT content_hash FROM readings WHERE session_id = ? AND id = ?', args: [sessionId, readingId] })).rows[0]?.content_hash;
        // The row was read above in this transaction; left out rather than logged as "undefined" if not.
        await events.appendServer(sessionId, 'reading_update', { reading_id: readingId, class_id: classId, doc_id: was.doc_id, prompt_ids: now.prompt_ids, follow_ups_max: now.follow_ups_max, ...(hash == null ? {} : { content_hash: String(hash) }) }, envelope, tx);
        return now;
      });
    },

    remove: (sessionId, classId, readingId, envelope) =>
      db.transaction(async (tx) => {
        await classOf(tx, sessionId, classId);
        await markRemoved(tx, sessionId, await one(tx, sessionId, classId, readingId), envelope);
      }),
  };
}
