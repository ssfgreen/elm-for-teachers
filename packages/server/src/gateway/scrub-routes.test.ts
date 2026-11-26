import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type GatewayCall, type Pupil, type SchoolClass } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { classMessage } from './class-message.js';
import { gatewayCallPayloads, saveGatewayCall } from './history.js';
import { scrubSessions, type ScrubDeps } from './scrub-routes.js';

const adminAuth = { authorization: `Bearer ${ADMIN_PASSWORD}` };
const T = '2026-11-12T09:00:00.000Z';
const cls = { id: '01JC0000000000000000000002', name: 'P7A', stage: null, subject: null, note: null } as SchoolClass;
const pupil = (number: number, label: string, helps: string): Pupil => ({ id: `01JC000000000000000000000${number}`, class_id: cls.id, number, label, needs: ['Dyslexia'], helps, working_at: null, note: null, position: number, created_at: T, archived_at: null });
const TABLE = classMessage(cls, null, [pupil(1, 'tidy-puffin', 'Comic Sans 14pt'), pupil(2, 'jolly-teapot', 'Amber overlay')], true).text;

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

/** A workspace with two calls that sent the table and one that did not. */
async function workspace(table = TABLE): Promise<string> {
  const { session, thread, doc } = await newWorkspace(deps);
  const call = (content: string): GatewayCall => ({
    gateway_call_id: `gw_${newUlid()}`,
    session_id: session.session_id,
    thread_id: thread.id,
    doc_id: doc.id,
    turn_id: 't_1',
    model: 'mock',
    temperature: 1,
    system_prompt_hash: 'h',
    serialized_canvas: 'docs',
    trimmed_history: [{ role: 'user', content: 'hi' }],
    running_summary: null,
    raw_response: 'raw',
    parsed_message: 'msg',
    parsed_operations: [],
    dropped: [],
    latency_ms: 3,
    input_tokens: 10,
    output_tokens: 2,
    provider_request_id: null,
    error: null,
    at: T,
    request: { input: [{ role: 'developer', content }, { role: 'user', content: 'Make it shorter' }] },
  });
  await t.db.transaction(async (tx) => {
    await saveGatewayCall(tx, call(table), {});
    await saveGatewayCall(tx, call(table), {});
    await saveGatewayCall(tx, call('no class here'), {});
  });
  return session.session_id;
}

const post = (url: string, payload?: Record<string, unknown>, headers = adminAuth) => app.inject({ method: 'POST', url, headers, ...(payload ? { payload } : {}) });
/** Stands in for the record of an export, which the export item adds. */
const exported = (ids: string[]): ScrubDeps => ({ ...deps, exportTaken: (_x, id) => Promise.resolve(ids.includes(id)) });
const scrubEvents = async (sid: string) => (await deps.events.list(sid)).filter((e) => e.kind === 'pupil_rows_scrub');

