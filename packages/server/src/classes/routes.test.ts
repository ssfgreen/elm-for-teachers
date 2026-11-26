import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { schoolYearOf } from '@edw/shared';
import { DEMO_PUPILS } from './demo.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

const envelope = { client_ts: '2026-11-12T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const post = (path: string, body: Record<string, unknown> = {}, x: SessionRow = s) =>
  app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}${path}`, headers: auth(x), payload: { envelope, ...body } });
const get = (path: string, x: SessionRow = s) => app.inject({ url: `/api/sessions/${x.session_id}${path}`, headers: auth(x) });
const logged = async (kinds: string[]) => (await deps.events.list(s.session_id, { kinds: kinds as never })).map((e) => [e.kind, e.payload]);

async function setUp() {
  const y = (await post('/year-groups', { name: ' P7 ' })).json().year_group;
  const c = (await post('/classes', { year_group_id: y.id, name: '7B', stage: 'Primary 7, Second level' })).json().class;
  return { y, c };
}

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('year groups and classes', () => {
  it('makes, changes and archives them, logging each with only what changed', async () => {
    const { y, c } = await setUp();
    expect(y).toMatchObject({ name: 'P7', note: null, archived_at: null, school_year: schoolYearOf(new Date()) });
    expect(c).toMatchObject({ year_group_id: y.id, school_id: y.school_id, school_year: y.school_year, name: '7B', stage: 'Primary 7, Second level', subject: null, note: null, starred_at: null });

    expect((await post(`/year-groups/${y.id}/update`, { note: 'Transition to S1 in June.' })).json().year_group.note).toBe('Transition to S1 in June.');
    const changed = (await post(`/classes/${c.id}/update`, { name: '7B', note: ' Quieter after lunch. ', subject: 'English' })).json().class;
    expect(changed).toMatchObject({ name: '7B', note: 'Quieter after lunch.', subject: 'English' });
    expect((await post(`/classes/${c.id}/archive`)).json().class.archived_at).toEqual(expect.any(String));

    expect(await logged(['year_group_create', 'year_group_update', 'class_create', 'class_update', 'class_archive'])).toEqual([
      ['year_group_create', { year_group_id: y.id, school_id: y.school_id, school_year: y.school_year, name: 'P7' }],
      ['class_create', { class_id: c.id, year_group_id: y.id, school_id: y.school_id, school_year: y.school_year, name: '7B', stage: 'Primary 7, Second level', subject: null }],
      ['year_group_update', { year_group_id: y.id, note: 'Transition to S1 in June.' }],
      ['class_update', { class_id: c.id, subject: 'English', note: 'Quieter after lunch.' }],
      ['class_archive', { class_id: c.id }],
    ]);
  });

  it('keeps each workspace to its own', async () => {
    const { y, c } = await setUp();
    expect((await get(`/classes/${c.id}`, other)).statusCode).toBe(404);
    expect((await post('/classes', { year_group_id: y.id, name: 'X' }, other)).statusCode).toBe(404);
    expect((await get('/classes', other)).json()).toEqual({ schools: [], year_groups: [], classes: [] });
  });

  it('will not put a class in an archived year group', async () => {
    const { y } = await setUp();
    await post(`/year-groups/${y.id}/archive`);
    expect((await post('/classes', { year_group_id: y.id, name: '7C' })).statusCode).toBe(409);
  });
});

describe('pupils', () => {
  it('makes up a label for a row without one, and logs the table’s shape, never its contents', async () => {
    const { c } = await setUp();
    const added = (await post(`/classes/${c.id}/pupils`, { pupils: [{ needs: ['Dyslexia', 'dyslexia '], helps: 'Amber overlay' }, { label: 'my-code-7' }] })).json().pupils;
    expect(added[0]).toMatchObject({ needs: ['Dyslexia'], helps: 'Amber overlay', position: 0 });
    expect(added[0].label).toMatch(/^[a-z]+-[a-z]+$/);
    expect(added[1]).toMatchObject({ label: 'my-code-7', needs: [], position: 1 });

    await post(`/classes/${c.id}/pupils/${added[1].id}/update`, { needs: ['ADHD'], note: 'Near the front' });
    const events = await logged(['pupils_change']);
    expect(events[0]![1]).toMatchObject({ op: 'add', pupil_ids: added.map((p: { id: string }) => p.id), table: { rows: 2, needs_counts: { Dyslexia: 1 } } });
    expect(events[1]![1]).toMatchObject({ op: 'update', pupil_ids: [added[1].id], fields: ['needs', 'note'], table: { rows: 2, needs_counts: { Dyslexia: 1, ADHD: 1 } } });
    const text = JSON.stringify(await deps.events.list(s.session_id));
    for (const secret of ['Amber overlay', 'Near the front', 'my-code-7', added[0].label]) expect(text).not.toContain(secret);
  });

  it('moves a pupil to another class, and archives one who leaves', async () => {
    const { y, c } = await setUp();
    const c2 = (await post('/classes', { year_group_id: y.id, name: '7C' })).json().class;
    const [a, b] = (await post(`/classes/${c.id}/pupils`, { pupils: [{ label: 'brave-kettle' }, { label: 'quiet-comet' }] })).json().pupils;
    await post(`/classes/${c2.id}/pupils`, { pupils: [{ label: 'brave-kettle' }] });

    const moved = (await post(`/classes/${c.id}/pupils/${a.id}/move`, { to_class_id: c2.id })).json().pupil;
    // The label was taken there, so it gets a new one.
    expect(moved.class_id).toBe(c2.id);
    expect(moved.label).not.toBe('brave-kettle');
    await post(`/classes/${c.id}/pupils/${b.id}/archive`);

    expect((await get(`/classes/${c.id}`)).json().pupils).toEqual([]);
    expect((await get(`/classes/${c2.id}`)).json().pupils.map((p: { label: string }) => p.label)).toEqual(['brave-kettle', moved.label]);
    expect((await get('/classes')).json().classes.map((x: { pupil_count: number }) => x.pupil_count)).toEqual([0, 2]);
    expect((await post(`/classes/${c.id}/pupils/${a.id}/move`, { to_class_id: c2.id })).statusCode).toBe(404);
  });

  it('numbers the pupils in each class from 1, never giving a number there twice', async () => {
    const { y, c } = await setUp();
    const c2 = (await post('/classes', { year_group_id: y.id, name: '7C' })).json().class;
    const [a, b, d] = (await post(`/classes/${c.id}/pupils`, { pupils: [{}, {}, {}] })).json().pupils;
    expect([a.number, b.number, d.number]).toEqual([1, 2, 3]);
    // A pupil who left keeps their number: the next pupil gets a new one.
    await post(`/classes/${c.id}/pupils/${d.id}/archive`);
    expect((await post(`/classes/${c.id}/pupils`, { pupils: [{}] })).json().pupils[0].number).toBe(4);
    // A teacher cannot change it.
    expect((await post(`/classes/${c.id}/pupils/${a.id}/update`, { number: 9, note: 'x' })).json().pupil.number).toBe(1);
    // Moved, a pupil takes the next number in the new class.
    await post(`/classes/${c2.id}/pupils`, { pupils: [{}] });
    expect((await post(`/classes/${c.id}/pupils/${b.id}/move`, { to_class_id: c2.id })).json().pupil.number).toBe(2);
    expect((await get(`/classes/${c.id}`)).json().pupils.map((p: { number: number }) => p.number)).toEqual([1, 4]);
  });
});

describe('the demo class', () => {
  it('adds P7A, starred, in a fictional school of its own, with every pupil from the register and no names', async () => {
    const { y } = await setUp();
    const demo = (await post('/classes/demo')).json().class;
    expect(demo).toMatchObject({ name: 'P7A', school_year: schoolYearOf(new Date()), starred_at: expect.any(String) });
    expect(demo.school_id).not.toBe(y.school_id);
    expect((await get('/classes')).json().schools.map((x: { name: string; demo: boolean }) => [x.name, x.demo])).toEqual([
      ['My school', false],
      ['Braeside Primary School (demo)', true],
    ]);

    const { pupils } = (await get(`/classes/${demo.id}`)).json();
    expect(pupils).toHaveLength(20);
    // No hidden needs or grades (#243); a note on exactly three pupils, as a teacher might write one.
    expect(pupils.filter((p: { needs: string[]; working_at: string | null }) => p.needs.length || p.working_at)).toEqual([]);
    expect(pupils.filter((p: { note: string | null }) => p.note).map((p: { label: string }) => p.label)).toEqual(['tidy-puffin', 'swift-otter', 'snowy-kite']);
    const all = JSON.stringify(DEMO_PUPILS);
    for (const name of ['Callum', 'Reid', 'Harris', 'Oliver', '021935', '2015']) expect(all).not.toContain(name);
    expect((await logged(['class_create']))[1]![1]).toMatchObject({ demo: true, name: 'P7A' });
  });
});

describe('schools, school years and stars', () => {
  it('keeps a school’s name for the teacher, out of the events and the export', async () => {
    const school = (await post('/schools', { name: 'Hillhead Academy' })).json().school;
    await post(`/schools/${school.id}/rename`, { name: 'Hillhead High School' });
    const y = (await post('/year-groups', { name: 'S2', school_id: school.id, school_year: '2027-28' })).json().year_group;
    expect(y).toMatchObject({ school_id: school.id, school_year: '2027-28' });
    expect((await get('/classes')).json().schools[0].name).toBe('Hillhead High School');
    expect(await logged(['school_create', 'school_rename'])).toEqual([
      ['school_create', { school_id: school.id }],
      ['school_rename', { school_id: school.id }],
    ]);
    const { files } = await buildBundle(deps, s.session_id);
    expect(JSON.parse(files['classes.json'] as string).schools).toEqual([{ id: school.id, demo: false, created_at: school.created_at, archived_at: null }]);
    expect(Object.values(files).join('\n')).not.toContain('Hillhead');
    expect((await post('/year-groups', { name: 'S2', school_year: '2027' })).statusCode).toBe(400);
  });

  it('stars and unstars a class, logging each', async () => {
    const { c } = await setUp();
    expect((await post(`/classes/${c.id}/update`, { starred: true })).json().class.starred_at).toEqual(expect.any(String));
    expect((await post(`/classes/${c.id}/update`, { starred: false })).json().class.starred_at).toBeNull();
    expect((await logged(['class_update'])).map((e) => e[1])).toEqual([
      { class_id: c.id, starred: true },
      { class_id: c.id, starred: false },
    ]);
  });

  it('copies a class into next year: the year group moves up, the name follows, the pupils come too', async () => {
    const y = (await post('/year-groups', { name: 'P6', school_year: '2026-27' })).json().year_group;
    const c = (await post('/classes', { year_group_id: y.id, name: 'P6A', subject: 'Literacy', note: 'Keen readers.' })).json().class;
    await post(`/classes/${c.id}/update`, { starred: true });
    const [a] = (await post(`/classes/${c.id}/pupils`, { pupils: [{ label: 'brave-kettle', needs: ['Dyslexia'], working_at: 'Grade B', helps: 'Amber overlay', note: 'Reads slowly.' }, { label: 'quiet-comet' }] })).json().pupils;

    const copy = await post(`/classes/${c.id}/copy`);
    expect(copy.statusCode).toBe(201);
    const next = copy.json().class;
    expect(next).toMatchObject({ name: 'P7A', school_year: '2027-28', school_id: y.school_id, subject: 'Literacy', note: 'Keen readers.', stage: null, copied_from: c.id, starred_at: expect.any(String) });
    const list = (await get('/classes')).json();
    expect(list.year_groups.map((x: { name: string; school_year: string }) => `${x.name} ${x.school_year}`)).toEqual(['P6 2026-27', 'P7 2027-28']);
    const { pupils } = (await get(`/classes/${next.id}`)).json();
    // The hidden needs and working_at stay behind (#243); what helps and the note come across.
    expect(pupils.map((p: { label: string; needs: string[]; working_at: string | null; helps: string | null; note: string | null }) => [p.label, p.needs, p.working_at, p.helps, p.note])).toEqual([
      ['brave-kettle', [], null, 'Amber overlay', 'Reads slowly.'],
      ['quiet-comet', [], null, null, null],
    ]);
    // New rows, not the same pupils: last year's class keeps its own, unchanged.
    expect(pupils[0].id).not.toBe(a.id);
    const old = (await get(`/classes/${c.id}`)).json().pupils;
    expect(old).toHaveLength(2);
    expect(old[0]).toMatchObject({ needs: ['Dyslexia'], working_at: 'Grade B', helps: 'Amber overlay', note: 'Reads slowly.' });
    // The research shape keeps its keys; with no hidden needs the new class counts none.
    const added = (await logged(['pupils_change'])).map((e) => e[1] as { op: string; class_id: string; table: Record<string, unknown> }).filter((e) => e.op === 'add');
    expect(Object.keys(added.at(-1)!.table).sort()).toEqual(['hash', 'needs_counts', 'rows']);
    expect(added.at(-1)!.table).toMatchObject({ rows: 2, needs_counts: {} });

    // A second copy goes into the same P7, under the name the teacher gives.
    const again = (await post(`/classes/${c.id}/copy`, { name: 'P7 Literacy', year_group_name: 'P7' })).json().class;
    expect(again).toMatchObject({ name: 'P7 Literacy', year_group_id: next.year_group_id });
    expect((await post(`/classes/${c.id}/copy`, {}, other)).statusCode).toBe(404);
  });
});

describe('chats for a class', () => {
  it('starts a chat for a class or a year group, never both, and exports them', async () => {
    const { y, c } = await setUp();
    const chat = await post('/threads', { class_id: c.id });
    expect(chat.statusCode).toBe(201);
    expect(chat.json().thread).toMatchObject({ class_id: c.id, year_group_id: null, project_id: null });
    expect((await post('/threads', { year_group_id: y.id })).json().thread.year_group_id).toBe(y.id);
    expect((await post('/threads', { class_id: c.id, year_group_id: y.id })).statusCode).toBe(400);
    expect((await post('/threads', { class_id: c.id }, other)).statusCode).toBe(404);

    await post(`/classes/${c.id}/pupils`, { pupils: [{ label: 'brave-kettle', needs: ['Autism'], helps: 'Visual timetable' }] });
    const { files } = await buildBundle(deps, s.session_id);
    const classes = JSON.parse(files['classes.json'] as string);
    expect(classes.year_groups).toHaveLength(1);
    expect(classes.schools).toEqual([{ id: y.school_id, demo: false, created_at: expect.any(String), archived_at: null }]);
    expect(classes.classes[0]).toMatchObject({ id: c.id, pupil_table: { rows: 1, needs_counts: { Autism: 1 } } });
    expect(files['classes.json']).not.toContain('Visual timetable');
    expect(JSON.parse(files['threads.json'] as string).map((x: { class_id: string | null }) => x.class_id)).toEqual([null, c.id, null]);

    expect(await deps.sessions.delete(s.session_id)).not.toBeNull();
    expect((await deps.db.execute('SELECT COUNT(*) AS n FROM class_pupils WHERE session_id = ?', [s.session_id])).rows[0]!.n).toBe(0);
  });
});

describe('the demo school', () => {
  it('never takes the teacher’s own classes, even when it came first', async () => {
    const demo = (await post('/classes/demo')).json().class;
    const y = (await post('/year-groups', { name: 'S2' })).json().year_group;
    expect(y.school_id).not.toBe(demo.school_id);
    const again = (await post('/classes/demo')).json().class;
    expect(again.school_id).toBe(demo.school_id);
  });
});
