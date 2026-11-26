import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, nowIso } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

const envelope = { client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

/** A test config whose reader defaults differ from the real 3, £0.50 and safety instruction. */
async function start(reader: { follow_ups_max: number; pupil_budget_gbp: number; safety_instruction?: string } = { follow_ups_max: 7, pupil_budget_gbp: 1.25, safety_instruction: 'Be kind.' }) {
  const base = testDeps(t.db);
  deps = { ...base, loaded: { ...base.loaded, config: { ...base.loaded.config, reader: { ...base.loaded.config.reader, ...reader } } } };
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
}

beforeEach(async () => {
  t = await tempDb();
  await start();
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

const auth = (x: SessionRow) => ({ authorization: `Bearer ${x.participant_token}` });
const post = (path: string, body: Record<string, unknown> = {}, x: SessionRow = s) =>
  app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}${path}`, headers: auth(x), payload: { envelope, ...body } });
const get = (path: string, x: SessionRow = s) => app.inject({ url: `/api/sessions/${x.session_id}${path}`, headers: auth(x) });
const logged = async () => (await deps.events.list(s.session_id)).filter((e) => e.kind === 'class_reader_settings').map((e) => e.payload);

async function newClass(): Promise<string> {
  const y = (await post('/year-groups', { name: 'P6' })).json().year_group;
  return (await post('/classes', { year_group_id: y.id, name: 'P6A' })).json().class.id as string;
}

describe("a class's reader settings", () => {
  it("shows config's values for a class that has not set them", async () => {
    const id = await newClass();
    const res = await get(`/classes/${id}/reader-settings`);
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toEqual({
      follow_ups_max: 7,
      pupil_budget_gbp: 1.25,
      safety_instruction: 'Be kind.',
      defaults: { follow_ups_max: 7, pupil_budget_gbp: 1.25, safety_instruction: 'Be kind.' },
      set: { follow_ups_max: false, pupil_budget_gbp: false, safety_instruction: false },
    });
  });

  it('sets and clears each, logging one event per real change and none for a no-op', async () => {
    const id = await newClass();
    const set = await post(`/classes/${id}/reader-settings`, { follow_ups_max: 2, pupil_budget_gbp: 0.07 });
    expect(set.statusCode).toBe(200);
    expect(set.json().settings).toMatchObject({ follow_ups_max: 2, pupil_budget_gbp: 0.07, set: { follow_ups_max: true, pupil_budget_gbp: true } });
    expect((await get(`/classes/${id}/reader-settings`)).json().settings).toEqual(set.json().settings);

    // The same values again, and an empty change: nothing logged.
    expect((await post(`/classes/${id}/reader-settings`, { follow_ups_max: 2 })).statusCode).toBe(200);
    expect((await post(`/classes/${id}/reader-settings`, {})).statusCode).toBe(200);

    const cleared = (await post(`/classes/${id}/reader-settings`, { pupil_budget_gbp: null })).json().settings;
    expect(cleared).toMatchObject({ follow_ups_max: 2, pupil_budget_gbp: 1.25, set: { follow_ups_max: true, pupil_budget_gbp: false } });
    // Zero is a value, not a clear.
    expect((await post(`/classes/${id}/reader-settings`, { follow_ups_max: 0 })).json().settings).toMatchObject({ follow_ups_max: 0, set: { follow_ups_max: true } });

    // The figures in force after each change (question 81): config's default where cleared.
    expect(await logged()).toEqual([
      { class_id: id, follow_ups_max: 2, pupil_budget_gbp: 0.07 },
      { class_id: id, follow_ups_max: 2, pupil_budget_gbp: 1.25 },
      { class_id: id, follow_ups_max: 0, pupil_budget_gbp: 1.25 },
    ]);
  });

  it('keeps a budget to the penny, so a value a hair off a penny repeated is one change, not three', async () => {
    const id = await newClass();
    for (let i = 0; i < 3; i++) expect((await post(`/classes/${id}/reader-settings`, { pupil_budget_gbp: 1e-9 })).json().settings.pupil_budget_gbp).toBe(0);
    expect((await post(`/classes/${id}/reader-settings`, { pupil_budget_gbp: 0.5000000001 })).json().settings.pupil_budget_gbp).toBe(0.5);
    expect((await post(`/classes/${id}/reader-settings`, { pupil_budget_gbp: 0.5 })).statusCode).toBe(200);
    expect(await logged()).toHaveLength(2);
  });

  it('refuses values out of limits, and changes nothing', async () => {
    const id = await newClass();
    for (const body of [{ follow_ups_max: 11 }, { follow_ups_max: -1 }, { follow_ups_max: 1.5 }, { pupil_budget_gbp: 5.01 }, { pupil_budget_gbp: -0.01 }, { pupil_budget_gbp: 0.505 }, { follow_ups_max: '3' }]) {
      expect((await post(`/classes/${id}/reader-settings`, body)).statusCode).toBe(400);
    }
    expect((await post(`/classes/${id}/reader-settings`, { follow_ups_max: 10, pupil_budget_gbp: 5 })).statusCode).toBe(200);
    expect((await post(`/classes/${id}/reader-settings`, { follow_ups_max: 0, pupil_budget_gbp: 0 })).statusCode).toBe(200);
    expect(await logged()).toHaveLength(2);
  });

  it("is 404 for another workspace's class, and for one that does not exist", async () => {
    const id = await newClass();
    expect((await get(`/classes/${id}/reader-settings`, other)).statusCode).toBe(404);
    expect((await post(`/classes/${id}/reader-settings`, { follow_ups_max: 1 }, other)).statusCode).toBe(404);
    expect((await get('/classes/01J000000000000000000000ZZ/reader-settings')).statusCode).toBe(404);
    expect((await get(`/classes/${id}/reader-settings`)).json().settings.set.follow_ups_max).toBe(false);
  });

  it('follows a change to config for a class that has not chosen, but keeps what was set', async () => {
    const id = await newClass();
    await post(`/classes/${id}/reader-settings`, { follow_ups_max: 4 });
    const first = s;
    await app.close();
    await start({ follow_ups_max: 1, pupil_budget_gbp: 0.2, safety_instruction: 'Be gentle.' });
    const res = await get(`/classes/${id}/reader-settings`, first);
    expect(res.json().settings).toEqual({
      follow_ups_max: 4,
      pupil_budget_gbp: 0.2,
      safety_instruction: 'Be gentle.',
      defaults: { follow_ups_max: 1, pupil_budget_gbp: 0.2, safety_instruction: 'Be gentle.' },
      set: { follow_ups_max: true, pupil_budget_gbp: false, safety_instruction: false },
    });
  });
});

describe('copy to next year', () => {
  it("carries the settings across, logged for the new class, and leaves classes.json's keys alone", async () => {
    const id = await newClass();
    const before = (await buildBundle(deps, s.session_id)).files['classes.json'];
    await post(`/classes/${id}/reader-settings`, { pupil_budget_gbp: 0.8 });
    const next = (await post(`/classes/${id}/copy`)).json().class;
    expect((await get(`/classes/${next.id}/reader-settings`)).json().settings).toMatchObject({ follow_ups_max: 7, pupil_budget_gbp: 0.8, set: { follow_ups_max: false, pupil_budget_gbp: true } });
    expect(await logged()).toEqual([
      { class_id: id, follow_ups_max: 7, pupil_budget_gbp: 0.8 },
      { class_id: next.id, follow_ups_max: 7, pupil_budget_gbp: 0.8 },
    ]);

    const after = JSON.parse(String((await buildBundle(deps, s.session_id)).files['classes.json']));
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(after.classes[0])).toEqual(keys(JSON.parse(String(before)).classes[0]));
  });

  it('logs nothing for a class with no settings', async () => {
    const id = await newClass();
    expect((await post(`/classes/${id}/copy`)).statusCode).toBe(201);
    expect(await logged()).toEqual([]);
  });
});

describe('the browser', () => {
  it('cannot post class_reader_settings to the event route', async () => {
    const id = await newClass();
    const forged = { event_id: newUlid(), client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null, kind: 'class_reader_settings', payload: { class_id: id } };
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/events`, headers: auth(s), payload: { session_id: s.session_id, events: [forged] } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'server_only_kind' });
    expect(await logged()).toEqual([]);
  });
});