describe('the pupil scrub over stored calls', () => {
  // Off until Sam decides what removal should do (13 Nov 2026): the app serves no scrub route.
  it('is not served by the app', async () => {
    const sid = await workspace();
    const before = await gatewayCallPayloads(t.db, sid);
    for (const url of [`/api/admin/sessions/${sid}/scrub-pupil-rows`, '/api/admin/scrub-pupil-rows']) {
      expect((await post(url)).statusCode).toBe(404);
      expect((await post(url, { apply: true })).statusCode).toBe(404);
    }
    expect(await gatewayCallPayloads(t.db, sid)).toEqual(before);
    expect(await scrubEvents(sid)).toEqual([]);
  });

  it('dry runs: counts only, and nothing changes', async () => {
    const sid = await workspace();
    const other = await workspace();
    const before = await gatewayCallPayloads(t.db, sid);
    const counts = await scrubSessions(deps, [sid, other], false);
    expect(counts).toEqual([
      { session_id: sid, calls: 2, tables: 2, rows: 4, unsure: 0, leftover: 0 },
      { session_id: other, calls: 2, tables: 2, rows: 4, unsure: 0, leftover: 0 },
    ]);
    expect(JSON.stringify(counts)).not.toContain('tidy-puffin');
    expect(await gatewayCallPayloads(t.db, sid)).toEqual(before);
    expect(await scrubEvents(sid)).toEqual([]);
  });

  it('refuses a real run with no export taken, and changes nothing', async () => {
    const sid = await workspace();
    const before = await gatewayCallPayloads(t.db, sid);
    await expect(scrubSessions(deps, [sid], true)).rejects.toMatchObject({ statusCode: 409, code: 'export_required' });
    expect(await gatewayCallPayloads(t.db, sid)).toEqual(before);
    expect(await scrubEvents(sid)).toEqual([]);
  });

  it('a real run removes the tables, keeps the rest, and logs one event with counts and no pupil text', async () => {
    const sid = await workspace();
    const before = await gatewayCallPayloads(t.db, sid);
    expect(await scrubSessions(exported([sid]), [sid], true)).toEqual([{ session_id: sid, calls: 2, tables: 2, rows: 4, unsure: 0, leftover: 0 }]);
    const after = await gatewayCallPayloads(t.db, sid);
    expect(JSON.stringify(after)).not.toContain('Comic Sans');
    expect(JSON.stringify(after)).not.toContain('tidy-puffin');
    expect(after[2]).toEqual(before[2]);
    const call = JSON.parse(after[0]!.payload) as GatewayCall & { request: { input: { content: string }[] } };
    expect(call.request.input[0]!.content).toMatch(/\[pupil table removed: 2 rows, sha256 [0-9a-f]{64}\]/);
    expect(call.request.input[1]!.content).toBe('Make it shorter');
    expect(call.input_tokens).toBe(10);
    const events = await scrubEvents(sid);
    expect(events.map((e) => e.payload)).toEqual([{ calls: 2, tables: 2, rows: 4, unsure: 0, leftover: 0 }]);
    expect(JSON.stringify(events)).not.toContain('tidy-puffin');
    // A second run finds nothing, and says so.
    expect(await scrubSessions(exported([sid]), [sid], true)).toEqual([{ session_id: sid, calls: 0, tables: 0, rows: 0, unsure: 0, leftover: 0 }]);
    expect((await scrubEvents(sid)).map((e) => e.payload)).toEqual([{ calls: 2, tables: 2, rows: 4, unsure: 0, leftover: 0 }, { calls: 0, tables: 0, rows: 0, unsure: 0, leftover: 0 }]);
  });

  it('checks the export inside the run, for each workspace, so no caller can skip it', async () => {
    const sid = await workspace();
    const before = await gatewayCallPayloads(t.db, sid);
    await expect(scrubSessions(deps, [sid], true)).rejects.toMatchObject({ statusCode: 409, code: 'export_required' });
    const seen: string[] = [];
    const checked: ScrubDeps = { ...deps, exportTaken: (_x, id) => (seen.push(id), Promise.resolve(false)) };
    await expect(scrubSessions(checked, [sid], true)).rejects.toMatchObject({ code: 'export_required' });
    expect(seen).toEqual([sid]);
    expect(await gatewayCallPayloads(t.db, sid)).toEqual(before);
    expect(await scrubEvents(sid)).toEqual([]);
  });

  it('changes no workspace when any one of them has no export', async () => {
    const a = await workspace();
    const b = await workspace();
    const before = await gatewayCallPayloads(t.db, a);
    await expect(scrubSessions(exported([a]), [a, b], true)).rejects.toMatchObject({ code: 'export_required' });
    expect(await gatewayCallPayloads(t.db, a)).toEqual(before);
    expect(await scrubEvents(a)).toEqual([]);
  });

  it('reports rows it would leave, and a real run refuses that workspace', async () => {
    const left = classMessage({ ...cls, note: 'Groups:\n- Pupil 9, ghost-owl: Dyslexia.' }, null, [pupil(1, 'tidy-puffin', 'Comic Sans 14pt')], true).text;
    const sid = await workspace(left);
    expect(await scrubSessions(deps, [sid], false)).toEqual([{ session_id: sid, calls: 2, tables: 2, rows: 2, unsure: 0, leftover: 2 }]);
    const before = await gatewayCallPayloads(t.db, sid);
    const clean = await workspace();
    const other = await workspace(left);
    const all = [sid, clean, other];
    const refused = scrubSessions(exported(all), all, true);
    await expect(refused).rejects.toMatchObject({ statusCode: 409, code: 'pupil_rows_left' });
    // The answer names each workspace with rows left, and how many: ids and numbers only.
    const message = ((await refused.catch((e: unknown) => e)) as Error).message;
    expect(message).toContain(`${sid}: 2`);
    expect(message).toContain(`${other}: 2`);
    expect(message).not.toContain(clean);
    expect(message).not.toContain('ghost-owl');
    expect(await gatewayCallPayloads(t.db, sid)).toEqual(before);
    for (const id of all) expect(await scrubEvents(id)).toEqual([]);
  });

  it('runs on a workspace whose class note holds a row line but sent no table', async () => {
    const countsOnly = classMessage({ ...cls, note: 'Seating:\n- Pupil 3, keep apart from 4' }, null, [pupil(1, 'tidy-puffin', 'x')], false).text;
    const sid = await workspace(countsOnly);
    expect(await scrubSessions(exported([sid]), [sid], true)).toEqual([{ session_id: sid, calls: 0, tables: 0, rows: 0, unsure: 0, leftover: 0 }]);
  });
});
