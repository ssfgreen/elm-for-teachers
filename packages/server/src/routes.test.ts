/**
 * Every route the server registers is in docs/routes.md, and every guarded row refuses the
 * callers its Who rules out: no credentials, another workspace's token, a workspace token or a
 * non-admin's sign-in on an admin route, a pupil's sign-in on a teacher or admin route, a
 * teacher's on a pupil route, and a sign-in cookie on a write from another site. A new
 * route that is not in the table, or is listed under a guard that lets one of those through, fails
 * here (the last tests show it). It does not prove what a handler does once the guard passes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { buildApp } from './app.js';
import { findRepoRoot } from './env.js';
import { requireAccount, requireParticipant, requirePupil } from './auth.js';
import { createAdminStore } from './accounts/admins.js';
import { cookieNames } from './accounts/cookies.js';
import { createAccountStore, type AccountStore } from './accounts/store.js';
import { pupilCookieNames } from './pupils/cookies.js';
import { createPupilStore } from './pupils/store.js';
import type { AppDeps } from './deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from './test-helpers.js';

interface Row {
  method: string;
  path: string;
  who: string;
  guard: string;
  notes: string;
}

const TABLE = readFileSync(path.join(findRepoRoot(), 'docs', 'routes.md'), 'utf8');

/** The table's rows: `| METHOD | \`/path\` | who | guard | notes |`. */
export function readTable(md: string): Row[] {
  const rows: Row[] = [];
  for (const line of md.split('\n')) {
    const m = /^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \| ([^|]+) \| ([^|]+) \|(.*)\|\s*$/.exec(line);
    if (m) rows.push({ method: m[1]!, path: m[2]!, who: m[3]!.trim(), guard: m[4]!.trim(), notes: m[5]!.trim() });
  }
  return rows;
}

/** The guard a row must name for its Who. */
const GUARD_FOR: Record<string, RegExp> = {
  none: /.*/,
  'access code': /byAccessCode/,
  'workspace token': /requireParticipant|byParticipantToken/,
  'signed-in account': /requireAccount/,
  'signed-in pupil': /requirePupil/,
  'class member': /requirePupil.*memberOf/,
  admin: /requireAdmin/,
  cron: /CRON_SECRET/,
};

/** Fastify's own: the built client's files, public, only when the client is built. */
const LEFT_OUT = new Set(['GET /*']);

interface Caller {
  /** A workspace and its token, and another workspace's token. */
  sessionId: string;
  token: string;
  otherToken: string;
  /** Sign-in cookies (`name=id`): an admin's, and a teacher's who is not an admin. */
  adminCookie: string;
  teacherCookie: string;
  /** A pupil's sign-in (pupils/), under the pupil cookie's name and under the teachers'. */
  pupilCookie: string;
  pupilAsTeacher: string;
  /** The teacher's sign-in id under the pupil cookie's name. */
  teacherAsPupil: string;
}

const BASE = 'https://edw.example';
const ELSEWHERE = 'https://other.example';
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const key = (method: string, url: string) => `${method} ${url}`;

/** What is wrong between the registered routes and the table; empty when they agree. */
export async function audit(app: FastifyInstance, registered: RouteOptions[], rows: Row[], c: Caller): Promise<string[]> {
  const problems: string[] = [];
  const routes = new Set<string>();
  for (const r of registered) {
    for (const m of [r.method].flat()) if (m !== 'HEAD' && !LEFT_OUT.has(key(m, r.url))) routes.add(key(m, r.url));
  }
  const listed = new Map(rows.map((r) => [key(r.method, r.path), r]));
  for (const r of routes) if (!listed.has(r)) problems.push(`${r} is not in docs/routes.md`);
  for (const r of listed.keys()) if (!routes.has(r)) problems.push(`${r} is in docs/routes.md but not registered`);

  for (const row of rows) {
    const k = key(row.method, row.path);
    if (!routes.has(k)) continue;
    const want = GUARD_FOR[row.who];
    if (!want) {
      problems.push(`${k}: unknown Who "${row.who}"`);
      continue;
    }
    if (!want.test(row.guard)) problems.push(`${k}: a ${row.who} route must name ${want.source}, not "${row.guard}"`);
    if ((row.who === 'none' || row.who === 'access code') && !row.notes) problems.push(`${k}: an open route must say why it is open`);
    problems.push(...(await refusals(app, row, c)));
  }
  return problems;
}

