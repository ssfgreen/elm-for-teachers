/**
 * A class's pupil table: a number and a made-up label per pupil, their needs, what helps and a note. Under
 * option B (Sam, 12 Nov 2026) the rows are kept for the teacher and sent to the model, and the
 * research record has only their shape: `pupils_change` names the rows and fields that changed,
 * with the table's row count, a count of each need and a hash (shape.ts).
 */
import type { Transaction } from '../db/types.js';
import { makePupilLabel, newUlid, nowIso, PUPILS_PER_CLASS, type Pupil, type PupilFields } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { rowToPupil } from './rows.js';
import { shapeNow } from './adaptations.js';

export interface PupilService {
  /** The class's pupils still in it, in order. */
  list(sessionId: string, classId: string, tx?: Transaction): Promise<Pupil[]>;
  /** Adds rows at the end; a row with no label gets a made-up one. 409 past PUPILS_PER_CLASS. */
  add(sessionId: string, classId: string, rows: PupilFields[], envelope: ServerEnvelope, tx?: Transaction): Promise<Pupil[]>;
  /** Null when the pupil is not in this class. */
  update(sessionId: string, classId: string, pupilId: string, fields: PupilFields, envelope: ServerEnvelope): Promise<Pupil | null>;
  /** Moves the row to the end of another of the session's classes. */
  move(sessionId: string, classId: string, pupilId: string, toClassId: string, envelope: ServerEnvelope): Promise<Pupil | null>;
  /** The pupil left: the row is hidden, kept for the record. */
  archive(sessionId: string, classId: string, pupilId: string, envelope: ServerEnvelope): Promise<Pupil | null>;
}

const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
/** Trimmed, with a need given twice (in any case) kept once, as first written. */
const cleanNeeds = (needs: string[]) => {
  const kept = new Map<string, string>();
  for (const n of needs.map((x) => x.trim()).filter(Boolean)) if (!kept.has(n.toLowerCase())) kept.set(n.toLowerCase(), n);
  return [...kept.values()];
};

