import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, nowIso, SAFETY_INSTRUCTION_MAX } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { classSafetyInstruction } from './reader-settings.js';

const envelope = { client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const DEFAULT = 'Be kind, and ask nothing personal.';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

beforeEach(async () => {
  t = await tempDb();
  const base = testDeps(t.db);
  deps = { ...base, loaded: { ...base.loaded, config: { ...base.loaded.config, reader: { ...base.loaded.config.reader, safety_instruction: DEFAULT } } } };
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

const auth = (x: SessionRow) => ({ authorization: `Bearer ${x.participant_token}` });
const post = (path: string, body: Record<string, unknown> = {}, x: SessionRow = s) =>
  app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}${path}`, headers: auth(x), payload: { envelope, ...body } });
const get = (path: string, x: SessionRow = s) => app.inject({ url: `/api/sessions/${x.session_id}${path}`, headers: auth(x) });
const kinds = async () => (await deps.events.list(s.session_id)).filter((e) => e.kind.startsWith('class_reader')).map((e) => e.kind);
const logged = async () => (await deps.events.list(s.session_id)).filter((e) => e.kind === 'class_reader_safety_set').map((e) => e.payload);
const said = (id: string, isDefault: boolean, text: string) => ({ class_id: id, is_default: isDefault, text_hash: `sha256:${sha256Hex(text)}`, text_length: text.length });
const setText = (id: string, safety_instruction: unknown) => post(`/classes/${id}/reader-settings`, { safety_instruction });
const instruction = (id: string, x: SessionRow = s) => classSafetyInstruction(deps.db, x.session_id, id, deps.loaded.config.reader);

async function newClass(): Promise<string> {
  const y = (await post('/year-groups', { name: 'P6' })).json().year_group;
  return (await post('/classes', { year_group_id: y.id, name: 'P6A' })).json().class.id as string;
}

describe("a class's safety instruction for the reader", () => {
  it("is config's default until the class sets its own", async () => {
    const id = await newClass();
    expect((await get(`/classes/${id}/reader-settings`)).json().settings).toMatchObject({ safety_instruction: DEFAULT, defaults: { safety_instruction: DEFAULT }, set: { safety_instruction: false } });
    expect(await instruction(id)).toBe(DEFAULT);
  });

  it('sets it (trimmed), goes back to the default, and logs a hash and length but never the text', async () => {
    const id = await newClass();
    const own = 'Only talk about the reading. Never ask where a pupil lives.';
    const res = await setText(id, `  ${own}\n`);
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ safety_instruction: own, set: { safety_instruction: true }, defaults: { safety_instruction: DEFAULT } });
    expect(await instruction(id)).toBe(own);

    // The same text again is a no-op: nothing logged.
    expect((await setText(id, own)).statusCode).toBe(200);
    const back = (await setText(id, null)).json().settings;
    expect(back).toMatchObject({ safety_instruction: DEFAULT, set: { safety_instruction: false } });
    expect((await setText(id, null)).statusCode).toBe(200);
    expect(await instruction(id)).toBe(DEFAULT);

    expect(await logged()).toEqual([said(id, false, own), said(id, true, DEFAULT)]);
    // Neither the class's text nor the default reaches the log, and the numbers' event is not logged.
    const all = JSON.stringify(await deps.events.list(s.session_id));
    expect(all).not.toContain('Never ask where');
    expect(all).not.toContain('ask nothing personal');
    expect(await kinds()).toEqual(['class_reader_safety_set', 'class_reader_safety_set']);
  });

  it('logs both events when one change sets a figure and the instruction', async () => {
    const id = await newClass();
    await post(`/classes/${id}/reader-settings`, { follow_ups_max: 1, safety_instruction: 'Short replies.' });
    expect(await kinds()).toEqual(['class_reader_settings', 'class_reader_safety_set']);
  });

  it('refuses an empty one, an over-long one and a non-string, and changes nothing', async () => {
    const id = await newClass();
    for (const v of ['', '   \n ', 'x'.repeat(SAFETY_INSTRUCTION_MAX + 1), 42, ['a']]) expect((await setText(id, v)).statusCode).toBe(400);
    expect(await logged()).toEqual([]);
    expect(await instruction(id)).toBe(DEFAULT);
    expect((await setText(id, 'x'.repeat(SAFETY_INSTRUCTION_MAX))).statusCode).toBe(200);
  });

  it("is scoped to the workspace: another workspace's class is 404 and has no instruction", async () => {
    const id = await newClass();
    expect((await setText(id, 'Mine.')).statusCode).toBe(200);
    expect((await post(`/classes/${id}/reader-settings`, { safety_instruction: 'Theirs.' }, other)).statusCode).toBe(404);
    expect(await instruction(id, other)).toBeNull();
    expect(await instruction(id)).toBe('Mine.');
  });

  it("is copied to next year when the class has its own, logged for the new class", async () => {
    const id = await newClass();
    await setText(id, 'Our class rules.');
    const next = (await post(`/classes/${id}/copy`)).json().class;
    expect((await get(`/classes/${next.id}/reader-settings`)).json().settings).toMatchObject({ safety_instruction: 'Our class rules.', set: { safety_instruction: true } });
    expect(await logged()).toEqual([said(id, false, 'Our class rules.'), said(next.id, false, 'Our class rules.')]);
    // Only the instruction was carried, so the numbers' event is not logged for the copy.
    expect(await kinds()).toEqual(['class_reader_safety_set', 'class_reader_safety_set']);
  });

  it('cannot be logged by the browser', async () => {
    const id = await newClass();
    const forged = { event_id: newUlid(), client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null, kind: 'class_reader_safety_set', payload: said(id, true, DEFAULT) };
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/events`, headers: auth(s), payload: { session_id: s.session_id, events: [forged] } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'server_only_kind' });
  });
});