/** Call a guarded route as callers who must be refused, and say what got through. */
async function refusals(app: FastifyInstance, row: Row, c: Caller): Promise<string[]> {
  const url = row.path.replace(/:sessionId/g, c.sessionId).replace(/:[A-Za-z]+/g, 'x');
  const call = async (headers: Record<string, string>) => {
    const res = await app.inject({ method: row.method as 'GET', url, headers, ...(row.method === 'GET' ? {} : { payload: {} }) });
    return res.statusCode;
  };
  const out: string[] = [];
  const expectStatus = async (what: string, headers: Record<string, string>, status: number) => {
    const got = await call(headers);
    if (got !== status) out.push(`${row.method} ${row.path}: ${what} got ${got}, not ${status}`);
  };
  if (row.who === 'workspace token') {
    await expectStatus('a call with no token', {}, 401);
    if (row.path.includes(':sessionId')) await expectStatus('another workspace’s token', { authorization: `Bearer ${c.otherToken}` }, 403);
  } else if (row.who === 'admin') {
    await expectStatus('a call with no admin', {}, 401);
    await expectStatus('a workspace token', { authorization: `Bearer ${c.token}` }, 401);
    await expectStatus('a non-admin account’s cookie', { cookie: c.teacherCookie, origin: BASE }, 401);
    await expectStatus('a pupil’s cookie', { cookie: `${c.pupilCookie}; ${c.pupilAsTeacher}`, origin: BASE }, 401);
    if (WRITE.has(row.method)) await expectStatus('an admin cookie from another site', { cookie: c.adminCookie, origin: ELSEWHERE }, 403);
    // A GET that writes (the export) takes the cookie only from this site's own page.
    if (row.guard.includes('fetchedFromSite')) await expectStatus('an admin cookie on a link from another site', { cookie: c.adminCookie, 'sec-fetch-site': 'cross-site' }, 403);
  } else if (row.who === 'cron') {
    await expectStatus('a call with no cron secret', {}, 401);
    await expectStatus('a workspace token', { authorization: `Bearer ${c.token}` }, 401);
  } else if (row.who === 'signed-in account') {
    await expectStatus('a call with no sign-in', {}, 401);
    await expectStatus('a pupil’s cookie', { cookie: `${c.pupilCookie}; ${c.pupilAsTeacher}`, origin: BASE }, 401);
    if (WRITE.has(row.method)) await expectStatus('a sign-in cookie from another site', { cookie: c.teacherCookie, origin: ELSEWHERE }, 403);
  } else if (row.who === 'signed-in pupil') {
    await expectStatus('a call with no sign-in', {}, 401);
    await expectStatus('a teacher’s cookie', { cookie: `${c.teacherCookie}; ${c.teacherAsPupil}`, origin: BASE }, 401);
    if (WRITE.has(row.method)) await expectStatus('a pupil cookie from another site', { cookie: c.pupilCookie, origin: ELSEWHERE }, 403);
  } else if (row.who === 'class member') {
    await expectStatus('a call with no sign-in', {}, 401);
    await expectStatus('a teacher’s cookie', { cookie: `${c.teacherCookie}; ${c.teacherAsPupil}`, origin: BASE }, 401);
    // The caller's pupil is in no class: the route's class is another class's.
    await expectStatus('a pupil not in the class', { cookie: c.pupilCookie, origin: BASE }, 403);
    if (WRITE.has(row.method)) await expectStatus('a pupil cookie from another site', { cookie: c.pupilCookie, origin: ELSEWHERE }, 403);
  }
  return out;
}

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let registered: RouteOptions[];
let caller: Caller;

async function start(extra?: (app: FastifyInstance) => void) {
  registered = [];
  app = await buildApp(deps, { onRoute: (r) => registered.push(r) });
  extra?.(app);
  await app.ready();
}

let accounts: AccountStore;
const SIGN_IN = cookieNames(BASE).signIn;
const PUPIL_SIGN_IN = pupilCookieNames(BASE).signIn;

/** A signed-in account's cookie; `admin` makes the account an admin. */
async function signedIn(subject: string, admin: boolean): Promise<string> {
  const { account } = await accounts.claimInvite((await accounts.createInvite({ label: subject })).code, { provider: 'test', subject, email: null, displayName: null });
  if (admin) await createAdminStore(t.db).setAdmin(account.id, true);
  return `${SIGN_IN}=${(await accounts.startSignIn(account)).id}`;
}

