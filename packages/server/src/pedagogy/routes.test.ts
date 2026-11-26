import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { fakeLibrary, withLibraries } from './test-library.js';

let t: TempDb;
let app: FastifyInstance;
let s: SessionRow;

async function start(withPlugins: boolean) {
  t = await tempDb();
  const lib = fakeLibrary({ facets: { counts: { entries: 2 } }, entries: (b) => ({ total: 1, got: b }), claims: { claims: [], missing: ['clm-x'] } });
  const base = testDeps(t.db);
  const deps = withPlugins ? withLibraries(base, lib.clientFor) : base;
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  return lib;
}
const auth = () => ({ authorization: `Bearer ${s.participant_token}` });

afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('pedagogy routes', () => {
  it('describe the library, and pass queries to it', async () => {
    const lib = await start(true);
    const info = (await app.inject({ url: `/api/sessions/${s.session_id}/pedagogy`, headers: auth() })).json();
    expect(info).toMatchObject({ available: true, plugin_id: 'pedagogy-scotland', counts: { entries: 2 }, version: 'v1' });
    const r = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/pedagogy/entries`, headers: auth(), payload: { types: ['caution'] } });
    expect(r.json()).toMatchObject({ total: 1, got: { types: ['caution'] } });
    expect(lib.calls.at(-1)).toMatchObject({ url: 'http://library.test', collection: 'pedagogy-scotland', op: 'entries' });
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/pedagogy/entry`, headers: auth(), payload: { id: 'x' } })).statusCode).toBe(404);
  });

  it('say so when there is no pedagogy library, and need the workspace link', async () => {
    await start(false);
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/pedagogy`, headers: auth() })).json()).toEqual({ available: false });
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/pedagogy` })).statusCode).toBe(401);
  });
});
