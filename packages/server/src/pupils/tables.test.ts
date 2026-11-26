/** PUPIL_TABLES names every table that holds a pupil (issue #209), and forgetPupil uses it. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { classWithCode } from '../class-joins/test-class.js';
import { createPupilStore } from './store.js';
import { forgetPupil, PUPIL_TABLES, pupilColumns, type PupilTable } from './tables.js';

let t: TempDb;
let deps: AppDeps;
let n = 0;

/** Each describe has its own database: the guard must not depend on running before the tables the forgetPupil tests make. */
function ownDb() {
  beforeAll(async () => {
    t = await tempDb();
    deps = testDeps(t.db);
  });
  afterAll(() => t.cleanup());
}

const key = (c: { table: string; column: string; keyedBy: string }) => `${c.table}.${c.column}:${c.keyedBy}`;

/** A pupil in a new class, signed in once. */
async function pupilInClass() {
  const c = await classWithCode(deps);
  const pupils = createPupilStore(t.db);
  const pupil = await pupils.signIn({ provider: 'test', subject: `forget-${++n}`, tenant: null });
  await pupils.startSignIn(pupil.id);
  const member = await createClassJoinStore(t.db, deps.events).join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id });
  return { c, pupil, member };
}

describe('PUPIL_TABLES', () => {
  ownDb();

  it('lists every column that names a pupil or a membership, and pupils itself, each with delete or keep-anonymised', async () => {
    const found = (await pupilColumns(t.db)).map(key);
    const listed = PUPIL_TABLES.filter((p) => p.table !== 'pupils').map(key);
    expect(listed.sort()).toEqual(found.sort());
    for (const p of PUPIL_TABLES) expect(['delete', 'keep-anonymised']).toContain(p.onRemove);
    expect(PUPIL_TABLES.at(-1)!.table).toBe('pupils');
  });

  it('a keep-anonymised table has no foreign key on its column, and a pupil-keyed one has a class_id', async () => {
    const columns = await pupilColumns(t.db);
    for (const p of PUPIL_TABLES.filter((x) => x.onRemove === 'keep-anonymised')) {
      expect(columns.find((c) => c.table === p.table && c.column === p.column)!.foreignKey).toBe(false);
      if (p.keyedBy === 'pupil') {
        const cols = (await t.db.execute(`PRAGMA table_info("${p.table}")`)).rows.map((r) => String(r.name));
        expect(cols).toContain('class_id');
      }
    }
  });

  it('finds tables keyed by membership, and pupil_id or member_id columns with no foreign key, but not the teacher’s pupil table', async () => {
    const other = await tempDb();
    try {
      await other.db.execute('CREATE TABLE act_member (member_id TEXT REFERENCES class_members(id))');
      await other.db.execute('CREATE TABLE act_plain (pupil_id TEXT, class_id TEXT)');
      await other.db.execute('CREATE TABLE act_plain_member (member_id TEXT)');
      const found = (await pupilColumns(other.db)).map(key);
      expect(found).toEqual(expect.arrayContaining(['act_member.member_id:member', 'act_plain.pupil_id:pupil', 'act_plain_member.member_id:member']));
      // pupil_adaptations.pupil_id points at class_pupils: the teacher's labels, not a pupil.
      expect(found.some((f) => f.startsWith('pupil_adaptations.'))).toBe(false);
    } finally {
      other.cleanup();
    }
  });
});

describe('forgetPupil', () => {
  ownDb();

  it('deletes the pupil everywhere and leaves a removed_pupils row with the workspace, class and day only', async () => {
    const { c, pupil } = await pupilInClass();
    const anon = await forgetPupil(t.db, pupil.id);
    expect(Object.keys(anon)).toEqual([c.cls.id]);
    for (const p of PUPIL_TABLES) expect((await t.db.execute(`SELECT COUNT(*) AS c FROM "${p.table}" WHERE "${p.column}" = ?`, [pupil.id])).rows[0]!.c).toBe(0);
    const left = (await t.db.execute('SELECT * FROM removed_pupils WHERE class_id = ?', [c.cls.id])).rows;
    expect(left).toHaveLength(1);
    expect(Object.keys(left[0]!).sort()).toEqual(['class_id', 'id', 'removed_on', 'session_id']);
    expect(left[0]!.id).toBe(anon[c.cls.id]);
    expect(left[0]!.id).not.toBe(pupil.id);
  });

  it('deletes rows of a table keyed by membership, with its foreign key to class_members on', async () => {
    await t.db.execute('CREATE TABLE IF NOT EXISTS t_member_fk (member_id TEXT NOT NULL REFERENCES class_members(id), n INTEGER)');
    const { pupil, member } = await pupilInClass();
    await t.db.execute('INSERT INTO t_member_fk VALUES (?, 1)', [member.id]);
    const tables: PupilTable[] = [...PUPIL_TABLES, { table: 't_member_fk', column: 'member_id', keyedBy: 'member', onRemove: 'delete' }];
    await forgetPupil(t.db, pupil.id, tables);
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM t_member_fk WHERE member_id = ?', [member.id])).rows[0]!.c).toBe(0);
  });

  it('keeps a keep-anonymised table’s rows under the new id, keyed by pupil or by membership', async () => {
    await t.db.execute('CREATE TABLE IF NOT EXISTS t_pupil_anon (pupil_id TEXT, class_id TEXT, n INTEGER)');
    await t.db.execute('CREATE TABLE IF NOT EXISTS t_member_anon (member_id TEXT, n INTEGER)');
    const { c, pupil, member } = await pupilInClass();
    await t.db.execute('INSERT INTO t_pupil_anon VALUES (?, ?, 3)', [pupil.id, c.cls.id]);
    await t.db.execute('INSERT INTO t_member_anon VALUES (?, 4)', [member.id]);
    const tables: PupilTable[] = [
      ...PUPIL_TABLES,
      { table: 't_pupil_anon', column: 'pupil_id', keyedBy: 'pupil', onRemove: 'keep-anonymised' },
      { table: 't_member_anon', column: 'member_id', keyedBy: 'member', onRemove: 'keep-anonymised' },
    ];
    const anon = await forgetPupil(t.db, pupil.id, tables);
    const id = anon[c.cls.id];
    expect((await t.db.execute('SELECT pupil_id, n FROM t_pupil_anon WHERE n = 3')).rows.map((r) => r.pupil_id)).toEqual([id]);
    expect((await t.db.execute('SELECT member_id, n FROM t_member_anon WHERE n = 4')).rows.map((r) => r.member_id)).toEqual([id]);
  });
});
