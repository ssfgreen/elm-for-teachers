import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

const envelope = { client_ts: '2026-10-31T09:00:00.000Z', focus_pane: 'chat', doc_id: null, thread_id: null };
const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const url = (path = '', x: SessionRow = s) => `/api/sessions/${x.session_id}/projects${path}`;
const post = (path: string, body: Record<string, unknown>, x: SessionRow = s) => app.inject({ method: 'POST', url: url(path, x), headers: auth(x), payload: { envelope, ...body } });
const list = async (x: SessionRow = s) => (await app.inject({ url: url('', x), headers: auth(x) })).json().projects;
const newChat = (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads`, headers: auth(), payload: { envelope, ...body } });

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

describe('projects', () => {
  it('creates, renames and archives a project, logging each', async () => {
    const created = await post('', { name: '  P6 Science  ' });
    expect(created.statusCode).toBe(201);
    const p = created.json().project;
    expect(p).toMatchObject({ session_id: s.session_id, name: 'P6 Science', instructions: null, archived_at: null, deleted_at: null });

    expect((await post(`/${p.id}/rename`, { name: 'P6 Forces' })).json().project.name).toBe('P6 Forces');
    const archived = (await post(`/${p.id}/archive`, {})).json().project;
    expect(archived.archived_at).toEqual(expect.any(String));
    // Archiving again changes nothing and logs nothing.
    expect((await post(`/${p.id}/archive`, {})).json().project.archived_at).toBe(archived.archived_at);

    expect(await list()).toEqual([{ ...p, name: 'P6 Forces', archived_at: archived.archived_at }]);
    const logged = await deps.events.list(s.session_id, { kinds: ['project_create', 'project_rename', 'project_archive'] });
    expect(logged.map((e) => [e.kind, e.payload])).toEqual([
      ['project_create', { project_id: p.id, name: 'P6 Science', description: null }],
      ['project_rename', { project_id: p.id, name: 'P6 Forces' }],
      ['project_archive', { project_id: p.id }],
    ]);
  });

  it('deletes a project and its chats only when DELETE is typed, keeping both for the research export', async () => {
    const p = (await post('', { name: 'P6 Forces' })).json().project;
    const inside = (await newChat({ project_id: p.id })).json().thread;
    const loose = (await newChat({})).json().thread;
    const threads = async () => (await app.inject({ url: `/api/sessions/${s.session_id}/threads`, headers: auth() })).json().threads.map((x: { id: string }) => x.id);

    for (const confirm of [undefined, 'delete', 'DELETE ']) expect((await post(`/${p.id}/delete`, { confirm })).statusCode).toBe(400);
    expect((await post(`/${p.id}/delete`, { confirm: 'DELETE' }, other)).statusCode).toBe(404);
    expect(await list()).toHaveLength(1);

    const res = await post(`/${p.id}/delete`, { confirm: 'DELETE' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ project: { ...p, deleted_at: expect.any(String) }, thread_ids: [inside.id] });
    // Gone for the teacher: the project, and its chat from the chats list.
    expect(await list()).toEqual([]);
    expect(await threads()).not.toContain(inside.id);
    expect(await threads()).toContain(loose.id);
    // Deleting again is a 404.
    expect((await post(`/${p.id}/delete`, { confirm: 'DELETE' })).statusCode).toBe(404);

    const logged = await deps.events.list(s.session_id, { kinds: ['project_delete'] });
    expect(logged.map((e) => e.payload)).toEqual([{ project_id: p.id, thread_ids: [inside.id] }]);
    const { files } = await buildBundle(deps, s.session_id);
    expect(JSON.parse(files['projects.json'] as string)).toEqual([{ ...p, deleted_at: expect.any(String) }]);
    expect(JSON.parse(files['threads.json'] as string).map((x: { id: string }) => x.id)).toContain(inside.id);
  });

  it('takes a description when made, and updates the description and instructions, logging only what changed', async () => {
    const p = (await post('', { name: 'P6 Forces', description: ' Teach forces to P6. ' })).json().project;
    expect(p.description).toBe('Teach forces to P6.');
    const u1 = (await post(`/${p.id}/update`, { instructions: 'British spelling. Dotted lines for answers.' })).json().project;
    expect(u1).toMatchObject({ description: 'Teach forces to P6.', instructions: 'British spelling. Dotted lines for answers.' });
    // The same text again logs nothing; empty text clears.
    await post(`/${p.id}/update`, { instructions: 'British spelling. Dotted lines for answers.', description: 'Teach forces to P6.' });
    expect((await post(`/${p.id}/update`, { description: '  ' })).json().project.description).toBeNull();
    expect((await post(`/${p.id}/update`, { instructions: 'x'.repeat(8001) })).statusCode).toBe(400);
    expect((await post(`/${p.id}/update`, { instructions: 'x' }, other)).statusCode).toBe(404);
    const logged = await deps.events.list(s.session_id, { kinds: ['project_create', 'project_update'] });
    expect(logged.map((e) => e.payload)).toEqual([
      { project_id: p.id, name: 'P6 Forces', description: 'Teach forces to P6.' },
      { project_id: p.id, instructions: 'British spelling. Dotted lines for answers.' },
      { project_id: p.id, description: null },
    ]);
  });

  it("refuses an empty name and another workspace's project", async () => {
    expect((await post('', { name: '   ' })).statusCode).toBe(400);
    const p = (await post('', { name: 'Mine' })).json().project;
    expect((await post(`/${p.id}/rename`, { name: 'Theirs' }, other)).statusCode).toBe(404);
    expect((await post(`/${p.id}/archive`, {}, other)).statusCode).toBe(404);
    expect(await list(other)).toEqual([]);
    expect((await app.inject({ url: url('', other), headers: auth() })).statusCode).toBe(403);
  });

  it('starts a chat in a project, or outside one as before', async () => {
    const p = (await post('', { name: 'Year 7 English' })).json().project;
    const inside = await newChat({ project_id: p.id });
    expect(inside.statusCode).toBe(201);
    expect(inside.json().thread.project_id).toBe(p.id);
    expect((await newChat({})).json().thread.project_id).toBeNull();

    const created = await deps.events.list(s.session_id, { kinds: ['thread_create'] });
    expect(created.at(-2)!.payload).toMatchObject({ thread_id: inside.json().thread.id, project_id: p.id });

    const threads = (await app.inject({ url: `/api/sessions/${s.session_id}/threads`, headers: auth() })).json().threads;
    expect(threads.map((x: { project_id: string | null }) => x.project_id)).toEqual([null, p.id, null]);
  });

  it("won't start a chat in an archived project or another workspace's", async () => {
    const p = (await post('', { name: 'Old' })).json().project;
    const theirs = (await post('', { name: 'Theirs' }, other)).json().project;
    await post(`/${p.id}/archive`, {});
    expect((await newChat({ project_id: p.id })).statusCode).toBe(409);
    expect((await newChat({ project_id: theirs.id })).statusCode).toBe(404);
    expect((await deps.threads.list(s.session_id)).length).toBe(1);
  });

  it('exports projects.json and each thread’s project, and goes when the workspace is deleted', async () => {
    const p = (await post('', { name: 'Topic' })).json().project;
    await newChat({ project_id: p.id });
    const { files } = await buildBundle(deps, s.session_id);
    expect(JSON.parse(files['projects.json'] as string)).toEqual([p]);
    expect(JSON.parse(files['threads.json'] as string).map((x: { project_id: string | null }) => x.project_id)).toEqual([null, p.id]);

    expect(await deps.sessions.delete(s.session_id)).not.toBeNull();
    expect((await deps.db.execute('SELECT COUNT(*) AS n FROM projects WHERE session_id = ?', [s.session_id])).rows[0]!.n).toBe(0);
  });
});