export function createPupilService(db: Db, events: EventStore): PupilService {
  const list = async (sessionId: string, classId: string, tx?: Transaction) => {
    const sql = 'SELECT * FROM class_pupils WHERE session_id = ? AND class_id = ? AND archived_at IS NULL ORDER BY position, id';
    const r = tx ? await tx.execute({ sql, args: [sessionId, classId] }) : await db.execute(sql, [sessionId, classId]);
    return r.rows.map(rowToPupil);
  };
  const inTx = <T>(tx: Transaction | undefined, work: (tx: Transaction) => Promise<T>) => (tx ? work(tx) : db.transaction(work));
  const openClass = async (tx: Transaction, sessionId: string, classId: string) => {
    const r = await tx.execute({ sql: 'SELECT archived_at FROM classes WHERE session_id = ? AND id = ?', args: [sessionId, classId] });
    if (!r.rows[0]) throw notFound('class');
    if (r.rows[0].archived_at != null) throw conflict('that class is archived', 'class_archived');
  };
  const nextPosition = async (tx: Transaction, classId: string) => {
    const r = await tx.execute({ sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM class_pupils WHERE class_id = ?', args: [classId] });
    return Number(r.rows[0]!.n);
  };
  // Counts pupils who left or moved away too, so a number is never given twice in a class.
  const nextNumber = async (tx: Transaction, classId: string) => {
    const r = await tx.execute({ sql: 'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM class_pupils WHERE class_id = ?', args: [classId] });
    return Number(r.rows[0]!.n);
  };
  const write = (tx: Transaction, p: Pupil) =>
    tx.execute({
      sql: 'UPDATE class_pupils SET number = ?, label = ?, needs = ?, helps = ?, working_at = ?, note = ?, position = ?, class_id = ?, archived_at = ? WHERE id = ?',
      args: [p.number, p.label, JSON.stringify(p.needs), p.helps, p.working_at, p.note, p.position, p.class_id, p.archived_at, p.id],
    });
  const find = async (tx: Transaction, sessionId: string, classId: string, pupilId: string) =>
    (await list(sessionId, classId, tx)).find((p) => p.id === pupilId) ?? null;

  return {
    list,

    add(sessionId, classId, rows, envelope, outer) {
      return inTx(outer, async (tx) => {
        await openClass(tx, sessionId, classId);
        const existing = await list(sessionId, classId, tx);
        if (existing.length + rows.length > PUPILS_PER_CLASS) throw conflict(`a class holds at most ${PUPILS_PER_CLASS} pupils`, 'class_full');
        const taken = existing.map((p) => p.label);
        let position = await nextPosition(tx, classId);
        let number = await nextNumber(tx, classId);
        const added: Pupil[] = [];
        for (const row of rows) {
          const label = row.label?.trim() || makePupilLabel(taken);
          taken.push(label);
          const p: Pupil = {
            id: newUlid(),
            class_id: classId,
            number: number++,
            label,
            needs: cleanNeeds(row.needs ?? []),
            helps: orNull(row.helps),
            working_at: orNull(row.working_at),
            note: orNull(row.note),
            position: position++,
            created_at: nowIso(),
            archived_at: null,
          };
          await tx.execute({
            sql: 'INSERT INTO class_pupils (id, session_id, class_id, number, label, needs, helps, working_at, note, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            args: [p.id, sessionId, classId, p.number, p.label, JSON.stringify(p.needs), p.helps, p.working_at, p.note, p.position, p.created_at],
          });
          added.push(p);
        }
        const table = await shapeNow(tx, sessionId, classId);
        await events.appendServer(sessionId, 'pupils_change', { class_id: classId, op: 'add', pupil_ids: added.map((p) => p.id), table }, envelope, tx);
        return added;
      });
    },

    update(sessionId, classId, pupilId, fields, envelope) {
      return db.transaction(async (tx) => {
        const p = await find(tx, sessionId, classId, pupilId);
        if (!p) return null;
        const next: Pupil = { ...p };
        if (fields.label !== undefined && fields.label.trim()) next.label = fields.label.trim();
        if (fields.needs !== undefined) next.needs = cleanNeeds(fields.needs);
        for (const k of ['helps', 'working_at', 'note'] as const) if (fields[k] !== undefined) next[k] = orNull(fields[k]);
        const changed = (['label', 'needs', 'helps', 'working_at', 'note'] as const).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(p[k]));
        if (changed.length === 0) return p;
        await write(tx, next);
        const table = await shapeNow(tx, sessionId, classId);
        await events.appendServer(sessionId, 'pupils_change', { class_id: classId, op: 'update', pupil_ids: [pupilId], fields: changed, table }, envelope, tx);
        return next;
      });
    },

    move(sessionId, classId, pupilId, toClassId, envelope) {
      return db.transaction(async (tx) => {
        const p = await find(tx, sessionId, classId, pupilId);
        if (!p) return null;
        if (toClassId === classId) return p;
        await openClass(tx, sessionId, toClassId);
        const there = await list(sessionId, toClassId, tx);
        if (there.length >= PUPILS_PER_CLASS) throw conflict(`a class holds at most ${PUPILS_PER_CLASS} pupils`, 'class_full');
        const label = there.some((x) => x.label.toLowerCase() === p.label.toLowerCase()) ? makePupilLabel(there.map((x) => x.label)) : p.label;
        const next: Pupil = { ...p, class_id: toClassId, number: await nextNumber(tx, toClassId), label, position: await nextPosition(tx, toClassId) };
        await write(tx, next);
        // A pupil's adaptations go with them.
        await tx.execute({ sql: 'UPDATE pupil_adaptations SET class_id = ? WHERE pupil_id = ?', args: [toClassId, pupilId] });
        const table = await shapeNow(tx, sessionId, classId);
        const to_table = await shapeNow(tx, sessionId, toClassId);
        await events.appendServer(sessionId, 'pupils_change', { class_id: classId, op: 'move', pupil_ids: [pupilId], to_class_id: toClassId, table, to_table }, envelope, tx);
        return next;
      });
    },

    archive(sessionId, classId, pupilId, envelope) {
      return db.transaction(async (tx) => {
        const p = await find(tx, sessionId, classId, pupilId);
        if (!p) return null;
        const next = { ...p, archived_at: nowIso() };
        await write(tx, next);
        const table = await shapeNow(tx, sessionId, classId);
        await events.appendServer(sessionId, 'pupils_change', { class_id: classId, op: 'archive', pupil_ids: [pupilId], table }, envelope, tx);
        return next;
      });
    },
  };
}
