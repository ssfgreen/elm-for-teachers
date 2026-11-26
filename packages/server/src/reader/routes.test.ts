/** The pupil's reader (#213): which readings a pupil sees, the article they open, and who is refused. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { cookieNames } from '../accounts/cookies.js';
import { createAccountStore } from '../accounts/store.js';
import { createClassService } from '../classes/service.js';
import { createClassJoinStore } from '../class-joins/store.js';
import type { AppDeps } from '../deps.js';
import { tempDb, type TempDb } from '../test-helpers.js';
import { BASE, BLOCKS, classIn, PUPIL_COOKIE, pupilIn, readerApp, readingIn } from './test-reading.js';

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

const get = (url: string, headers: Record<string, string>) => app.inject({ url: `/api/pupil/readings${url}`, headers });

describe('GET /api/pupil/readings', () => {
  it('lists the readings of the pupil’s own open classes, newest first, and none of another, removed or archived', async () => {
    const a = await classIn(deps, { name: '8A' });
    const b = await classIn(deps, { name: '8B' });
    const archived = await classIn(deps, { name: '8C' });
    const off = await classIn(deps, { name: '8D', pupils: false });
    const other = await classIn(deps, { name: '9A' });
    const older = await readingIn(deps, a, { name: 'Older', created_at: '2026-11-01T09:00:00.000Z' });
    const newer = await readingIn(deps, b, { name: 'Newer', created_at: '2026-11-20T09:00:00.000Z' });
    await readingIn(deps, a, { name: 'Removed', removed: true });
    await readingIn(deps, archived, { name: 'Archived' });
    await readingIn(deps, off, { name: 'Off' });
    await readingIn(deps, other, { name: 'Not mine' });
    const { headers } = await pupilIn(deps, a, b, archived, off);
    await createClassService(deps.db, deps.events).archive(archived.session.session_id, archived.cls.id, archived.env);

    const res = await get('', headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().readings).toEqual([
      { id: newer, name: 'Newer', class_id: b.cls.id, class_name: '8B', set_on: '2026-11-20' },
      { id: older, name: 'Older', class_id: a.cls.id, class_name: '8A', set_on: '2026-11-01' },
    ]);
  });

  it('is empty for a pupil in no class', async () => {
    const { headers } = await pupilIn(deps);
    expect((await get('', headers)).json()).toEqual({ readings: [] });
  });
});

describe('GET /api/pupil/readings/:readingId', () => {
  it('gives the frozen copy and the prompts as label and ticks only, never an instruction', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { headers } = await pupilIn(deps, c);
    const res = await get(`/${id}`, headers);
    expect(res.statusCode).toBe(200);
    const { reading } = res.json();
    expect(reading).toEqual({
      id,
      name: 'Rain',
      class_name: '8B',
      blocks: BLOCKS,
      prompts: c.prompts.map((p) => ({ id: p.id, label: p.label, after_highlight: p.after_highlight, follow_up: p.follow_up })),
      follow_ups_max: deps.loaded.config.reader.follow_ups_max,
    });
    for (const p of c.prompts) expect(res.body).not.toContain(p.instruction);
    expect(res.body).not.toContain('instruction');
  });

  it('gives the follow-up limit in force: the reading’s own, else the class’s, else config’s', async () => {
    const c = await classIn(deps);
    const own = await readingIn(deps, c, { follow_ups_max: 1 });
    const classs = await readingIn(deps, c);
    const { headers } = await pupilIn(deps, c);
    await deps.db.execute('UPDATE classes SET reader_follow_ups_max = 5 WHERE id = ?', [c.cls.id]);
    expect((await get(`/${own}`, headers)).json().reading.follow_ups_max).toBe(1);
    expect((await get(`/${classs}`, headers)).json().reading.follow_ups_max).toBe(5);
  });

  it('counts the teacher’s test member as a pupil', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const test = await pupilIn(deps);
    await createClassJoinStore(deps.db, deps.events).join(test.pupil.id, { class_id: c.cls.id, session_id: c.session.session_id }, 'teacher_test');
    expect((await get(`/${id}`, test.headers)).statusCode).toBe(200);
    expect((await get('', test.headers)).json().readings.map((r: { id: string }) => r.id)).toEqual([id]);
  });
});

describe('who is refused', () => {
  const paths = (id: string) => [`/${id}`, `/${id}/highlights`, `/${id}/assets/ast_named`];

  it('refuses another class’s pupil, an unknown reading alike, and says 404 for a removed one to its own class', async () => {
    const c = await classIn(deps);
    const other = await classIn(deps);
    const id = await readingIn(deps, c);
    const gone = await readingIn(deps, c, { removed: true });
    const stranger = await pupilIn(deps, other);
    const member = await pupilIn(deps, c);
    for (const p of paths(id)) expect([p, (await get(p, stranger.headers)).json().code]).toEqual([p, 'not_member']);
    for (const p of paths('nope')) expect([p, (await get(p, member.headers)).statusCode]).toEqual([p, 403]);
    expect((await get(`/${gone}`, member.headers)).statusCode).toBe(404);
  });

  it('refuses when the workspace has pupils off, the class is archived, or the server has PUPILS off', async () => {
    const off = await classIn(deps, { pupils: false });
    const offId = await readingIn(deps, off);
    const p1 = await pupilIn(deps, off);
    for (const p of paths(offId)) expect([p, (await get(p, p1.headers)).json().code]).toEqual([p, 'feature_off']);

    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const p2 = await pupilIn(deps, c);
    await createClassService(deps.db, deps.events).archive(c.session.session_id, c.cls.id, c.env);
    for (const p of paths(id)) expect([p, (await get(p, p2.headers)).json().code]).toEqual([p, 'class_archived']);

    await app.close();
    ({ app } = await readerApp(t, { PUPILS: 'off' }));
    for (const p of ['', ...paths(id)]) expect([p, (await get(p, p2.headers)).json().code]).toEqual([p, 'pupils_off']);
  });

  it('refuses no sign-in and a teacher’s sign-in with 401', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const accounts = createAccountStore(deps.db, deps.sessions);
    const { account } = await accounts.claimInvite((await accounts.createInvite({ label: 't' })).code, { provider: 'test', subject: 'teacher', email: null, displayName: null });
    const signIn = (await accounts.startSignIn(account)).id;
    const teacher = { cookie: `${cookieNames(BASE).signIn}=${signIn}; ${PUPIL_COOKIE}=${signIn}`, origin: BASE };
    for (const p of ['', ...paths(id)]) {
      expect([p, (await get(p, {})).statusCode]).toEqual([p, 401]);
      expect([p, (await get(p, teacher)).statusCode]).toEqual([p, 401]);
    }
  });
});
