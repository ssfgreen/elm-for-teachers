/**
 * Year groups and classes (docs/classes.md), each in a school and a school year. They belong to
 * the workspace for now (one teacher) and move to a teacher account with accounts. Every change
 * is logged in the same transaction as the write, with its full text, as projects are (a school's
 * name is not: schools.ts). Pupils are in pupils.ts; copying a class to next year in copy.ts.
 */
import type { Transaction } from '../db/types.js';
import { newUlid, nowIso, schoolYearOf, type ClassesList, type SchoolClass, type YearGroup } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { rowToClass, rowToPupil, rowToSchool, rowToYearGroup } from './rows.js';
import { createSchoolStore } from './schools.js';

export interface ClassFields {
  name?: string;
  stage?: string | null;
  subject?: string | null;
  note?: string | null;
  year_group_id?: string;
  /** One of the teacher's own classes (the sidebar), or not. */
  starred?: boolean;
}

export interface NewYearGroup {
  name: string;
  /** Default: the workspace's first school (made if there is none). */
  school_id?: string;
  /** Default: the school year today is in. */
  school_year?: string;
}

export interface NewClass {
  year_group_id: string;
  name: string;
  stage?: string | null;
  subject?: string | null;
  note?: string | null;
  starred?: boolean;
  copied_from?: string;
  demo?: boolean;
}

export interface ClassService {
  /** Every school, year group and class, archived ones too (marked), oldest first, with pupil counts. */
  list(sessionId: string): Promise<ClassesList>;
  yearGroup(sessionId: string, id: string, tx?: Transaction): Promise<YearGroup | null>;
  get(sessionId: string, id: string, tx?: Transaction): Promise<SchoolClass | null>;
  createYearGroup(sessionId: string, fields: NewYearGroup, envelope: ServerEnvelope, tx?: Transaction): Promise<YearGroup>;
  /** The open year group with this name in that school and year, or a new one. */
  yearGroupFor(tx: Transaction, sessionId: string, fields: Required<NewYearGroup>, envelope: ServerEnvelope): Promise<YearGroup>;
  /** Null when not this session's; logs only what changed. */
  updateYearGroup(sessionId: string, id: string, fields: { name?: string; note?: string | null }, envelope: ServerEnvelope): Promise<YearGroup | null>;
  archiveYearGroup(sessionId: string, id: string, envelope: ServerEnvelope): Promise<YearGroup | null>;
  /** 404 for a year group not this session's, 409 for an archived one. */
  /** In its year group's school and school year. */
  create(sessionId: string, fields: NewClass, envelope: ServerEnvelope, tx?: Transaction): Promise<SchoolClass>;
  update(sessionId: string, id: string, fields: ClassFields, envelope: ServerEnvelope): Promise<SchoolClass | null>;
  archive(sessionId: string, id: string, envelope: ServerEnvelope): Promise<SchoolClass | null>;
}

