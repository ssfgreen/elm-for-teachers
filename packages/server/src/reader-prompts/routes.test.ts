import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { READER_PROMPTS_MAX } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

const envelope = { client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const mine = { label: 'Picture it', instruction: 'Describe a picture that shows this idea. A SECRET instruction.', after_highlight: true, follow_up: true };

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

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

const auth = (x: SessionRow) => ({ authorization: `Bearer ${x.participant_token}` });
const base = (x: SessionRow) => `/api/sessions/${x.session_id}/reader-prompts`;
const list = (x: SessionRow = s) => app.inject({ url: base(x), headers: auth(x) });
const add = (body: object, x: SessionRow = s) => app.inject({ method: 'POST', url: base(x), headers: auth(x), payload: { ...body, envelope } });
const edit = (id: string, body: object, x: SessionRow = s) => app.inject({ method: 'PATCH', url: `${base(x)}/${id}`, headers: auth(x), payload: { ...body, envelope } });
const remove = (id: string, x: SessionRow = s) => app.inject({ method: 'DELETE', url: `${base(x)}/${id}`, headers: auth(x), payload: { envelope } });
const order = (ids: string[], x: SessionRow = s) => app.inject({ method: 'PUT', url: `${base(x)}/order`, headers: auth(x), payload: { prompt_ids: ids, envelope } });
const ids = async (x: SessionRow = s) => ((await list(x)).json().prompts as { id: string }[]).map((p) => p.id);
const logged = async (x: SessionRow = s) => (await deps.events.list(x.session_id)).filter((e) => e.kind.startsWith('reader_prompt_')).map((e) => [e.kind, e.payload]);

describe('the reader prompt library', () => {
  it("starts with config's defaults once, logged as added from the defaults", async () => {
    const res = await list();
    expect(res.statusCode).toBe(200);
    const prompts = res.json().prompts;
    expect(prompts.map((p: { label: string }) => p.label)).toEqual(deps.loaded.config.reader.default_prompts.map((p) => p.label));
    expect(prompts[0]).toEqual({ id: expect.any(String), ...deps.loaded.config.reader.default_prompts[0] });
    expect((await list()).json().prompts).toEqual(prompts);
    expect(await logged()).toEqual(prompts.map((p: { id: string }) => ['reader_prompt_add', { prompt_id: p.id }]));
  });

  it('adds, edits and removes a prompt, logging ids only', async () => {
    const created = await add(mine);
    expect(created.statusCode).toBe(201);
    const p = created.json().prompt;
    expect(p).toEqual({ id: expect.any(String), ...mine });
    expect((await ids()).at(-1)).toBe(p.id);

    const changed = await edit(p.id, { label: '  Picture  ', follow_up: false });
    expect(changed.json().prompt).toEqual({ ...p, label: 'Picture', follow_up: false });
    // An edit that changes nothing is not logged.
    expect((await edit(p.id, { follow_up: false })).statusCode).toBe(200);

    expect((await remove(p.id)).statusCode).toBe(204);
    expect(await ids()).not.toContain(p.id);

    const mineLogged = (await logged()).filter(([, payload]) => (payload as { prompt_id?: string }).prompt_id === p.id);
    expect(mineLogged).toEqual([
      ['reader_prompt_add', { prompt_id: p.id }],
      ['reader_prompt_edit', { prompt_id: p.id }],
      ['reader_prompt_remove', { prompt_id: p.id }],
    ]);
    const events = JSON.stringify(await deps.events.list(s.session_id));
    expect(events).not.toContain('SECRET');
    expect(events).not.toContain('Picture');
  });

  it('keeps the order the teacher sets, and logs it', async () => {
    const a = (await add(mine)).json().prompt.id as string;
    const before = await ids();
    const turned = [...before].reverse();
    const res = await order(turned);
    expect(res.statusCode).toBe(200);
    expect(res.json().prompts.map((p: { id: string }) => p.id)).toEqual(turned);
    expect(await ids()).toEqual(turned);
    // A new prompt goes at the end; removing one keeps the others' order.
    const b = (await add({ ...mine, label: 'Later' })).json().prompt.id as string;
    await remove(a);
    expect(await ids()).toEqual([...turned.filter((id) => id !== a), b]);
    expect((await logged()).filter(([k]) => k === 'reader_prompt_reorder')).toEqual([['reader_prompt_reorder', { prompt_ids: turned }]]);
  });

  it('does not bring the defaults back once the teacher has removed them all', async () => {
    for (const id of await ids()) await remove(id);
    expect(await ids()).toEqual([]);
    expect(await ids()).toEqual([]);
  });

  it('refuses a prompt without a label or an instruction, or with a label too long', async () => {
    for (const body of [{ ...mine, label: '   ' }, { ...mine, instruction: '' }, { ...mine, label: 'x'.repeat(41) }, { label: 'Only a label' }]) {
      const res = await add(body);
      expect(res.statusCode).toBe(400);
    }
    const [first] = await ids();
    expect((await edit(first!, { instruction: ' ' })).statusCode).toBe(400);
  });

  it(`holds at most ${READER_PROMPTS_MAX} prompts`, async () => {
    const have = (await ids()).length;
    for (let i = have; i < READER_PROMPTS_MAX; i++) expect((await add({ ...mine, label: `P${i}` })).statusCode).toBe(201);
    const res = await add(mine);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('too_many_prompts');
  });

  it('refuses an order that is not every prompt once', async () => {
    const all = await ids();
    for (const wrong of [all.slice(1), [...all, all[0]!], [...all.slice(1), 'nope'], [all[0]!, all[0]!]]) {
      const res = await order(wrong);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('prompts_changed');
    }
    expect(await ids()).toEqual(all);
  });

  it("is the owner's only: another workspace's token is refused, and its prompts cannot be reached by id", async () => {
    const p = (await add(mine)).json().prompt.id as string;
    expect((await app.inject({ url: base(s) })).statusCode).toBe(401);
    expect((await app.inject({ url: base(s), headers: auth(other) })).statusCode).toBe(403);
    // Through its own path, the other workspace finds no such prompt.
    expect((await edit(p, { label: 'Mine now' }, other)).statusCode).toBe(404);
    expect((await remove(p, other)).statusCode).toBe(404);
    expect((await order([p], other)).statusCode).toBe(409);
    expect(await ids(other)).not.toContain(p);
    expect((await list()).json().prompts.find((x: { id: string }) => x.id === p)).toEqual({ id: p, ...mine });
    expect((await edit('no-such-prompt', { label: 'x' })).statusCode).toBe(404);
  });

  it("goes with its workspace when the workspace is deleted, and leaves another's alone", async () => {
    await add(mine);
    await list(other);
    await deps.sessions.delete(s.session_id);
    const count = async (id: string) => Number((await t.db.execute('SELECT COUNT(*) AS n FROM reader_prompts WHERE session_id = ?', [id])).rows[0]!.n);
    expect(await count(s.session_id)).toBe(0);
    expect(await count(other.session_id)).toBe(deps.loaded.config.reader.default_prompts.length);
  });
});
