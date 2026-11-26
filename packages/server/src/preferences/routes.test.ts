import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

const envelope = { client_ts: '2026-11-12T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const get = (x: SessionRow = s) => app.inject({ url: `/api/sessions/${x.session_id}/preferences`, headers: auth(x) });
const post = (body: Record<string, unknown>, x: SessionRow = s) => app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}/preferences`, headers: auth(x), payload: { envelope, ...body } });
const logged = async () => (await deps.events.list(s.session_id, { kinds: ['preferences_set'] })).map((e) => e.payload);

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

describe('preferences', () => {
  it('start unset, and keep what was set for this workspace only', async () => {
    expect((await get()).json()).toEqual({ preferences: { teacher_note: null, default_font: null } });
    const res = await post({ teacher_note: '  I teach P5.  ', default_font: 'lexend' });
    expect(res.statusCode).toBe(200);
    expect(res.json().preferences).toEqual({ teacher_note: 'I teach P5.', default_font: 'lexend' });
    expect((await get()).json().preferences).toEqual({ teacher_note: 'I teach P5.', default_font: 'lexend' });
    expect((await get(other)).json().preferences).toEqual({ teacher_note: null, default_font: null });
  });

  it('changes only the fields given, logs only what changed, and blank text clears the note', async () => {
    await post({ teacher_note: 'I teach P5.' });
    await post({ default_font: 'georgia' });
    await post({ default_font: 'georgia' });
    await post({ teacher_note: ' ' });
    expect((await get()).json().preferences).toEqual({ teacher_note: null, default_font: 'georgia' });
    expect(await logged()).toEqual([{ teacher_note: 'I teach P5.' }, { default_font: 'georgia' }, { teacher_note: null }]);
  });

  it('refuses a font that is not one, and a note that is too long', async () => {
    expect((await post({ default_font: 'wingdings' })).statusCode).toBe(400);
    expect((await post({ teacher_note: 'x'.repeat(2001) })).statusCode).toBe(400);
    expect(await logged()).toEqual([]);
  });

  it('needs the workspace link', async () => {
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/preferences` })).statusCode).toBe(401);
  });
});

describe('the default font', () => {
  it('a new chat and a new doc start in it, and their doc_create says so', async () => {
    await post({ default_font: 'lexend' });
    const w = await deps.threads.create(s.session_id, envelope);
    expect(w.doc.style).toEqual({ font: 'lexend' });
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/blocks/doc_create`, headers: auth(), payload: { thread_id: w.thread.id, name: 'Untitled', envelope } });
    expect(res.json().doc.style).toEqual({ font: 'lexend' });
    const created = await deps.events.list(s.session_id, { kinds: ['doc_create'] });
    expect(created.slice(-2).map((e) => (e.payload as { style?: unknown }).style)).toEqual([{ font: 'lexend' }, { font: 'lexend' }]);
    // Docs made before the preference keep their look.
    const first = (await deps.canvas.snapshot(s.session_id)).docs.find((d) => d.thread_id !== w.thread.id)!;
    expect(first.style).toBeUndefined();
  });
});
