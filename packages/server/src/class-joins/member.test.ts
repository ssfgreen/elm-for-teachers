/** The membership guard later pupil routes use (issue #209): `memberOf` and `requireMember`. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { createClassService } from '../classes/service.js';
import { createPupilStore } from '../pupils/store.js';
import { memberOf, requireMember } from './member.js';
import { createClassJoinStore, type ClassJoinStore } from './store.js';
import { classWithCode } from './test-class.js';

let t: TempDb;
let deps: AppDeps;
let joins: ClassJoinStore;
let n = 0;

beforeAll(async () => {
  t = await tempDb();
  deps = { ...testDeps(t.db), env: testEnv({ PUPILS: 'on' }) };
  joins = createClassJoinStore(t.db, deps.events);
});
afterAll(() => t.cleanup());

async function pupilIn(c: Awaited<ReturnType<typeof classWithCode>>) {
  const pupil = await createPupilStore(t.db).signIn({ provider: 'test', subject: `member-${++n}`, tenant: null });
  await joins.join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id });
  return pupil;
}

const guardDeps = () => ({ joins, sessions: deps.sessions, env: deps.env });

describe('memberOf', () => {
  it('lets a member of the class in, and refuses a pupil of another class', async () => {
    const a = await classWithCode(deps);
    const b = await classWithCode(deps);
    const pupil = await pupilIn(a);
    const ok = await memberOf(guardDeps(), pupil.id, a.cls.id);
    expect(ok.ok && ok.member.number).toBe(1);
    expect(await memberOf(guardDeps(), pupil.id, b.cls.id)).toEqual({ ok: false, reason: 'not_member' });
  });

  it('refuses when the workspace has pupils off, the server has PUPILS off, or the class is archived', async () => {
    const off = await classWithCode(deps, { pupils: false });
    const p1 = await pupilIn(off);
    expect(await memberOf(guardDeps(), p1.id, off.cls.id)).toEqual({ ok: false, reason: 'feature_off' });

    const on = await classWithCode(deps);
    const p2 = await pupilIn(on);
    expect(await memberOf({ ...guardDeps(), env: { PUPILS: 'off' } }, p2.id, on.cls.id)).toEqual({ ok: false, reason: 'pupils_off' });

    await createClassService(t.db, deps.events).archive(on.session.session_id, on.cls.id, on.env);
    expect(await memberOf(guardDeps(), p2.id, on.cls.id)).toEqual({ ok: false, reason: 'class_archived' });
  });
});

describe('requireMember', () => {
  it('answers 403 with the reason, or lets the route run with request.member set', async () => {
    const a = await classWithCode(deps);
    const b = await classWithCode(deps);
    const pupil = await pupilIn(a);
    const app = Fastify();
    app.addHook('preHandler', async (req) => {
      req.pupil = pupil;
    });
    app.get('/c/:classId', { preHandler: requireMember(guardDeps()) }, async (req) => ({ number: req.member!.number }));
    try {
      expect((await app.inject({ url: `/c/${a.cls.id}` })).json()).toEqual({ number: 1 });
      const other = await app.inject({ url: `/c/${b.cls.id}` });
      expect([other.statusCode, other.json().code]).toEqual([403, 'not_member']);
    } finally {
      await app.close();
    }
  });
});
