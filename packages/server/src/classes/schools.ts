/**
 * The teacher's schools. A workspace has one until the teacher adds another (a supply teacher,
 * or one who works in two). The name stays with the teacher: events and the export have only the
 * id (Sam, 12 Nov 2026), as a school's name with a class and a count of needs could point to a child.
 */
import type { Transaction } from '../db/types.js';
import { newUlid, nowIso, type School } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { rowToSchool } from './rows.js';

/** What a workspace's first school is called until the teacher names it. */
export const FIRST_SCHOOL_NAME = 'My school';

export function createSchoolStore(db: Db, events: EventStore) {
  const get = async (tx: Transaction, sessionId: string, id: string) => {
    const r = await tx.execute({ sql: 'SELECT * FROM schools WHERE session_id = ? AND id = ?', args: [sessionId, id] });
    return r.rows[0] ? rowToSchool(r.rows[0]) : null;
  };

  const create = async (tx: Transaction, sessionId: string, name: string, envelope: ServerEnvelope, demo = false): Promise<School> => {
    const school: School = { id: newUlid(), session_id: sessionId, name: name.trim(), demo, created_at: nowIso(), archived_at: null };
    await tx.execute({ sql: 'INSERT INTO schools (id, session_id, name, demo, created_at) VALUES (?, ?, ?, ?, ?)', args: [school.id, sessionId, school.name, demo ? 1 : 0, school.created_at] });
    await events.appendServer(sessionId, 'school_create', { school_id: school.id }, envelope, tx);
    return school;
  };

  return {
    create: (sessionId: string, name: string, envelope: ServerEnvelope) => db.transaction((tx) => create(tx, sessionId, name, envelope)),
    /** The same, inside a transaction already open. */
    createIn: create,

    /** Null when not this session's. */
    rename: (sessionId: string, id: string, name: string, envelope: ServerEnvelope) =>
      db.transaction(async (tx) => {
        const s = await get(tx, sessionId, id);
        if (!s || s.name === name.trim()) return s;
        await tx.execute({ sql: 'UPDATE schools SET name = ? WHERE id = ?', args: [name.trim(), id] });
        await events.appendServer(sessionId, 'school_rename', { school_id: id }, envelope, tx);
        return { ...s, name: name.trim() };
      }),

    /**
     * The school a new year group goes in: the one named (404 if not this session's, 409 if
     * archived), else the workspace's first open school that is not the demo's, else a new one
     * called "My school".
     */
    resolve: async (tx: Transaction, sessionId: string, id: string | undefined, envelope: ServerEnvelope, name = FIRST_SCHOOL_NAME): Promise<School> => {
      if (id) {
        const s = await get(tx, sessionId, id);
        if (!s) throw notFound('school');
        if (s.archived_at) throw conflict('that school is archived', 'school_archived');
        return s;
      }
      const r = await tx.execute({ sql: 'SELECT * FROM schools WHERE session_id = ? AND archived_at IS NULL AND demo = 0 ORDER BY created_at, id LIMIT 1', args: [sessionId] });
      return r.rows[0] ? rowToSchool(r.rows[0]) : create(tx, sessionId, name, envelope);
    },
  };
}

export type SchoolStore = ReturnType<typeof createSchoolStore>;