beforeEach(async () => {
  t = await tempDb();
  const base = testDeps(t.db);
  accounts = createAccountStore(t.db, base.sessions);
  // PUPILS=on: the pupil routes are shut without it, so their guards could not be checked.
  deps = { ...base, env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE, PUPILS: 'on' }), accounts };
  const a = (await deps.sessions.create('A')).session;
  const b = (await deps.sessions.create('B')).session;
  const pupils = createPupilStore(t.db);
  const pupilId = (await pupils.startSignIn((await pupils.signIn({ provider: 'test', subject: 'pupil', tenant: null })).id)).id;
  const teacherCookie = await signedIn('teacher', false);
  caller = {
    sessionId: a.session_id,
    token: a.participant_token,
    otherToken: b.participant_token,
    adminCookie: await signedIn('admin', true),
    teacherCookie,
    pupilCookie: `${PUPIL_SIGN_IN}=${pupilId}`,
    pupilAsTeacher: `${SIGN_IN}=${pupilId}`,
    teacherAsPupil: `${PUPIL_SIGN_IN}=${teacherCookie.slice(SIGN_IN.length + 1)}`,
  };
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('docs/routes.md', () => {
  it('lists every route, each with the guard it names, and each guarded route refuses a stranger', async () => {
    await start();
    expect(readTable(TABLE).length).toBeGreaterThan(90);
    expect(await audit(app, registered, readTable(TABLE), caller)).toEqual([]);
  });

  it('fails on an added route that is not in the table', async () => {
    await start((a) => a.post('/api/sessions/:sessionId/oops', async () => ({ ok: true })));
    expect(await audit(app, registered, readTable(TABLE), caller)).toEqual(['POST /api/sessions/:sessionId/oops is not in docs/routes.md']);
  });

  it('fails on an added route listed under a guard it does not have, and passes once it has it', async () => {
    const row = '| POST | `/api/sessions/:sessionId/oops` | workspace token | `requireParticipant` | |';
    await start((a) => a.post('/api/sessions/:sessionId/oops', async () => ({ ok: true })));
    expect(await audit(app, registered, readTable(`${TABLE}\n${row}\n`), caller)).toEqual([
      'POST /api/sessions/:sessionId/oops: a call with no token got 200, not 401',
      'POST /api/sessions/:sessionId/oops: another workspace’s token got 200, not 403',
    ]);
    await app.close();
    await start((a) => a.post('/api/sessions/:sessionId/oops', { preHandler: requireParticipant(deps) }, async () => ({ ok: true })));
    expect(await audit(app, registered, readTable(`${TABLE}\n${row}\n`), caller)).toEqual([]);
  });

  it('fails on an admin row whose route takes any signed-in teacher', async () => {
    const row = '| POST | `/api/admin/oops` | admin | `requireAdmin` | |';
    await start((a) => a.post('/api/admin/oops', { preHandler: requireAccount(accounts, SIGN_IN) }, async () => ({ ok: true })));
    expect(await audit(app, registered, readTable(`${TABLE}\n${row}\n`), caller)).toEqual([
      'POST /api/admin/oops: a non-admin account’s cookie got 200, not 401',
      'POST /api/admin/oops: an admin cookie from another site got 200, not 403',
    ]);
  });

  it('fails on a signed-in write that takes a cookie from another site', async () => {
    const row = '| POST | `/api/account/oops` | signed-in account | `requireAccount` | |';
    await start((a) => a.post('/api/account/oops', { preHandler: requireAccount(accounts, SIGN_IN) }, async () => ({ ok: true })));
    expect(await audit(app, registered, readTable(`${TABLE}\n${row}\n`), caller)).toEqual(['POST /api/account/oops: a sign-in cookie from another site got 200, not 403']);
  });

  it('fails on a class member row whose route takes any signed-in pupil', async () => {
    const row = '| GET | `/api/pupil/readings/:readingId/oops` | class member | `requirePupil` + `memberOf` | |';
    await start((a) => a.get('/api/pupil/readings/:readingId/oops', { preHandler: requirePupil(createPupilStore(t.db), PUPIL_SIGN_IN) }, async () => ({ ok: true })));
    expect(await audit(app, registered, readTable(`${TABLE}\n${row}\n`), caller)).toEqual(['GET /api/pupil/readings/:readingId/oops: a pupil not in the class got 200, not 403']);
  });

  it('fails on a pupil row whose route takes a teacher, and a teacher row whose route takes a pupil', async () => {
    const pupilRow = '| GET | `/api/pupil/oops` | signed-in pupil | `requirePupil` | |';
    const teacherRow = '| GET | `/api/account/oops` | signed-in account | `requireAccount` | |';
    await start((a) => {
      a.get('/api/pupil/oops', { preHandler: requireAccount(accounts, SIGN_IN) }, async () => ({ ok: true }));
      a.get('/api/account/oops', { preHandler: requirePupil(createPupilStore(t.db), PUPIL_SIGN_IN) }, async () => ({ ok: true }));
    });
    expect(await audit(app, registered, readTable(`${TABLE}\n${pupilRow}\n${teacherRow}\n`), caller)).toEqual([
      'GET /api/pupil/oops: a teacher’s cookie got 200, not 401',
      'GET /api/account/oops: a pupil’s cookie got 200, not 401',
    ]);
  });
});
