import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_FEATURES } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { createSessionService } from '../sessions/service.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
const admin = { authorization: `Bearer ${ADMIN_PASSWORD}` };

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

async function workspace(features?: Record<string, boolean>) {
  const res = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label: 'Year 7', ...(features ? { features } : {}) } });
  expect(res.statusCode).toBe(201);
  return res.json().session as { session_id: string; participant_token: string; features: Record<string, boolean> };
}

const put = (id: string, payload: object, headers: Record<string, string> = admin) =>
  app.inject({ method: 'PUT', url: `/api/admin/sessions/${id}/features`, headers, payload });

const stored = async (id: string) => (await t.db.execute('SELECT features FROM sessions WHERE session_id = ?', [id])).rows[0]?.features ?? null;

async function featureEvents(id: string): Promise<unknown[]> {
  const r = await t.db.execute("SELECT payload FROM events WHERE session_id = ? AND kind = 'workspace_features_set' ORDER BY seq", [id]);
  return r.rows.map((row) => JSON.parse(String(row.payload)));
}

const config = async (s: { session_id: string; participant_token: string }) =>
  (await app.inject({ url: `/api/sessions/${s.session_id}`, headers: { authorization: `Bearer ${s.participant_token}` } })).json().config;

describe('PUT /api/admin/sessions/:id/features', () => {
  it('starts all on, with nothing stored and nothing logged', async () => {
    const s = await workspace();
    expect(s.features).toEqual(DEFAULT_FEATURES);
    expect(await stored(s.session_id)).toBeNull();
    expect(await featureEvents(s.session_id)).toEqual([]);
  });

  it('turns switches off and on, stores only what differs, and logs each change', async () => {
    const s = await workspace();
    const off = await put(s.session_id, { features: { spyglass: false, classes: false } });
    expect(off.statusCode).toBe(200);
    expect(off.json().session.features).toEqual({ ...DEFAULT_FEATURES, spyglass: false, classes: false });
    expect(JSON.parse(String(await stored(s.session_id)))).toEqual({ spyglass: false, classes: false });

    // Keys left out keep their value; curriculum stays on with classes off.
    const back = await put(s.session_id, { features: { spyglass: true } });
    expect(back.json().session.features).toEqual({ ...DEFAULT_FEATURES, classes: false });

    const all = await put(s.session_id, { features: { classes: true } });
    expect(all.json().session.features).toEqual(DEFAULT_FEATURES);
    expect(await stored(s.session_id)).toBeNull();

    expect(await featureEvents(s.session_id)).toEqual([
      { features: { ...DEFAULT_FEATURES, spyglass: false, classes: false }, changed: ['classes', 'spyglass'], via: 'password' },
      { features: { ...DEFAULT_FEATURES, classes: false }, changed: ['spyglass'], via: 'password' },
      { features: DEFAULT_FEATURES, changed: ['classes'], via: 'password' },
    ]);
  });

  it('starts with pupils off, and an admin turns them on, logged (#179)', async () => {
    const s = await workspace();
    expect(s.features.pupils).toBe(false);
    const on = await put(s.session_id, { features: { pupils: true } });
    expect(on.json().session.features).toEqual({ ...DEFAULT_FEATURES, pupils: true });
    expect(JSON.parse(String(await stored(s.session_id)))).toEqual({ pupils: true });
    expect(await featureEvents(s.session_id)).toEqual([{ features: { ...DEFAULT_FEATURES, pupils: true }, changed: ['pupils'], via: 'password' }]);
    // The workspace's own token cannot.
    const other = await workspace();
    expect((await put(other.session_id, { features: { pupils: true } }, { authorization: `Bearer ${other.participant_token}` })).statusCode).toBe(401);
  });

  it('is for admins only', async () => {
    const s = await workspace();
    expect((await put(s.session_id, { features: { plugins: false } }, {})).statusCode).toBe(401);
    // The workspace's own token is not an admin's.
    expect((await put(s.session_id, { features: { plugins: false } }, { authorization: `Bearer ${s.participant_token}` })).statusCode).toBe(401);
    expect(await stored(s.session_id)).toBeNull();
    expect(await featureEvents(s.session_id)).toEqual([]);
  });

  it('answers 404 for an unknown workspace and 400 for an unknown switch', async () => {
    expect((await put('01JZZZZZZZZZZZZZZZZZZZZZZZ', { features: { plugins: false } })).statusCode).toBe(404);
    const s = await workspace();
    expect((await put(s.session_id, { features: { gadgets: false } })).statusCode).toBe(400);
    expect((await put(s.session_id, { features: { plugins: 'off' } })).statusCode).toBe(400);
    expect((await put(s.session_id, {})).statusCode).toBe(400);
  });

  it('writes the switches and the event in one transaction: no event, no change', async () => {
    const s = await workspace();
    const failing = createSessionService(t.db, deps.loaded, { ...deps.events, appendServer: () => Promise.reject(new Error('log down')) }, deps.threads);
    await expect(failing.setFeatures(s.session_id, { pedagogy: false }, 'password')).rejects.toThrow('log down');
    expect(await stored(s.session_id)).toBeNull();
  });
});

describe('creating a workspace with switches', () => {
  it('stores them, logs them, and refuses an unknown one', async () => {
    const s = await workspace({ plugins: false });
    expect(s.features).toEqual({ ...DEFAULT_FEATURES, plugins: false });
    expect(await featureEvents(s.session_id)).toEqual([{ features: { ...DEFAULT_FEATURES, plugins: false }, changed: ['plugins'], via: 'password' }]);
    const bad = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label: 'X', features: { gadgets: false } } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('GET /api/sessions/:id config', () => {
  it('sends the switches, and spyglass off when its switch is off', async () => {
    const s = await workspace();
    const on = await config(s);
    expect(on.features).toEqual(DEFAULT_FEATURES);
    expect(on.spyglass).toBe(deps.loaded.config.spyglass.mode);
    expect(on.spyglass).not.toBe('off');

    await put(s.session_id, { features: { spyglass: false, curriculum: false } });
    const off = await config(s);
    expect(off.features).toEqual({ ...DEFAULT_FEATURES, spyglass: false, curriculum: false });
    expect(off.spyglass).toBe('off');
  });
});
