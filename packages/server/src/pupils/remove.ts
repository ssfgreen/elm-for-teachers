/**
 * A teacher removes one pupil from one class (issue #220, question 91's default). One transaction:
 *
 *   - one `removed_pupils` row for the class: a new random id, the workspace, the class, the day;
 *   - tables keyed by the membership: keep-anonymised rows move to the new id, delete rows go
 *     (before the membership, as a table may have a foreign key to `class_members`);
 *   - tables keyed by the pupil that have a `class_id`: this class's rows only (so the
 *     `class_members` row goes, and keep-anonymised rows of other classes stay as they are);
 *   - if the pupil has no class left, the rest goes as `forgetPupil` does: sign-ins, then the
 *     `pupils` row, so their sign-in cookie stops working;
 *   - logged as `class_pupil_remove` with the class id only.
 *
 * Reads `PUPIL_TABLES` (tables.ts) and does not change it. The test member is not removed here:
 * it is the teacher's own.
 */
import { newUlid } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Transaction } from '../db/types.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { PUPIL_TABLES, type PupilTable } from './tables.js';

export type RemoveResult = 'removed' | 'not_found' | 'test_pupil';

async function hasClassId(tx: Transaction, table: string): Promise<boolean> {
  return (await tx.execute(`PRAGMA table_info("${table}")`)).rows.some((c) => String(c.name) === 'class_id');
}

/**
 * Remove the member from the class. `not_found` when the class is not this workspace's or the
 * member not in it; `test_pupil` for the teacher's test member. `tables` is for tests.
 */
export async function removeMember(
  db: Db,
  events: Pick<EventStore, 'appendServer'>,
  sessionId: string,
  classId: string,
  memberId: string,
  envelope: ServerEnvelope,
  tables: readonly PupilTable[] = PUPIL_TABLES,
): Promise<RemoveResult> {
  return db.transaction(async (tx) => {
    // Read inside the write transaction, so a second Remove at the same moment finds nothing.
    const m = (await tx.execute({ sql: 'SELECT pupil_id, role FROM class_members WHERE id = ? AND class_id = ? AND session_id = ?', args: [memberId, classId, sessionId] })).rows[0];
    if (!m) return 'not_found';
    if (m.role === 'teacher_test') return 'test_pupil';
    const pupilId = String(m.pupil_id);
    const anon = newUlid();
    await tx.execute({ sql: 'INSERT INTO removed_pupils (id, session_id, class_id, removed_on) VALUES (?, ?, ?, ?)', args: [anon, sessionId, classId, new Date().toISOString().slice(0, 10)] });

    const byMember = tables.filter((t) => t.keyedBy === 'member');
    const byPupil = tables.filter((t) => t.keyedBy === 'pupil');
    for (const t of byMember) {
      const sql = t.onRemove === 'keep-anonymised' ? `UPDATE "${t.table}" SET "${t.column}" = ? WHERE "${t.column}" = ?` : `DELETE FROM "${t.table}" WHERE "${t.column}" = ?`;
      await tx.execute({ sql, args: t.onRemove === 'keep-anonymised' ? [anon, memberId] : [memberId] });
    }
    for (const t of byPupil) {
      if (!(await hasClassId(tx, t.table))) continue;
      const where = `"${t.column}" = ? AND class_id = ?`;
      if (t.onRemove === 'keep-anonymised') await tx.execute({ sql: `UPDATE "${t.table}" SET "${t.column}" = ? WHERE ${where}`, args: [anon, pupilId, classId] });
      else await tx.execute({ sql: `DELETE FROM "${t.table}" WHERE ${where}`, args: [pupilId, classId] });
    }

    const left = (await tx.execute({ sql: 'SELECT 1 FROM class_members WHERE pupil_id = ? LIMIT 1', args: [pupilId] })).rows.length;
    if (!left) {
      // No class left: as forgetPupil, every row that still names the pupil goes, `pupils` last.
      for (const t of byPupil) await tx.execute({ sql: `DELETE FROM "${t.table}" WHERE "${t.column}" = ?`, args: [pupilId] });
    }
    await events.appendServer(sessionId, 'class_pupil_remove', { class_id: classId }, envelope, tx);
    return 'removed';
  });
}
