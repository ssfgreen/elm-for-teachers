import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { ADMIN_PASSWORD, clientEvent, focusEvent, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { interactionsActive } from '../http/views.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;

const admin = { authorization: `Bearer ${ADMIN_PASSWORD}` };
const setLogging = (body: Record<string, unknown>, id = s.session_id) =>
  app.inject({ method: 'PUT', url: `/api/admin/sessions/${id}/interactions`, headers: admin, payload: body });
const click = () => clientEvent('click', { pane: 'canvas', block_id: null, item: null, x: 1, y: 2, button: 0, count: 1, control: null });
const send = (events = [focusEvent(), click()]) =>
  app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/events`, headers: { authorization: `Bearer ${s.participant_token}` }, payload: { session_id: s.session_id, events } });
const kinds = async () => (await deps.events.list(s.session_id)).map((e) => e.kind);

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('interactionsActive', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  it('is on until the end time, and off without the switch', () => {
    expect(interactionsActive({ interactions_on: true, interactions_until: null }, now)).toBe(true);
    expect(interactionsActive({ interactions_on: true, interactions_until: '2026-11-10T12:00:01.000Z' }, now)).toBe(true);
    expect(interactionsActive({ interactions_on: true, interactions_until: '2026-11-10T12:00:00.000Z' }, now)).toBe(false);
    expect(interactionsActive({ interactions_on: false, interactions_until: null }, now)).toBe(false);
  });
});

describe('interaction logging', () => {
  it('is off for a new workspace: interaction events are dropped and the client is told', async () => {
    expect(s.interactions_on).toBe(false);
    const r = await send();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ accepted: 1, interactions: false });
    expect(await kinds()).not.toContain('click');
    const info = await app.inject({ url: `/api/sessions/${s.session_id}`, headers: { authorization: `Bearer ${s.participant_token}` } });
    expect(info.json().config.interactions).toBe(false);
  });

  it('turned on in admin, keeps interaction events and logs the switch', async () => {
    const on = await setLogging({ on: true, hours: null });
    expect(on.statusCode).toBe(200);
    expect(on.json().session).toMatchObject({ interactions_on: true, interactions_until: null, interactions_active: true });
    const r = await send();
    expect(r.json()).toMatchObject({ accepted: 2, interactions: true });
    expect(await kinds()).toEqual(expect.arrayContaining(['interaction_logging_set', 'focus', 'click']));
    const info = await app.inject({ url: `/api/sessions/${s.session_id}`, headers: { authorization: `Bearer ${s.participant_token}` } });
    expect(info.json().config.interactions).toBe(true);
    const listed = (await app.inject({ url: '/api/admin/sessions', headers: admin })).json().sessions[0];
    expect(listed).toMatchObject({ interactions_on: true, interactions_active: true });
  });

  it('turned on for some hours, stops by itself', async () => {
    const before = Date.now();
    const on = (await setLogging({ on: true, hours: 3 })).json().session;
    const until = Date.parse(on.interactions_until);
    expect(until).toBeGreaterThanOrEqual(before + 3 * 3600_000);
    expect(until).toBeLessThan(before + 3 * 3600_000 + 60_000);
    const set = (await deps.events.list(s.session_id)).find((e) => e.kind === 'interaction_logging_set');
    expect(set?.payload).toEqual({ on: true, until: on.interactions_until });
    // Past its end: the row still says on, but nothing is kept.
    await t.db.execute('UPDATE sessions SET interactions_until = ? WHERE session_id = ?', ['2026-01-01T00:00:00.000Z', s.session_id]);
    expect((await send([click()])).json()).toMatchObject({ accepted: 0, interactions: false });
  });

  it('turned off, drops them again', async () => {
    await setLogging({ on: true, hours: null });
    const off = await setLogging({ on: false });
    expect(off.json().session).toMatchObject({ interactions_on: false, interactions_until: null, interactions_active: false });
    expect((await send([click()])).json()).toMatchObject({ accepted: 0, interactions: false });
    const sets = (await deps.events.list(s.session_id)).filter((e) => e.kind === 'interaction_logging_set').map((e) => e.payload);
    expect(sets).toEqual([{ on: true, until: null }, { on: false, until: null }]);
  });

  it('refuses a bad request, an unknown workspace and a participant', async () => {
    expect((await setLogging({ on: true, hours: 0 })).statusCode).toBe(400);
    expect((await setLogging({ on: true, hours: 721 })).statusCode).toBe(400);
    expect((await setLogging({ on: 'yes' })).statusCode).toBe(400);
    expect((await setLogging({ on: true }, 'nope')).statusCode).toBe(404);
    const asTeacher = await app.inject({ method: 'PUT', url: `/api/admin/sessions/${s.session_id}/interactions`, headers: { authorization: `Bearer ${s.participant_token}` }, payload: { on: true } });
    expect(asTeacher.statusCode).toBe(401);
  });
});
