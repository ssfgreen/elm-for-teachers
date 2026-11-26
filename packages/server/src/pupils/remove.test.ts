/** Removing a pupil from a class (#220): what goes, what stays under the new id, and what is logged. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';
import { BASE, classIn, pupilIn, readerApp, readingIn } from '../reader/test-reading.js';
import { pupilCookieNames } from './cookies.js';
import { envelopeFor, tempDb, type TempDb } from '../test-helpers.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { createPupilStore } from './store.js';
import { readingWorld } from '../reader-asks/test-reading.js';
import { removeMember } from './remove.js';
import { PUPIL_TABLES, type PupilTable } from './tables.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;

beforeEach(async () => {
  t = await tempDb();
  ({ deps, app } = await readerApp(t));
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

type Class = Awaited<ReturnType<typeof classIn>>;
const env = envelopeFor(null, null, 'none');
const remove = (c: Class, memberId: string, tables?: readonly PupilTable[]) => removeMember(t.db, deps.events, c.session.session_id, c.cls.id, memberId, env, tables);
const rows = async (sql: string, args: unknown[] = []) => (await t.db.execute(sql, args as never)).rows;
const highlight = (readingId: string, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/pupil/readings/${readingId}/highlights`, headers, payload: { block_id: 'b_para', start: 0, end: 4, category: null } });

describe('removeMember', () => {
  it('from one of two classes: that membership goes, its highlights move to one new id, the other class is untouched', async () => {
    const a = await classIn(deps, { name: 'A' });
    const b = await classIn(deps, { name: 'B' });
    const ra = await readingIn(deps, a);
    const rb = await readingIn(deps, b);
    const { pupil, members, headers } = await pupilIn(deps, a, b);
    expect((await highlight(ra, headers)).statusCode).toBe(201);
    expect((await highlight(rb, headers)).statusCode).toBe(201);

    expect(await remove(a, members[0]!.id)).toBe('removed');

    const removed = await rows('SELECT * FROM removed_pupils');
    expect(removed).toHaveLength(1);
    expect([removed[0]!.session_id, removed[0]!.class_id]).toEqual([a.session.session_id, a.cls.id]);
    const anon = String(removed[0]!.id);
    expect((await rows('SELECT member_id FROM reader_highlights WHERE reading_id = ?', [ra])).map((r) => r.member_id)).toEqual([anon]);
    expect((await rows('SELECT member_id FROM reader_highlights WHERE reading_id = ?', [rb])).map((r) => r.member_id)).toEqual([members[1]!.id]);
    expect((await rows('SELECT class_id FROM class_members WHERE pupil_id = ?', [pupil.id])).map((r) => r.class_id)).toEqual([b.cls.id]);
    expect(await rows('SELECT 1 FROM pupils WHERE id = ?', [pupil.id])).toHaveLength(1);

    // requireMember: A refuses them, B still lets them in.
    expect((await app.inject({ url: `/api/pupil/readings/${ra}`, headers })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/pupil/readings/${rb}`, headers })).statusCode).toBe(200);
  });

  it('from their last class: the database is as forgetPupil leaves it, and the sign-in cookie gets 401', async () => {
    const a = await classIn(deps);
    const { pupil, members, headers } = await pupilIn(deps, a);
    expect(await remove(a, members[0]!.id)).toBe('removed');
    for (const p of PUPIL_TABLES.filter((x) => x.keyedBy === 'pupil')) expect(await rows(`SELECT 1 FROM "${p.table}" WHERE "${p.column}" = ?`, [pupil.id])).toHaveLength(0);
    expect(await rows('SELECT 1 FROM class_members WHERE id = ?', [members[0]!.id])).toHaveLength(0);
    expect(await rows('SELECT 1 FROM removed_pupils WHERE class_id = ?', [a.cls.id])).toHaveLength(1);
    expect((await app.inject({ url: '/api/pupil/readings', headers })).statusCode).toBe(401);
  });

  it('deletes a member-keyed table with a foreign key before the membership, and leaves another class’s keep-anonymised pupil rows', async () => {
    await t.db.execute('CREATE TABLE t_member_fk (member_id TEXT NOT NULL REFERENCES class_members(id), n INTEGER)');
    await t.db.execute('CREATE TABLE t_pupil_anon (pupil_id TEXT, class_id TEXT, n INTEGER)');
    const tables: PupilTable[] = [
      { table: 't_member_fk', column: 'member_id', keyedBy: 'member', onRemove: 'delete' },
      { table: 't_pupil_anon', column: 'pupil_id', keyedBy: 'pupil', onRemove: 'keep-anonymised' },
      ...PUPIL_TABLES,
    ];
    const a = await classIn(deps, { name: 'A' });
    const b = await classIn(deps, { name: 'B' });
    const { pupil, members } = await pupilIn(deps, a, b);
    await t.db.execute('INSERT INTO t_member_fk VALUES (?, 1)', [members[0]!.id]);
    await t.db.execute('INSERT INTO t_member_fk VALUES (?, 2)', [members[1]!.id]);
    await t.db.execute('INSERT INTO t_pupil_anon VALUES (?, ?, 3)', [pupil.id, a.cls.id]);
    await t.db.execute('INSERT INTO t_pupil_anon VALUES (?, ?, 4)', [pupil.id, b.cls.id]);

    expect(await remove(a, members[0]!.id, tables)).toBe('removed');

    const anon = String((await rows('SELECT id FROM removed_pupils'))[0]!.id);
    expect((await rows('SELECT n FROM t_member_fk')).map((r) => r.n)).toEqual([2]);
    expect((await rows('SELECT pupil_id, n FROM t_pupil_anon ORDER BY n')).map((r) => [r.pupil_id, r.n])).toEqual([
      [anon, 3],
      [pupil.id, 4],
    ]);
  });

  it('keeps the pupil’s asks with their passage and reply under the new id, and no row anywhere still holds the pupil or the membership (question 105)', async () => {
    const w = await readingWorld(deps);
    const asked = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { origin: BASE, cookie: `${pupilCookieNames(BASE).signIn}=${w.pupil.cookie.split('=')[1]}` }, payload: { prompt_id: w.explain.id, highlighted_text: 'roads were straight' } });
    expect(asked.statusCode).toBe(200);
    const askId = String(asked.json().ask.id);

    expect(await removeMember(t.db, deps.events, w.sid, w.cls.id, w.pupil.member.id, env)).toBe('removed');

    const anon = String((await rows('SELECT id FROM removed_pupils WHERE class_id = ?', [w.cls.id]))[0]!.id);
    expect((await rows('SELECT member_id FROM reader_asks WHERE id = ?', [askId])).map((r) => r.member_id)).toEqual([anon]);
    expect((await rows('SELECT highlighted_text FROM reader_ask_texts WHERE ask_id = ?', [askId])).map((r) => r.highlighted_text)).toEqual(['roads were straight']);
    const tables = (await rows("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => String(r.name));
    for (const table of tables) {
      const all = JSON.stringify(await rows(`SELECT * FROM "${table}"`));
      expect([table, all.includes(w.pupil.pupil.id), all.includes(w.pupil.member.id)]).toEqual([table, false, false]);
    }
  });

  it('two Removes at once leave one removed_pupils row and one event', async () => {
    const a = await classIn(deps);
    const { members } = await pupilIn(deps, a);
    const both = await Promise.all([remove(a, members[0]!.id), remove(a, members[0]!.id)]);
    expect(both.sort()).toEqual(['not_found', 'removed']);
    expect(await rows('SELECT 1 FROM removed_pupils')).toHaveLength(1);
    expect(await rows("SELECT 1 FROM events WHERE kind = 'class_pupil_remove'")).toHaveLength(1);
  });

  it('refuses the test member, and a member of another class or workspace', async () => {
    const a = await classIn(deps, { name: 'A' });
    const b = await classIn(deps, { name: 'B' });
    const teacher = await createPupilStore(t.db).signIn({ provider: 'test', subject: 'teacher-test', tenant: null });
    const test = await createClassJoinStore(t.db, deps.events).join(teacher.id, { class_id: a.cls.id, session_id: a.session.session_id }, 'teacher_test');
    const { members } = await pupilIn(deps, b);
    expect(await remove(a, test.id)).toBe('test_pupil');
    expect(await remove(a, members[0]!.id)).toBe('not_found');
    expect(await removeMember(t.db, deps.events, a.session.session_id, b.cls.id, members[0]!.id, env)).toBe('not_found');
    expect(await rows('SELECT 1 FROM removed_pupils')).toHaveLength(0);
  });
});
