/**
 * The class or year group a chat is for, loaded for a turn: the message the model gets, and what
 * the gateway log keeps in place of the pupil table (option B, docs/classes.md).
 */
import type { Db } from '../db/client.js';
import { classMessage, yearGroupMessage, type ClassMessage } from '../gateway/class-message.js';
import { stageFacets, type StageFacets } from '@edw/shared';
import { adaptationsOf } from './adaptations.js';
import { curriculumOf } from './curriculum.js';
import { rowToClass, rowToPupil, rowToYearGroup } from './rows.js';
import { tablePlaceholder, tableShape } from './shape.js';

export interface ClassContext extends ClassMessage {
  /** Kept in the log in place of `table`. */
  placeholder: string | null;
  /** What the pedagogy library is filtered by for this chat (gateway/pedagogy-message.ts). */
  focus: PedagogyFocus;
}

export interface PedagogyFocus extends StageFacets {
  subject: string | null;
  /** Library adaptations chosen for the class's pupils and not stopped (only when the table goes to the model). */
  adaptationIds: string[];
  /** The class's curriculum codes it is working on now. */
  nowCodes: string[];
}

/** What of the class goes to the model beyond the class and its pupils: the workspace's curriculum and pedagogy switches (#64). */
export interface ClassParts {
  curriculum: boolean;
  /** The pupils' chosen adaptations (from the pedagogy library). */
  adaptations: boolean;
}

/** Null for a chat that is for no class or year group (or one since archived: it still reads as it was). */
export async function loadClassContext(db: Db, sessionId: string, thread: { class_id?: string | null; year_group_id?: string | null }, zeroRetention: boolean, parts: ClassParts): Promise<ClassContext | null> {
  if (!thread.class_id && !thread.year_group_id) return null;
  const yearGroup = async (id: string) => {
    const r = await db.execute('SELECT * FROM year_groups WHERE session_id = ? AND id = ?', [sessionId, id]);
    return r.rows[0] ? rowToYearGroup(r.rows[0]) : null;
  };
  const pupilsOf = async (classId: string) =>
    (await db.execute('SELECT * FROM class_pupils WHERE session_id = ? AND class_id = ? AND archived_at IS NULL ORDER BY position, id', [sessionId, classId])).rows.map(rowToPupil);

  if (thread.class_id) {
    const r = await db.execute('SELECT * FROM classes WHERE session_id = ? AND id = ?', [sessionId, thread.class_id]);
    if (!r.rows[0]) return null;
    const cls = rowToClass(r.rows[0]);
    const pupils = await pupilsOf(cls.id);
    const yg = await yearGroup(cls.year_group_id);
    const adaptations = parts.adaptations ? await adaptationsOf(db, sessionId, cls.id) : [];
    const curriculum = parts.curriculum ? await curriculumOf(db, sessionId, cls.id) : [];
    const m = classMessage(cls, yg, pupils, zeroRetention, { adaptations, curriculum });
    const focus: PedagogyFocus = {
      ...stageFacets(cls.stage, yg?.name),
      subject: cls.subject,
      adaptationIds: m.table ? [...new Set(adaptations.filter((a) => a.status !== 'stopped').map((a) => a.entry_id))] : [],
      nowCodes: curriculum.filter((i) => i.status === 'now').map((i) => i.code),
    };
    return { ...m, focus, placeholder: m.table ? tablePlaceholder(cls.id, tableShape(pupils, adaptations)) : null };
  }
  const yg = await yearGroup(thread.year_group_id!);
  if (!yg) return null;
  const list = (await db.execute('SELECT * FROM classes WHERE session_id = ? AND year_group_id = ? AND archived_at IS NULL ORDER BY created_at, id', [sessionId, yg.id])).rows.map(rowToClass);
  const withPupils = await Promise.all(list.map(async (c) => ({ ...c, pupils: await pupilsOf(c.id) })));
  return { ...yearGroupMessage(yg, withPupils), placeholder: null, focus: { ...stageFacets(yg.name), subject: null, adaptationIds: [], nowCodes: [] } };
}
