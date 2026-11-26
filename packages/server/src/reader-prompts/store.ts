/**
 * The teacher's prompt library for the pupil reader (#177): list, add, edit, remove and reorder.
 * The first time a workspace's library is touched, config's `reader.default_prompts` go in, in
 * one transaction with the read or write that found it empty. A removed prompt keeps its row
 * (`removed_at`), so the defaults never come back. Every change is logged in the same transaction
 * as the write, with ids only (question 43): the source of an add is in the row's `source`.
 */
import { newUlid, nowIso, READER_PROMPTS_MAX, type ReaderPrompt, type ReaderPromptFields, type ReaderPromptPatch } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Transaction } from '../db/types.js';
import type { EventStore, ServerEnvelope } from '../deps.js';

export interface ReaderPromptStore {
  /** The library in the teacher's order; config's defaults go in first if it has never had a prompt. */
  list(sessionId: string): Promise<ReaderPrompt[]>;
  /** Add a prompt at the end; 'full' at READER_PROMPTS_MAX. */
  add(sessionId: string, fields: ReaderPromptFields, envelope: ServerEnvelope): Promise<ReaderPrompt | 'full'>;
  /** Change some of a prompt's fields; null when the workspace has no such prompt. Logged only when something changed. */
  edit(sessionId: string, promptId: string, patch: ReaderPromptPatch, envelope: ServerEnvelope): Promise<ReaderPrompt | null>;
  /** Remove a prompt; false when the workspace has no such prompt. */
  remove(sessionId: string, promptId: string, envelope: ServerEnvelope): Promise<boolean>;
  /** Put the prompts in this order (logged only when it moved one); 'mismatch' unless `ids` is every prompt in the library once. */
  reorder(sessionId: string, ids: string[], envelope: ServerEnvelope): Promise<ReaderPrompt[] | 'mismatch'>;
}

const FIELDS = ['label', 'instruction', 'after_highlight', 'follow_up'] as const;
const COLUMNS = 'id, label, instruction, after_highlight, follow_up';

const prompt = (r: Record<string, unknown>): ReaderPrompt => ({
  id: String(r.id),
  label: String(r.label),
  instruction: String(r.instruction),
  after_highlight: Number(r.after_highlight) === 1,
  follow_up: Number(r.follow_up) === 1,
});

/** A server-made envelope, for the defaults put in by a read. */
const serverEnvelope = (): ServerEnvelope => ({ client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null });

export function createReaderPromptStore(db: Db, events: EventStore, defaults: () => ReaderPromptFields[]): ReaderPromptStore {
  const live = async (tx: Transaction, sessionId: string) =>
    (await tx.execute({ sql: `SELECT ${COLUMNS} FROM reader_prompts WHERE session_id = ? AND removed_at IS NULL ORDER BY position, id`, args: [sessionId] })).rows.map((r) => prompt(r));

  const one = async (tx: Transaction, sessionId: string, promptId: string) => {
    const r = (await tx.execute({ sql: `SELECT ${COLUMNS} FROM reader_prompts WHERE session_id = ? AND id = ? AND removed_at IS NULL`, args: [sessionId, promptId] })).rows[0];
    return r ? prompt(r) : null;
  };

  const insert = async (tx: Transaction, sessionId: string, fields: ReaderPromptFields, source: 'default' | 'teacher', envelope: ServerEnvelope): Promise<ReaderPrompt> => {
    const next = Number((await tx.execute({ sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM reader_prompts WHERE session_id = ?', args: [sessionId] })).rows[0]?.n ?? 0);
    const p: ReaderPrompt = { id: newUlid(), ...fields };
    const now = nowIso();
    await tx.execute({
      sql: 'INSERT INTO reader_prompts (id, session_id, label, instruction, after_highlight, follow_up, position, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [p.id, sessionId, p.label, p.instruction, p.after_highlight ? 1 : 0, p.follow_up ? 1 : 0, next, source, now, now],
    });
    await events.appendServer(sessionId, 'reader_prompt_add', { prompt_id: p.id }, envelope, tx);
    return p;
  };

  /** Config's defaults, the first time the library is touched (no row at all, removed or not). */
  const seed = async (tx: Transaction, sessionId: string) => {
    const any = (await tx.execute({ sql: 'SELECT 1 FROM reader_prompts WHERE session_id = ? LIMIT 1', args: [sessionId] })).rows.length > 0;
    if (any) return;
    const envelope = serverEnvelope();
    for (const fields of defaults()) await insert(tx, sessionId, fields, 'default', envelope);
  };

  return {
    list: (sessionId) =>
      db.transaction(async (tx) => {
        await seed(tx, sessionId);
        return live(tx, sessionId);
      }),

    add: (sessionId, fields, envelope) =>
      db.transaction(async (tx) => {
        await seed(tx, sessionId);
        if ((await live(tx, sessionId)).length >= READER_PROMPTS_MAX) return 'full' as const;
        return insert(tx, sessionId, fields, 'teacher', envelope);
      }),

    edit: (sessionId, promptId, patch, envelope) =>
      db.transaction(async (tx) => {
        await seed(tx, sessionId);
        const was = await one(tx, sessionId, promptId);
        if (!was) return null;
        const now = { ...was, ...patch };
        if (FIELDS.every((f) => now[f] === was[f])) return was;
        await tx.execute({
          sql: 'UPDATE reader_prompts SET label = ?, instruction = ?, after_highlight = ?, follow_up = ?, updated_at = ? WHERE session_id = ? AND id = ?',
          args: [now.label, now.instruction, now.after_highlight ? 1 : 0, now.follow_up ? 1 : 0, nowIso(), sessionId, promptId],
        });
        await events.appendServer(sessionId, 'reader_prompt_edit', { prompt_id: promptId }, envelope, tx);
        return now;
      }),

    remove: (sessionId, promptId, envelope) =>
      db.transaction(async (tx) => {
        await seed(tx, sessionId);
        if (!(await one(tx, sessionId, promptId))) return false;
        const now = nowIso();
        await tx.execute({ sql: 'UPDATE reader_prompts SET removed_at = ?, updated_at = ? WHERE session_id = ? AND id = ?', args: [now, now, sessionId, promptId] });
        await events.appendServer(sessionId, 'reader_prompt_remove', { prompt_id: promptId }, envelope, tx);
        return true;
      }),

    reorder: (sessionId, ids, envelope) =>
      db.transaction(async (tx) => {
        await seed(tx, sessionId);
        const was = await live(tx, sessionId);
        const known = new Set(was.map((p) => p.id));
        if (ids.length !== was.length || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) return 'mismatch' as const;
        if (ids.every((id, i) => id === was[i]!.id)) return was;
        const now = nowIso();
        for (const [i, id] of ids.entries()) {
          await tx.execute({ sql: 'UPDATE reader_prompts SET position = ?, updated_at = ? WHERE session_id = ? AND id = ?', args: [i, now, sessionId, id] });
        }
        // Removed prompts keep their old positions, which may now tie with live ones; only live ones are listed.
        await events.appendServer(sessionId, 'reader_prompt_reorder', { prompt_ids: ids }, envelope, tx);
        const byId = new Map(was.map((p) => [p.id, p]));
        return ids.map((id) => byId.get(id)!);
      }),
  };
}
