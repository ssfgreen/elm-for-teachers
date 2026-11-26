/**
 * classes.json in the research bundle: schools by id only (no name: Sam, 12 Nov 2026), year
 * groups and classes in full, and each class's pupil table only as its shape (option B,
 * docs/classes.md), with the adaptations chosen for pupils in that shape's hash, and each
 * class's curriculum items in full. A database from before migration 0022 has no tables, and so
 * no classes.
 */
import type { Db } from '../db/client.js';
import { rowToClass, rowToPupil, rowToSchool, rowToYearGroup } from './rows.js';
import { rowToAdaptation } from './adaptations.js';
import { rowToCurriculum } from './curriculum.js';
import { tableShape } from './shape.js';

export async function classesForBundle(db: Db, sessionId: string) {
  const has = (await db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'classes'")).rows.length > 0;
  if (!has) return { schools: [], year_groups: [], classes: [] };
  const ss = await db.execute('SELECT * FROM schools WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
  const ys = await db.execute('SELECT * FROM year_groups WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
  const cs = await db.execute('SELECT * FROM classes WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
  const ps = (await db.execute('SELECT * FROM class_pupils WHERE session_id = ? AND archived_at IS NULL ORDER BY position, id', [sessionId])).rows.map(rowToPupil);
  // Migration 0023: adaptations (part of the table's shape) and each class's curriculum (in full: the curriculum's words).
  const has23 = (await db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pupil_adaptations'")).rows.length > 0;
  const as = has23 ? (await db.execute('SELECT * FROM pupil_adaptations WHERE session_id = ? AND removed_at IS NULL ORDER BY created_at, rowid', [sessionId])).rows.map(rowToAdaptation) : [];
  const cur = has23 ? (await db.execute("SELECT * FROM class_curriculum WHERE session_id = ? AND owner_kind = 'class' AND removed_at IS NULL ORDER BY created_at, rowid", [sessionId])).rows.map(rowToCurriculum) : [];
  return {
    schools: ss.rows.map(rowToSchool).map(({ id, demo, created_at, archived_at }) => ({ id, demo, created_at, archived_at })),
    year_groups: ys.rows.map(rowToYearGroup),
    classes: cs.rows.map(rowToClass).map((c) => {
      const pupils = ps.filter((p) => p.class_id === c.id);
      const ids = new Set(pupils.map((p) => p.id));
      return { ...c, pupil_table: tableShape(pupils, as.filter((a) => ids.has(a.pupil_id))), curriculum: cur.filter((x) => x.class_id === c.id) };
    }),
  };
}
