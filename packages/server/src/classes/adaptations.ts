/**
 * Library adaptations chosen for a pupil (library/pedagogy-sample/HANDOFF.md, layer 4): each
 * names a library entry, with a status (confirmed, trialling, stopped) and the pupil's own
 * settings. They live with the pupil table, never in the library, and count as part of the table
 * for option B: a change logs `pupils_change` with `fields: ["adaptations"]` and the table's
 * shape, never which adaptation.
 */
import type { Row, Transaction } from '../db/types.js';
import { run, type DbOrTx } from '../db/run.js';
import { ADAPTATIONS_PER_PUPIL, newUlid, nowIso, PupilAdaptation, type AdaptationPick, type AdaptationStatus, type Pupil } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { conflict } from '../http-error.js';
import { rowToPupil } from './rows.js';
import { tableShape } from './shape.js';

export function rowToAdaptation(r: Row): PupilAdaptation {
  return PupilAdaptation.parse({
    id: r.id,
    pupil_id: r.pupil_id,
    entry_id: r.entry_id,
    title: r.title,
    changes_goal: Number(r.changes_goal) === 1,
    status: r.status,
    overrides: r.overrides ?? null,
    source_version: r.source_version ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

/** A class's adaptations not removed, for pupils still in it, oldest first. */
export async function adaptationsOf(x: DbOrTx, sessionId: string, classId: string): Promise<PupilAdaptation[]> {
  const r = await run(x, { sql: 'SELECT a.* FROM pupil_adaptations a JOIN class_pupils p ON p.id = a.pupil_id WHERE a.session_id = ? AND p.class_id = ? AND p.archived_at IS NULL AND a.removed_at IS NULL ORDER BY a.created_at, a.rowid', args: [sessionId, classId] });
  return r.rows.map(rowToAdaptation);
}

/** The class's table shape now, adaptations included. */
export async function shapeNow(x: DbOrTx, sessionId: string, classId: string) {
  const pupils = (await run(x, { sql: 'SELECT * FROM class_pupils WHERE session_id = ? AND class_id = ? AND archived_at IS NULL ORDER BY position, id', args: [sessionId, classId] })).rows.map(rowToPupil);
  return tableShape(pupils, await adaptationsOf(x, sessionId, classId));
}

export interface AdaptationService {
  list(sessionId: string, classId: string): Promise<PupilAdaptation[]>;
  /** Null when the pupil is not in this class. 409 for an entry the pupil already has, or too many. */
  add(sessionId: string, classId: string, pupilId: string, pick: AdaptationPick, envelope: ServerEnvelope): Promise<PupilAdaptation | null>;
  /** Null when it is not this class's. */
  update(sessionId: string, classId: string, id: string, fields: { status?: AdaptationStatus; overrides?: string | null }, envelope: ServerEnvelope): Promise<PupilAdaptation | null>;
  remove(sessionId: string, classId: string, id: string, envelope: ServerEnvelope): Promise<PupilAdaptation | null>;
}

export function createAdaptationService(db: Db, events: EventStore): AdaptationService {
  const log = async (tx: Transaction, sessionId: string, classId: string, pupilId: string, envelope: ServerEnvelope) =>
    events.appendServer(sessionId, 'pupils_change', { class_id: classId, op: 'update', pupil_ids: [pupilId], fields: ['adaptations'], table: await shapeNow(tx, sessionId, classId) }, envelope, tx);
  const pupilIn = async (tx: Transaction, sessionId: string, classId: string, pupilId: string): Promise<Pupil | null> => {
    const r = await tx.execute({ sql: 'SELECT * FROM class_pupils WHERE session_id = ? AND class_id = ? AND id = ? AND archived_at IS NULL', args: [sessionId, classId, pupilId] });
    return r.rows[0] ? rowToPupil(r.rows[0]) : null;
  };
  const mine = async (tx: Transaction, sessionId: string, classId: string, id: string) => (await adaptationsOf(tx, sessionId, classId)).find((a) => a.id === id) ?? null;
  const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

  return {
    list: (sessionId, classId) => adaptationsOf(db, sessionId, classId),

    add(sessionId, classId, pupilId, pick, envelope) {
      return db.transaction(async (tx) => {
        if (!(await pupilIn(tx, sessionId, classId, pupilId))) return null;
        const theirs = (await adaptationsOf(tx, sessionId, classId)).filter((a) => a.pupil_id === pupilId);
        if (theirs.some((a) => a.entry_id === pick.entry_id)) throw conflict('the pupil already has that adaptation', 'adaptation_exists');
        if (theirs.length >= ADAPTATIONS_PER_PUPIL) throw conflict(`a pupil has at most ${ADAPTATIONS_PER_PUPIL} adaptations`, 'adaptations_full');
        const at = nowIso();
        const a: PupilAdaptation = { id: newUlid(), pupil_id: pupilId, entry_id: pick.entry_id, title: pick.title, changes_goal: pick.changes_goal, status: pick.status, overrides: orNull(pick.overrides), source_version: pick.source_version ?? null, created_at: at, updated_at: at };
        await tx.execute({
          sql: 'INSERT INTO pupil_adaptations (id, session_id, class_id, pupil_id, entry_id, title, changes_goal, status, overrides, source_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [a.id, sessionId, classId, pupilId, a.entry_id, a.title, a.changes_goal ? 1 : 0, a.status, a.overrides, a.source_version, at, at],
        });
        await log(tx, sessionId, classId, pupilId, envelope);
        return a;
      });
    },

    update(sessionId, classId, id, fields, envelope) {
      return db.transaction(async (tx) => {
        const a = await mine(tx, sessionId, classId, id);
        if (!a) return null;
        const next = { ...a, ...(fields.status ? { status: fields.status } : {}), ...(fields.overrides !== undefined ? { overrides: orNull(fields.overrides) } : {}) };
        if (next.status === a.status && next.overrides === a.overrides) return a;
        next.updated_at = nowIso();
        await tx.execute({ sql: 'UPDATE pupil_adaptations SET status = ?, overrides = ?, updated_at = ? WHERE id = ?', args: [next.status, next.overrides, next.updated_at, id] });
        await log(tx, sessionId, classId, a.pupil_id, envelope);
        return next;
      });
    },

    remove(sessionId, classId, id, envelope) {
      return db.transaction(async (tx) => {
        const a = await mine(tx, sessionId, classId, id);
        if (!a) return null;
        const at = nowIso();
        await tx.execute({ sql: 'UPDATE pupil_adaptations SET removed_at = ?, updated_at = ? WHERE id = ?', args: [at, at, id] });
        await log(tx, sessionId, classId, a.pupil_id, envelope);
        return { ...a, updated_at: at };
      });
    },
  };
}
