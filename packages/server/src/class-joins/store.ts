/**
 * Class codes and class members (issue #209). A class has at most one live code, kept plain so the
 * teacher can see it again; a pupil who signs in with it becomes a member, "Pupil N" in the class.
 *
 * Privacy: a member row links a pupil to a class and nothing else. The `class_code_set` event
 * carries ids and the action only: never the code, never a pupil.
 */
import { newUlid, nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Row, Transaction } from '../db/types.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { formatClassCode, newClassCode } from './codes.js';

export type MemberRole = 'pupil' | 'teacher_test';
export type CodeAction = 'make' | 'renew' | 'close';

export interface Member {
  id: string;
  session_id: string;
  class_id: string;
  pupil_id: string;
  role: MemberRole;
  /** The N in "Pupil N"; null for the teacher's test member. */
  number: number | null;
  joined_at: string;
}

/** The class a live code opens. */
export interface CodedClass {
  class_id: string;
  session_id: string;
  name: string;
  archived: boolean;
}

/** How a member is shown, everywhere: "Pupil 3", or "Test pupil" for the teacher's own. */
export function memberLabel(m: Pick<Member, 'role' | 'number'>): string {
  return m.role === 'teacher_test' ? 'Test pupil' : `Pupil ${m.number ?? '?'}`;
}

/** A membership with what the pupil's page needs of the class. */
export type MemberOfClass = Member & { class_name: string; archived: boolean };

const MEMBER_OF_CLASS = 'SELECT m.*, c.name AS class_name, c.archived_at FROM class_members m JOIN classes c ON c.id = m.class_id';
const rowToMemberOfClass = (r: Row): MemberOfClass => ({ ...rowToMember(r), class_name: String(r.class_name), archived: r.archived_at !== null });

export interface ClassJoinStore {
  /** The class's live code (`XXXX-XXXX`), or null. Undefined when the class is not this workspace's. */
  code(sessionId: string, classId: string): Promise<string | null | undefined>;
  /**
   * make: a code if the class has none (the one it has otherwise); renew: a new code, the old one
   * stops working; close: no code. Logs `class_code_set` when something changed. Undefined when
   * the class is not this workspace's, 'archived' to make or renew one for an archived class.
   */
  setCode(sessionId: string, classId: string, action: CodeAction, envelope: ServerEnvelope): Promise<string | null | undefined | 'archived'>;
  /** The class a code (canonical form) opens, or null when no class has it. */
  classForCode(canonical: string): Promise<CodedClass | null>;
  /** Puts the pupil in the class (the next number), or returns their membership if they are in it already. Throws on a second test member. */
  join(pupilId: string, c: Pick<CodedClass, 'class_id' | 'session_id'>, role?: MemberRole): Promise<Member>;
  /** The pupil's membership of the class, with the class's name and whether it is archived, or null. */
  member(pupilId: string, classId: string): Promise<MemberOfClass | null>;
  /** The class's pupils (not the teacher's test member), in the order they joined, with the provider they sign in with. */
  membersOf(sessionId: string, classId: string): Promise<(Member & { provider: string })[]>;
  /** The pupil's classes, with each class's name and whether it is archived. */
  classesOf(pupilId: string): Promise<MemberOfClass[]>;
}

export function rowToMember(r: Row): Member {
  return {
    id: String(r.id),
    session_id: String(r.session_id),
    class_id: String(r.class_id),
    pupil_id: String(r.pupil_id),
    role: r.role === 'teacher_test' ? 'teacher_test' : 'pupil',
    number: r.number === null || r.number === undefined ? null : Number(r.number),
    joined_at: String(r.joined_at),
  };
}

/**
 * The next "Pupil N" in a class: never a number given before, so a removed pupil's number is not
 * reused (#220). Past the highest number held now, and past as many as the class has ever
 * numbered: those still in it and its `removed_pupils` rows.
 */
async function nextNumber(tx: Transaction, classId: string): Promise<number> {
  const r = (
    await tx.execute({
      sql: `SELECT COALESCE(MAX(number), 0) AS top, COUNT(number) AS held, (SELECT COUNT(*) FROM removed_pupils WHERE class_id = ?) AS removed
            FROM class_members WHERE class_id = ?`,
      args: [classId, classId],
    })
  ).rows[0]!;
  return Math.max(Number(r.top), Number(r.held) + Number(r.removed)) + 1;
}

