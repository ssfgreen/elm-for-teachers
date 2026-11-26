/**
 * Every table that holds something of a pupil, and what Remove does to it (question 91, the
 * default: delete the pupil, keep an anonymised record of their usage under a new random id with
 * the workspace and class only). One table per line; `tables.test.ts` fails when a table that
 * `pupilColumns` finds is missing here.
 *
 * A table is keyed by the pupil (`pupils.id`) or by their membership of a class
 * (`class_members.id`). On Remove:
 *
 *   delete           the rows go.
 *   keep-anonymised  the rows stay, with the column set to the new random id of the pupil's
 *                    `removed_pupils` row for that class. Foreign keys are on (db/client.ts), so
 *                    such a table has no foreign key on that column: it is found by its name
 *                    (`pupil_id` or `member_id`) instead. A pupil-keyed one needs a `class_id`.
 *                    The pupil reader's activity is kept this way, keyed by membership:
 *                    `reader_highlights` (R1) and `reader_asks` (R2; its words in
 *                    `reader_ask_texts` hang on the ask, not the pupil, and stay too).
 *
 * `pupil_logins` (#223) is keyed by pupil once used; one never used has no pupil, and goes with its workspace (SESSION_TABLES).
 */
import { newUlid } from '@edw/shared';
import type { Db } from '../db/client.js';

export type OnRemove = 'delete' | 'keep-anonymised';
export type KeyedBy = 'pupil' | 'member';

export interface PupilTable {
  table: string;
  /** The column that names the pupil (`pupils.id`) or the membership (`class_members.id`). */
  column: string;
  keyedBy: KeyedBy;
  onRemove: OnRemove;
}

export const PUPIL_TABLES: readonly PupilTable[] = [
  { table: 'reader_asks', column: 'member_id', keyedBy: 'member', onRemove: 'keep-anonymised' },
  { table: 'reader_highlights', column: 'member_id', keyedBy: 'member', onRemove: 'keep-anonymised' },
  { table: 'pupil_sign_ins', column: 'pupil_id', keyedBy: 'pupil', onRemove: 'delete' },
  { table: 'class_members', column: 'pupil_id', keyedBy: 'pupil', onRemove: 'delete' },
  { table: 'pupil_logins', column: 'pupil_id', keyedBy: 'pupil', onRemove: 'delete' },
  { table: 'pupils', column: 'id', keyedBy: 'pupil', onRemove: 'delete' },
];

export interface PupilColumn {
  table: string;
  column: string;
  keyedBy: KeyedBy;
  /** Whether the column has a foreign key (to `pupils` or `class_members`). */
  foreignKey: boolean;
}

/**
 * Every column in the database that names a pupil or a membership: a foreign key to `pupils` or
 * `class_members`, or a column called `pupil_id` or `member_id` with no foreign key at all (a
 * `pupil_id` pointing elsewhere, such as at `class_pupils`, is the teacher's table, not a pupil).
 */
export async function pupilColumns(db: Db): Promise<PupilColumn[]> {
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => String(r.name));
  const found: PupilColumn[] = [];
  for (const table of tables) {
    const keys = new Map((await db.execute(`PRAGMA foreign_key_list("${table}")`)).rows.map((k) => [String(k.from), String(k.table)]));
    for (const col of (await db.execute(`PRAGMA table_info("${table}")`)).rows.map((c) => String(c.name))) {
      const to = keys.get(col);
      if (to === 'pupils') found.push({ table, column: col, keyedBy: 'pupil', foreignKey: true });
      else if (to === 'class_members') found.push({ table, column: col, keyedBy: 'member', foreignKey: true });
      else if (to === undefined && col === 'pupil_id') found.push({ table, column: col, keyedBy: 'pupil', foreignKey: false });
      else if (to === undefined && col === 'member_id') found.push({ table, column: col, keyedBy: 'member', foreignKey: false });
    }
  }
  return found;
}

/**
 * Forget a pupil: one `removed_pupils` row for each class they were in, then each table in turn,
 * those keyed by membership first (they need `class_members` still there). Returns the new random
 * ids, by class. `tables` is for tests.
 */
export async function forgetPupil(db: Db, pupilId: string, tables: readonly PupilTable[] = PUPIL_TABLES): Promise<Record<string, string>> {
  return db.transaction(async (tx) => {
    const members = (await tx.execute({ sql: 'SELECT id, session_id, class_id FROM class_members WHERE pupil_id = ?', args: [pupilId] })).rows;
    const day = new Date().toISOString().slice(0, 10);
    const anon: Record<string, string> = {};
    for (const m of members) {
      const id = newUlid();
      anon[String(m.class_id)] = id;
      await tx.execute({ sql: 'INSERT INTO removed_pupils (id, session_id, class_id, removed_on) VALUES (?, ?, ?, ?)', args: [id, String(m.session_id), String(m.class_id), day] });
    }
    const ordered = [...tables.filter((t) => t.keyedBy === 'member'), ...tables.filter((t) => t.keyedBy === 'pupil')];
    for (const t of ordered) {
      const col = `"${t.table}"."${t.column}"`;
      if (t.keyedBy === 'member') {
        if (t.onRemove === 'keep-anonymised') {
          for (const m of members) await tx.execute({ sql: `UPDATE "${t.table}" SET "${t.column}" = ? WHERE ${col} = ?`, args: [anon[String(m.class_id)]!, String(m.id)] });
        }
        await tx.execute({ sql: `DELETE FROM "${t.table}" WHERE ${col} IN (SELECT id FROM class_members WHERE pupil_id = ?)`, args: [pupilId] });
        continue;
      }
      if (t.onRemove === 'keep-anonymised') {
        for (const [classId, id] of Object.entries(anon)) {
          await tx.execute({ sql: `UPDATE "${t.table}" SET "${t.column}" = ? WHERE ${col} = ? AND class_id = ?`, args: [id, pupilId, classId] });
        }
      }
      // Rows of a class the pupil had already left have no record to go to.
      await tx.execute({ sql: `DELETE FROM "${t.table}" WHERE ${col} = ?`, args: [pupilId] });
    }
    return anon;
  });
}
