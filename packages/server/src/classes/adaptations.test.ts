import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

const envelope = { client_ts: '2026-11-12T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const post = (path: string, body: Record<string, unknown> = {}, x: SessionRow = s) =>
  app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}${path}`, headers: { authorization: `Bearer ${x.participant_token}` }, payload: { envelope, ...body } });
const get = (path: string) => app.inject({ url: `/api/sessions/${s.session_id}${path}`, headers: { authorization: `Bearer ${s.participant_token}` } });
const changes = async () => (await deps.events.list(s.session_id, { kinds: ['pupils_change'] as never })).map((e) => e.payload as { op: string; fields?: string[]; table: { hash: string } });

const SPACING = { entry_id: 'adp-ACC-individual-spacing-background', title: 'Individual letter spacing, font size and background preferences', changes_goal: false };

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

async function aPupil() {
  const y = (await post('/year-groups', { name: 'P7' })).json().year_group;
  const c = (await post('/classes', { year_group_id: y.id, name: '7B' })).json().class;
  const [p] = (await post(`/classes/${c.id}/pupils`, { pupils: [{ label: 'tidy-puffin', needs: ['Dyslexia'] }] })).json().pupils;
  return { y, c, p };
}

describe("a pupil's adaptations", () => {
  it('are chosen with a status and the pupil’s own settings, and come with the class', async () => {
    const { c, p } = await aPupil();
    const r = await post(`/classes/${c.id}/pupils/${p.id}/adaptations`, { ...SPACING, status: 'confirmed', overrides: ' cream background, 14pt ' });
    expect(r.statusCode).toBe(201);
    expect(r.json().adaptation).toMatchObject({ pupil_id: p.id, entry_id: SPACING.entry_id, status: 'confirmed', overrides: 'cream background, 14pt', changes_goal: false });
    expect((await post(`/classes/${c.id}/pupils/${p.id}/adaptations`, SPACING)).statusCode).toBe(409);
    expect((await get(`/classes/${c.id}`)).json().adaptations).toHaveLength(1);
  });

  it('are logged as a change to the table, with its shape and never which adaptation (option B)', async () => {
    const { c, p } = await aPupil();
    const a = (await post(`/classes/${c.id}/pupils/${p.id}/adaptations`, SPACING)).json().adaptation;
    await post(`/classes/${c.id}/adaptations/${a.id}/update`, { status: 'stopped' });
    await post(`/classes/${c.id}/adaptations/${a.id}/remove`);
    const log = await changes();
    expect(log.map((x) => [x.op, x.fields])).toEqual([['add', undefined], ['update', ['adaptations']], ['update', ['adaptations']], ['update', ['adaptations']]]);
    // Each change makes a new hash; taking the last one off hashes as the table did before.
    expect(new Set(log.map((x) => x.table.hash)).size).toBe(3);
    expect(log[3]!.table.hash).toBe(log[0]!.table.hash);
    const all = JSON.stringify(await deps.events.list(s.session_id));
    expect(all).not.toContain('adp-ACC');
    expect(all).not.toContain('cream');
    const { files } = await buildBundle(deps, s.session_id);
    expect(files['classes.json']).not.toContain('adp-ACC');
  });

  it('go with the pupil to another class, and stay out of another workspace', async () => {
    const { y, c, p } = await aPupil();
    const a = (await post(`/classes/${c.id}/pupils/${p.id}/adaptations`, SPACING)).json().adaptation;
    expect((await post(`/classes/${c.id}/adaptations/${a.id}/update`, { status: 'confirmed' }, other)).statusCode).toBe(404);
    expect((await post(`/classes/${c.id}/pupils/${p.id}/adaptations`, SPACING, other)).statusCode).toBe(404);
    const d = (await post('/classes', { year_group_id: y.id, name: '7C' })).json().class;
    await post(`/classes/${c.id}/pupils/${p.id}/move`, { to_class_id: d.id });
    expect((await get(`/classes/${c.id}`)).json().adaptations).toEqual([]);
    expect((await get(`/classes/${d.id}`)).json().adaptations.map((x: { id: string }) => x.id)).toEqual([a.id]);
  });
});
