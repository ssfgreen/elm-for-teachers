/**
 * The class or year group a chat is for, loaded for a turn: the message the model gets, and what
 * the gateway log keeps in place of the pupil table (option B, docs/classes.md).
 */
import type { Db } from '../db/client.js';
import { classMessage, needsGroupMessage, yearGroupMessage, type ClassMessage } from '../gateway/class-message.js';
import { stageFacets, type StageFacets } from '@edw/shared';
import { getNeedsGroup, needsGroupsForClass } from '../needs-groups/store.js';
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
  /** Library adaptations chosen for the class's pupils or needs groups and not stopped. */
  adaptationIds: string[];
  /** The class's curriculum codes it is working on now. */
  nowCodes: string[];
}

/** What of the class goes to the model beyond the class and its pupils: the workspace's switches (#64). */
export interface ClassParts {
  /** Include class/year-group context (defaults to true). */
  classes?: boolean;
  curriculum: boolean;
  /** Chosen adaptations (from the pedagogy library). */
  adaptations: boolean;
  /** Needs groups attached to the class or targeted by the thread (defaults to true). */
  needsGroups?: boolean;
}

/** Null for a chat that is for no class, year group or needs group. */
export async function loadClassContext(
  db: Db,
  sessionId: string,
  thread: { class_id?: string | null; year_group_id?: string | null; needs_group_id?: string | null },
  zeroRetention: boolean,
  parts: ClassParts,
): Promise<ClassContext | null> {
  const classesOn = parts.classes !== false;
  const needsGroupsOn = parts.needsGroups !== false;
  if (!thread.class_id && !thread.year_group_id && !thread.needs_group_id) return null;

  const yearGroup = async (id: string) => {
    const r = await db.execute('SELECT * FROM year_groups WHERE session_id = ? AND id = ?', [sessionId, id]);
    return r.rows[0] ? rowToYearGroup(r.rows[0]) : null;
  };
  const pupilsOf = async (classId: string) =>
    (await db.execute('SELECT * FROM class_pupils WHERE session_id = ? AND class_id = ? AND archived_at IS NULL ORDER BY position, id', [sessionId, classId])).rows.map(rowToPupil);

  if (thread.class_id && classesOn) {
    const r = await db.execute('SELECT * FROM classes WHERE session_id = ? AND id = ?', [sessionId, thread.class_id]);
    if (!r.rows[0]) return null;
    const cls = rowToClass(r.rows[0]);
    const pupils = await pupilsOf(cls.id);
    const yg = await yearGroup(cls.year_group_id);
    const adaptations = parts.adaptations ? await adaptationsOf(db, sessionId, cls.id) : [];
    const curriculum = parts.curriculum ? await curriculumOf(db, sessionId, cls.id) : [];
    const needsGroups = needsGroupsOn
      ? thread.needs_group_id
        ? [await getNeedsGroup(db, sessionId, thread.needs_group_id)].filter((g): g is NonNullable<typeof g> => g !== null)
        : await needsGroupsForClass(db, sessionId, cls.id)
      : [];
    const m = classMessage(cls, yg, pupils, zeroRetention, {
      adaptations,
      curriculum,
      needsGroups,
      includeNeedsGroupAdaptations: parts.adaptations,
    });
    const pupilIds = m.table ? adaptations.filter((a) => a.status !== 'stopped').map((a) => a.entry_id) : [];
    const groupIds = parts.adaptations
      ? needsGroups.flatMap((g) => g.adaptations.filter((a) => a.status !== 'stopped').map((a) => a.entry_id))
      : [];
    const focus: PedagogyFocus = {
      ...stageFacets(cls.stage, yg?.name),
      subject: cls.subject,
      adaptationIds: [...new Set([...pupilIds, ...groupIds])],
      nowCodes: curriculum.filter((i) => i.status === 'now').map((i) => i.code),
    };
    return { ...m, focus, placeholder: m.table ? tablePlaceholder(cls.id, tableShape(pupils, adaptations)) : null };
  }

  if (thread.needs_group_id && needsGroupsOn) {
    const group = await getNeedsGroup(db, sessionId, thread.needs_group_id);
    if (!group) return null;
    const m = needsGroupMessage(group, parts.adaptations);
    const adaptationIds = parts.adaptations
      ? [...new Set(group.adaptations.filter((a) => a.status !== 'stopped').map((a) => a.entry_id))]
      : [];
    return { ...m, placeholder: null, focus: { stage: null, level: null, subject: null, adaptationIds, nowCodes: [] } };
  }

  if (thread.year_group_id && classesOn) {
    const yg = await yearGroup(thread.year_group_id);
    if (!yg) return null;
    const list = (await db.execute('SELECT * FROM classes WHERE session_id = ? AND year_group_id = ? AND archived_at IS NULL ORDER BY created_at, id', [sessionId, yg.id])).rows.map(rowToClass);
    const withPupils = await Promise.all(list.map(async (c) => ({ ...c, pupils: await pupilsOf(c.id) })));
    return { ...yearGroupMessage(yg, withPupils), placeholder: null, focus: { ...stageFacets(yg.name), subject: null, adaptationIds: [], nowCodes: [] } };
  }

  return null;
}