export function createClassJoinStore(db: Db, events: Pick<EventStore, 'appendServer'>): ClassJoinStore {
  const classRow = async (sessionId: string, classId: string) =>
    (await db.execute('SELECT archived_at FROM classes WHERE session_id = ? AND id = ?', [sessionId, classId])).rows[0];
  const member = async (pupilId: string, classId: string): Promise<MemberOfClass | null> => {
    const r = await db.execute(`${MEMBER_OF_CLASS} WHERE m.pupil_id = ? AND m.class_id = ?`, [pupilId, classId]);
    return r.rows[0] ? rowToMemberOfClass(r.rows[0]) : null;
  };

  return {
    async code(sessionId, classId) {
      if (!(await classRow(sessionId, classId))) return undefined;
      const r = await db.execute('SELECT code FROM class_codes WHERE class_id = ?', [classId]);
      return r.rows[0] ? formatClassCode(String(r.rows[0].code)) : null;
    },

    async setCode(sessionId, classId, action, envelope) {
      const c = await classRow(sessionId, classId);
      if (!c) return undefined;
      if (action !== 'close' && c.archived_at) return 'archived';
      return db.transaction(async (tx) => {
        const had = (await tx.execute({ sql: 'SELECT code FROM class_codes WHERE class_id = ?', args: [classId] })).rows[0];
        if (action === 'make' && had) return formatClassCode(String(had.code));
        if (action === 'close' && !had) return null;
        await tx.execute({ sql: 'DELETE FROM class_codes WHERE class_id = ?', args: [classId] });
        let code: string | null = null;
        if (action !== 'close') {
          code = newClassCode();
          await tx.execute({ sql: 'INSERT INTO class_codes (class_id, session_id, code, created_at) VALUES (?, ?, ?, ?)', args: [classId, sessionId, code, nowIso()] });
        }
        await events.appendServer(sessionId, 'class_code_set', { class_id: classId, action }, envelope, tx);
        return code && formatClassCode(code);
      });
    },

    async classForCode(canonical) {
      const r = await db.execute('SELECT c.id, c.session_id, c.name, c.archived_at FROM class_codes k JOIN classes c ON c.id = k.class_id WHERE k.code = ?', [canonical]);
      const row = r.rows[0];
      return row ? { class_id: String(row.id), session_id: String(row.session_id), name: String(row.name), archived: row.archived_at !== null } : null;
    },

    async join(pupilId, c, role = 'pupil') {
      // Looked for and added in one transaction, and a second join at the same moment does
      // nothing: the pupil keeps the one membership.
      await db.transaction(async (tx) => {
        const had = await tx.execute({ sql: 'SELECT 1 FROM class_members WHERE class_id = ? AND pupil_id = ?', args: [c.class_id, pupilId] });
        if (had.rows.length) return;
        const next = role === 'pupil' ? await nextNumber(tx, c.class_id) : null;
        await tx.execute({
          sql: `INSERT INTO class_members (id, session_id, class_id, pupil_id, role, number, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (class_id, pupil_id) DO NOTHING`,
          args: [newUlid(), c.session_id, c.class_id, pupilId, role, next === null ? null : Number(next), nowIso()],
        });
      });
      const made = await member(pupilId, c.class_id);
      if (!made) throw new Error('member not saved');
      return made;
    },

    member,

    async membersOf(sessionId, classId) {
      const r = await db.execute(
        "SELECT m.*, p.provider FROM class_members m JOIN pupils p ON p.id = m.pupil_id WHERE m.session_id = ? AND m.class_id = ? AND m.role = 'pupil' ORDER BY m.joined_at, m.id",
        [sessionId, classId],
      );
      return r.rows.map((row) => ({ ...rowToMember(row), provider: String(row.provider) }));
    },

    async classesOf(pupilId) {
      const r = await db.execute(`${MEMBER_OF_CLASS} WHERE m.pupil_id = ? ORDER BY m.joined_at, m.id`, [pupilId]);
      return r.rows.map(rowToMemberOfClass);
    },
  };
}