const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export function createClassService(db: Db, events: EventStore): ClassService {
  const schools = createSchoolStore(db, events);
  const one = async <T>(tx: Transaction | undefined, sql: string, args: string[], map: (r: never) => T): Promise<T | null> => {
    const r = tx ? await tx.execute({ sql, args }) : await db.execute(sql, args);
    return r.rows[0] ? map(r.rows[0] as never) : null;
  };
  const yearGroup = (sessionId: string, id: string, tx?: Transaction) => one(tx, 'SELECT * FROM year_groups WHERE session_id = ? AND id = ?', [sessionId, id], rowToYearGroup);
  const get = (sessionId: string, id: string, tx?: Transaction) => one(tx, 'SELECT * FROM classes WHERE session_id = ? AND id = ?', [sessionId, id], rowToClass);
  const inTx = <T>(tx: Transaction | undefined, work: (tx: Transaction) => Promise<T>) => (tx ? work(tx) : db.transaction(work));

  const insertYearGroup = async (tx: Transaction, sessionId: string, f: Required<NewYearGroup>, envelope: ServerEnvelope) => {
    const y: YearGroup = { id: newUlid(), session_id: sessionId, school_id: f.school_id, school_year: f.school_year, name: f.name.trim(), note: null, created_at: nowIso(), archived_at: null };
    await tx.execute({
      sql: 'INSERT INTO year_groups (id, session_id, school_id, school_year, name, note, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      args: [y.id, sessionId, y.school_id, y.school_year, y.name, y.created_at],
    });
    await events.appendServer(sessionId, 'year_group_create', { year_group_id: y.id, school_id: y.school_id, school_year: y.school_year, name: y.name }, envelope, tx);
    return y;
  };

  const openYearGroup = async (tx: Transaction, sessionId: string, id: string) => {
    const y = await yearGroup(sessionId, id, tx);
    if (!y) throw notFound('year group');
    if (y.archived_at) throw conflict('that year group is archived', 'year_group_archived');
    return y;
  };

  return {
    async list(sessionId) {
      const [ss, ys, cs, ps] = await Promise.all([
        db.execute('SELECT * FROM schools WHERE session_id = ? ORDER BY created_at, id', [sessionId]),
        db.execute('SELECT * FROM year_groups WHERE session_id = ? ORDER BY created_at, id', [sessionId]),
        db.execute('SELECT * FROM classes WHERE session_id = ? ORDER BY created_at, id', [sessionId]),
        db.execute('SELECT * FROM class_pupils WHERE session_id = ? AND archived_at IS NULL', [sessionId]),
      ]);
      const pupils = ps.rows.map(rowToPupil);
      return {
        schools: ss.rows.map(rowToSchool),
        year_groups: ys.rows.map(rowToYearGroup),
        classes: cs.rows.map(rowToClass).map((c) => {
          const mine = pupils.filter((p) => p.class_id === c.id);
          // Needs are no longer shown (#243). The field stays so open tabs still parse; a later clean-up can remove it.
          return { ...c, pupil_count: mine.length, needs_counts: {} };
        }),
      };
    },

    yearGroup,
    get,

    createYearGroup(sessionId, fields, envelope, outer) {
      return inTx(outer, async (tx) => {
        const school = await schools.resolve(tx, sessionId, fields.school_id, envelope);
        return insertYearGroup(tx, sessionId, { name: fields.name, school_id: school.id, school_year: fields.school_year ?? schoolYearOf(new Date()) }, envelope);
      });
    },

    async yearGroupFor(tx, sessionId, fields, envelope) {
      const r = await tx.execute({
        sql: 'SELECT * FROM year_groups WHERE session_id = ? AND school_id = ? AND school_year = ? AND name = ? AND archived_at IS NULL ORDER BY created_at LIMIT 1',
        args: [sessionId, fields.school_id, fields.school_year, fields.name],
      });
      return r.rows[0] ? rowToYearGroup(r.rows[0]) : insertYearGroup(tx, sessionId, fields, envelope);
    },

    updateYearGroup(sessionId, id, fields, envelope) {
      return db.transaction(async (tx) => {
        const y = await yearGroup(sessionId, id, tx);
        if (!y) return null;
        const changed: { name?: string; note?: string | null } = {};
        if (fields.name !== undefined && fields.name.trim() && fields.name.trim() !== y.name) changed.name = fields.name.trim();
        if (fields.note !== undefined && orNull(fields.note) !== y.note) changed.note = orNull(fields.note);
        if (Object.keys(changed).length === 0) return y;
        const next = { ...y, ...changed };
        await tx.execute({ sql: 'UPDATE year_groups SET name = ?, note = ? WHERE id = ?', args: [next.name, next.note, id] });
        await events.appendServer(sessionId, 'year_group_update', { year_group_id: id, ...changed }, envelope, tx);
        return next;
      });
    },

    archiveYearGroup(sessionId, id, envelope) {
      return db.transaction(async (tx) => {
        const y = await yearGroup(sessionId, id, tx);
        if (!y || y.archived_at) return y;
        const at = nowIso();
        await tx.execute({ sql: 'UPDATE year_groups SET archived_at = ? WHERE id = ?', args: [at, id] });
        await events.appendServer(sessionId, 'year_group_archive', { year_group_id: id }, envelope, tx);
        return { ...y, archived_at: at };
      });
    },

    create(sessionId, fields, envelope, outer) {
      return inTx(outer, async (tx) => {
        const y = await openYearGroup(tx, sessionId, fields.year_group_id);
        const at = nowIso();
        const c: SchoolClass = {
          id: newUlid(),
          session_id: sessionId,
          school_id: y.school_id,
          school_year: y.school_year,
          year_group_id: y.id,
          name: fields.name.trim(),
          stage: orNull(fields.stage),
          subject: orNull(fields.subject),
          note: orNull(fields.note),
          starred_at: fields.starred ? at : null,
          copied_from: fields.copied_from ?? null,
          created_at: at,
          archived_at: null,
        };
        await tx.execute({
          sql: 'INSERT INTO classes (id, session_id, school_id, school_year, year_group_id, name, stage, subject, note, starred_at, copied_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [c.id, sessionId, c.school_id, c.school_year, c.year_group_id, c.name, c.stage, c.subject, c.note, c.starred_at, c.copied_from, c.created_at],
        });
        await events.appendServer(
          sessionId,
          'class_create',
          {
            class_id: c.id,
            year_group_id: c.year_group_id,
            school_id: c.school_id,
            school_year: c.school_year,
            name: c.name,
            stage: c.stage,
            subject: c.subject,
            ...(c.copied_from ? { copied_from: c.copied_from } : {}),
            ...(fields.demo ? { demo: true } : {}),
          },
          envelope,
          tx,
        );
        if (c.note || c.starred_at) await events.appendServer(sessionId, 'class_update', { class_id: c.id, ...(c.note ? { note: c.note } : {}), ...(c.starred_at ? { starred: true } : {}) }, envelope, tx);
        return c;
      });
    },

    update(sessionId, id, fields, envelope) {
      return db.transaction(async (tx) => {
        const c = await get(sessionId, id, tx);
        if (!c) return null;
        const changed: ClassFields = {};
        if (fields.name !== undefined && fields.name.trim() && fields.name.trim() !== c.name) changed.name = fields.name.trim();
        for (const k of ['stage', 'subject', 'note'] as const) {
          if (fields[k] !== undefined && orNull(fields[k]) !== c[k]) changed[k] = orNull(fields[k]);
        }
        let place = { school_id: c.school_id, school_year: c.school_year };
        if (fields.year_group_id !== undefined && fields.year_group_id !== c.year_group_id) {
          const y = await openYearGroup(tx, sessionId, fields.year_group_id);
          changed.year_group_id = y.id;
          // A class is in its year group's school and school year.
          place = { school_id: y.school_id, school_year: y.school_year };
        }
        if (fields.starred !== undefined && fields.starred !== !!c.starred_at) changed.starred = fields.starred;
        if (Object.keys(changed).length === 0) return c;
        const { starred, ...rest } = changed;
        const next: SchoolClass = { ...c, ...rest, ...place, starred_at: starred === undefined ? c.starred_at : starred ? nowIso() : null };
        await tx.execute({
          sql: 'UPDATE classes SET name = ?, stage = ?, subject = ?, note = ?, year_group_id = ?, school_id = ?, school_year = ?, starred_at = ? WHERE id = ?',
          args: [next.name, next.stage, next.subject, next.note, next.year_group_id, next.school_id, next.school_year, next.starred_at, id],
        });
        await events.appendServer(sessionId, 'class_update', { class_id: id, ...changed }, envelope, tx);
        return next;
      });
    },

    archive(sessionId, id, envelope) {
      return db.transaction(async (tx) => {
        const c = await get(sessionId, id, tx);
        if (!c || c.archived_at) return c;
        const at = nowIso();
        await tx.execute({ sql: 'UPDATE classes SET archived_at = ? WHERE id = ?', args: [at, id] });
        await events.appendServer(sessionId, 'class_archive', { class_id: id }, envelope, tx);
        return { ...c, archived_at: at };
      });
    },
  };
}
