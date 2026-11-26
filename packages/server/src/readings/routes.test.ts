import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type Doc, type Thread } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

const envelope = { client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null } as const;

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let thread: Thread;
let doc: Doc;
let other: { session: SessionRow; doc: Doc };
let classId: string;
let promptIds: string[];

const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const at = (path: string, x: SessionRow = s) => `/api/sessions/${x.session_id}${path}`;
const post = (path: string, body: object, x: SessionRow = s) => app.inject({ method: 'POST', url: at(path, x), headers: auth(x), payload: { ...body, envelope } });
const readings = (c = classId) => `/classes/${c}/readings`;
const list = async (c = classId) => (await app.inject({ url: at(readings(c)), headers: auth() })).json().readings;
const set = (body: object, c = classId) => post(readings(c), body);
const patch = (id: string, body: object) => app.inject({ method: 'PATCH', url: at(`${readings()}/${id}`), headers: auth(), payload: { ...body, envelope } });
const remove = (id: string) => app.inject({ method: 'DELETE', url: at(`${readings()}/${id}`), headers: auth(), payload: { envelope } });
const logged = async () => (await deps.events.list(s.session_id)).filter((e) => e.kind.startsWith('reading_')).map((e) => [e.kind, e.payload]);
const stored = async (id: string) => (await t.db.execute('SELECT blocks, content_hash, removed_at FROM readings WHERE id = ?', [id])).rows[0]!;

/** Teacher's own text goes straight in; a later Suggesting turn's insert waits as a proposal. */
const write = (d: Doc, th: Pick<Thread, 'id'>, sid: string, operations: object[], direct: boolean) =>
  deps.canvas.applyTurn(sid, { turn_id: newUlid(), cause_event_id: newUlid(), thread_id: th.id, default_doc_id: d.id, operations: operations as never, direct }, { envelope });

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  ({ session: s, thread, doc } = await newWorkspace(deps));
  other = await newWorkspace(deps, 'B');
  const y = (await post('/year-groups', { name: 'P7' })).json().year_group;
  classId = (await post('/classes', { year_group_id: y.id, name: '7B' })).json().class.id;
  promptIds = ((await app.inject({ url: at('/reader-prompts'), headers: auth() })).json().prompts as { id: string }[]).map((p) => p.id);
  await write(doc, thread, s.session_id, [{ op: 'insert', after: 'start', type: 'heading', content: '# Rain', temp_id: 'h' }, { op: 'insert', after: 'h', type: 'paragraph', content: 'Water falls.' }], true);
  await write(doc, thread, s.session_id, [{ op: 'insert', after: 'start', type: 'paragraph', content: 'A proposed line.' }], false);
});

afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('readings', () => {
  it('lists the docs a reading can be set from, newest first, without deleted ones', async () => {
    const second = (await post('/blocks/doc_create', { command: 'doc_create', thread_id: thread.id, name: 'Second' })).json();
    const sources = async () => (await app.inject({ url: at('/reading-sources'), headers: auth() })).json().sources;
    const names = (await sources()).map((x: { name: string }) => x.name);
    expect(names[0]).toBe('Second');
    expect(names).toContain(doc.name);
    expect((await sources())[0]).toEqual({ doc_id: second.doc.id, name: 'Second', thread_title: thread.title, created_at: expect.any(String) });
    await post('/blocks/doc_delete', { command: 'doc_delete', doc_id: second.doc.id });
    expect((await sources()).map((x: { doc_id: string }) => x.doc_id)).not.toContain(second.doc.id);
  });

  it('keeps a frozen copy of live blocks that later edits and a delete do not change, logging ids, the limit and the hash', async () => {
    const res = await set({ doc_id: doc.id, prompt_ids: [promptIds[1]], follow_ups_max: null });
    expect(res.statusCode).toBe(201);
    const r = res.json().reading;
    expect(r).toEqual({ id: expect.any(String), class_id: classId, doc_id: doc.id, name: doc.name, prompt_ids: [promptIds[1]], follow_ups_max: null, created_at: expect.any(String), updated_at: expect.any(String) });
    const before = await stored(r.id);
    expect(JSON.parse(String(before.blocks)).map((b: { content: string }) => b.content)).toEqual(['# Rain', 'Water falls.']);

    const heading = [...(await deps.canvas.loadState(s.session_id)).blocks.values()].find((b) => b.content === '# Rain')!;
    await write(doc, thread, s.session_id, [{ op: 'replace', id: heading.id, content: '# Snow' }], true);
    await post('/blocks/doc_delete', { command: 'doc_delete', doc_id: doc.id });
    const after = await stored(r.id);
    expect([after.blocks, after.content_hash]).toEqual([before.blocks, before.content_hash]);
    expect(await list()).toEqual([r]);

    expect(await logged()).toEqual([['reading_set', { reading_id: r.id, class_id: classId, doc_id: doc.id, prompt_ids: [promptIds[1]], follow_ups_max: null, content_hash: before.content_hash }]]);
  });

  it("pins the keys of each event: ids, and for a set or update the limit and the copy's hash, never the name or text", async () => {
    const r = (await set({ doc_id: doc.id, prompt_ids: promptIds, follow_ups_max: 2 })).json().reading;
    await patch(r.id, { follow_ups_max: 5 });
    await remove(r.id);
    const figures = ['class_id', 'content_hash', 'doc_id', 'follow_ups_max', 'prompt_ids', 'reading_id'];
    expect((await logged()).map(([kind, payload]) => [kind, Object.keys(payload as object).sort()])).toEqual([
      ['reading_set', figures],
      ['reading_update', figures],
      ['reading_remove', ['class_id', 'doc_id', 'reading_id']],
    ]);
    const hash = (await stored(r.id)).content_hash;
    expect((await logged()).slice(0, 2).map(([, p]) => p)).toMatchObject([
      { follow_ups_max: 2, content_hash: hash },
      { follow_ups_max: 5, content_hash: hash },
    ]);
    const all = JSON.stringify(await logged());
    expect(all).not.toContain('Water falls');
    expect(all).not.toContain(JSON.stringify(doc.name));
  });

  it('updates the prompts and the override, and removes a reading but keeps its row', async () => {
    const r = (await set({ doc_id: doc.id, prompt_ids: promptIds, follow_ups_max: 2 })).json().reading;
    // The same prompts in another order are not a change: they are kept in the library's order.
    expect((await patch(r.id, { prompt_ids: [promptIds[1], promptIds[0]] })).json().reading).toEqual(r);
    const changed = (await patch(r.id, { prompt_ids: [promptIds[1]], follow_ups_max: null })).json().reading;
    expect(changed).toMatchObject({ prompt_ids: [promptIds[1]], follow_ups_max: null });
    expect((await list())[0]).toEqual(changed);
    // Nothing changed: not logged.
    expect((await patch(r.id, { follow_ups_max: null })).statusCode).toBe(200);
    expect((await logged()).map(([k]) => k)).toEqual(['reading_set', 'reading_update']);

    expect((await remove(r.id)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await stored(r.id)).removed_at).toEqual(expect.any(String));
    expect((await remove(r.id)).statusCode).toBe(404);
    expect((await patch(r.id, { follow_ups_max: 1 })).statusCode).toBe(404);
  });

  it("keeps a reading's prompts in the library's order, whatever order they were sent in", async () => {
    const r = (await set({ doc_id: doc.id, prompt_ids: [promptIds[1], promptIds[0]], follow_ups_max: null })).json().reading;
    expect(r.prompt_ids).toEqual(promptIds);
    expect((await list())[0].prompt_ids).toEqual(promptIds);
  });

  it('replaces the reading when the same doc is set again, with a fresh copy', async () => {
    const first = (await set({ doc_id: doc.id, prompt_ids: promptIds, follow_ups_max: null })).json().reading;
    const second = (await set({ doc_id: doc.id, prompt_ids: [promptIds[0]], follow_ups_max: 1 })).json().reading;
    expect((await list()).map((r: { id: string }) => r.id)).toEqual([second.id]);
    expect((await stored(first.id)).removed_at).toEqual(expect.any(String));
    expect((await logged()).map(([k]) => k)).toEqual(['reading_set', 'reading_remove', 'reading_set']);
  });

  it('refuses what it should', async () => {
    const ok = { doc_id: doc.id, prompt_ids: [promptIds[0]], follow_ups_max: null };
    const code = async (body: object, c?: string) => {
      const res = await set(body, c);
      return [res.statusCode, res.json().code];
    };
    expect(await code({ ...ok, doc_id: other.doc.id })).toEqual([404, 'not_found']);
    expect(await code(ok, 'nope')).toEqual([404, 'not_found']);
    expect(await code({ ...ok, prompt_ids: ['nope'] })).toEqual([409, 'prompt_unavailable']);
    await app.inject({ method: 'DELETE', url: at(`/reader-prompts/${promptIds[0]}`), headers: auth(), payload: { envelope } });
    expect(await code(ok)).toEqual([409, 'prompt_unavailable']);
    const fine = { ...ok, prompt_ids: [promptIds[1]] };
    expect(await code({ ...fine, prompt_ids: [] })).toEqual([400, 'invalid_request']);
    expect(await code({ ...fine, prompt_ids: [promptIds[1], promptIds[1]] })).toEqual([400, 'invalid_request']);
    expect(await code({ ...fine, follow_ups_max: 11 })).toEqual([400, 'invalid_request']);
    expect(await code({ ...fine, follow_ups_max: -1 })).toEqual([400, 'invalid_request']);
    const r = (await set(fine)).json().reading;
    expect((await patch(r.id, { prompt_ids: [] })).statusCode).toBe(400);
    expect((await patch(r.id, { prompt_ids: [promptIds[0]] })).json().code).toBe('prompt_unavailable');
    // Another workspace cannot see or change this one's readings.
    expect((await app.inject({ url: at(readings(), other.session), headers: auth(other.session) })).statusCode).toBe(404);

    await post('/blocks/doc_delete', { command: 'doc_delete', doc_id: doc.id });
    expect(await code(fine)).toEqual([404, 'not_found']);
    await post(`/classes/${classId}/archive`, {});
    expect(await code({ ...fine, doc_id: (await post('/blocks/doc_create', { command: 'doc_create', thread_id: thread.id, name: 'New' })).json().doc.id })).toEqual([409, 'class_archived']);
    // An archived class's readings can still be changed and removed.
    expect((await patch(r.id, { follow_ups_max: 4 })).statusCode).toBe(200);
  });

  it('goes with the workspace when it is deleted', async () => {
    await set({ doc_id: doc.id, prompt_ids: promptIds, follow_ups_max: null });
    const gone = await app.inject({ method: 'DELETE', url: `/api/admin/sessions/${s.session_id}`, headers: { authorization: `Bearer ${deps.env.ADMIN_PASSWORD}` } });
    expect(gone.statusCode).toBe(204);
    for (const table of ['readings', 'reading_prompts']) {
      expect(Number((await t.db.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [s.session_id])).rows[0]!.n), table).toBe(0);
    }
  });
});
