/**
 * Every route the server registers is in docs/routes.md, and every guarded row refuses the
 * callers its Who rules out: no credentials, another workspace's token, a workspace token or a
 * non-admin's sign-in on an admin route, and a sign-in cookie on a write from another site.
 * A new route that is not in the table, or is listed under a guard that lets one of those
 * through, fails here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { buildApp } from './app.js';
import { findRepoRoot } from './env.js';
import { requireAccount, requireParticipant } from './auth.js';
import { createAdminStore } from './accounts/admins.js';
import { cookieNames } from './accounts/cookies.js';
import { createAccountStore, type AccountStore } from './accounts/store.js';
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
  'capability link': /link_code_hash/,
  'workspace token': /requireParticipant|byParticipantToken/,
  'signed-in account': /requireAccount/,
  admin: /requireAdmin/,
  cron: /CRON_SECRET/,
};

/** Fastify's own: the built client's files, public, only when the client is built. */
const LEFT_OUT = new Set(['GET /*']);

interface Caller {
  sessionId: string;
  token: string;
  otherToken: string;
  adminCookie: string;
  teacherCookie: string;
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
    if ((row.who === 'none' || row.who === 'access code' || row.who === 'capability link') && !row.notes) problems.push(`${k}: an open route must say why it is open`);
    problems.push(...(await refusals(app, row, c)));
  }
  return problems;
}

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
    if (WRITE.has(row.method)) await expectStatus('an admin cookie from another site', { cookie: c.adminCookie, origin: ELSEWHERE }, 403);
    if (row.guard.includes('fetchedFromSite')) await expectStatus('an admin cookie on a link from another site', { cookie: c.adminCookie, 'sec-fetch-site': 'cross-site' }, 403);
  } else if (row.who === 'cron') {
    await expectStatus('a call with no cron secret', {}, 401);
    await expectStatus('a workspace token', { authorization: `Bearer ${c.token}` }, 401);
  } else if (row.who === 'signed-in account') {
    await expectStatus('a call with no sign-in', {}, 401);
    if (WRITE.has(row.method)) await expectStatus('a sign-in cookie from another site', { cookie: c.teacherCookie, origin: ELSEWHERE }, 403);
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

async function signedIn(subject: string, admin: boolean): Promise<string> {
  const { account } = await accounts.claimInvite((await accounts.createInvite({ label: subject })).code, { provider: 'test', subject, email: null, displayName: null });
  if (admin) await createAdminStore(t.db).setAdmin(account.id, true);
  return `${SIGN_IN}=${(await accounts.startSignIn(account)).id}`;
}

beforeEach(async () => {
  t = await tempDb();
  const base = testDeps(t.db);
  accounts = createAccountStore(t.db, base.sessions);
  deps = { ...base, env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE }), accounts };
  const a = (await deps.sessions.create('A')).session;
  const b = (await deps.sessions.create('B')).session;
  caller = {
    sessionId: a.session_id,
    token: a.participant_token,
    otherToken: b.participant_token,
    adminCookie: await signedIn('admin', true),
    teacherCookie: await signedIn('teacher', false),
  };
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('docs/routes.md', () => {
  it('lists every route, each with the guard it names, and each guarded route refuses a stranger', async () => {
    await start();
    expect(readTable(TABLE).length).toBeGreaterThan(70);
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
});
