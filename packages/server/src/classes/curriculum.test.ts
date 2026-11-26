import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { fakeLibrary, withLibraries, type FakeCall } from '../pedagogy/test-library.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { outcomesQuery } from './curriculum-routes.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;
let calls: FakeCall[];

const envelope = { client_ts: '2026-11-12T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const post = (path: string, body: Record<string, unknown> = {}, x: SessionRow = s) =>
  app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}${path}`, headers: { authorization: `Bearer ${x.participant_token}` }, payload: { envelope, ...body } });
const get = (path: string) => app.inject({ url: `/api/sessions/${s.session_id}${path}`, headers: { authorization: `Bearer ${s.participant_token}` } });

const LIT = { code: 'LIT 2-16a', text: 'I can identify the purpose and main ideas of a text.', source_version: 'abc123' };
const ENG = { code: 'ENG 2-19a', text: 'I can discuss structure, characterisation and setting.', source_version: 'abc123' };

beforeEach(async () => {
  t = await tempDb();
  const lib = fakeLibrary({
    structure: { benchmark_levels: ['second', 'third'], areas: [{ id: 'literacy-and-english', name: 'Literacy and English', organisers: ['Reading'] }] },
    outcomes: { total: 1, truncated: false, outcomes: [{ code: LIT.code, codes: [LIT.code], text: LIT.text, area: 'Literacy and English', organiser: 'Reading', sub_organiser: 'Understanding, analysing and evaluating', level: 'second' }] },
    benchmarks: (b) => ({ benchmark_levels: ['second', 'third'], benchmarks: [{ id: 'bm-1', area: 'Literacy and English', level: 'second', section: 'Reading', organiser: 'Understanding, analysing and evaluating', codes: b.codes, text: 'Identifies the main ideas of a text with appropriate detail.' }] }),
  });
  calls = lib.calls;
  deps = withLibraries(testDeps(t.db), lib.clientFor);
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

async function aClass() {
  const y = (await post('/year-groups', { name: 'P7' })).json().year_group;
  return (await post('/classes', { year_group_id: y.id, name: '7B', stage: 'Primary 7' })).json().class;
}

describe('a class curriculum', () => {
  it('picks items with their text and version, once each, and logs them in full', async () => {
    const c = await aClass();
    const first = (await post(`/classes/${c.id}/curriculum`, { items: [LIT, ENG] })).json().items;
    expect(first.map((i: { code: string; status: string }) => [i.code, i.status])).toEqual([['LIT 2-16a', 'now'], ['ENG 2-19a', 'now']]);
    expect((await post(`/classes/${c.id}/curriculum`, { items: [LIT], status: 'planned' })).json().items).toEqual([]);
    const detail = (await get(`/classes/${c.id}`)).json();
    expect(detail.curriculum).toHaveLength(2);
    expect(detail.curriculum[0]).toMatchObject({ code: 'LIT 2-16a', text: LIT.text, source_version: 'abc123', framework: 'cfe-eo', kind: 'eo' });
    const ev = (await deps.events.list(s.session_id, { kinds: ['curriculum_pick'] as never })).map((e) => e.payload);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ class_id: c.id, items: [{ code: 'LIT 2-16a', text: LIT.text }, { code: 'ENG 2-19a' }] });
  });

  it('moves an item to done, takes one off, and keeps another workspace out', async () => {
    const c = await aClass();
    const [a, b] = (await post(`/classes/${c.id}/curriculum`, { items: [LIT, ENG] })).json().items;
    expect((await post(`/classes/${c.id}/curriculum/${a.id}/status`, { status: 'done' })).json().item.status).toBe('done');
    await post(`/classes/${c.id}/curriculum/${b.id}/status`, { status: 'removed' });
    expect((await get(`/classes/${c.id}`)).json().curriculum.map((i: { code: string }) => i.code)).toEqual(['LIT 2-16a']);
    const ev = (await deps.events.list(s.session_id, { kinds: ['curriculum_status'] as never })).map((e) => e.payload);
    expect(ev).toEqual([
      { class_id: c.id, item_id: a.id, code: 'LIT 2-16a', status: 'done', before: 'now' },
      { class_id: c.id, item_id: b.id, code: 'ENG 2-19a', status: 'removed', before: 'now' },
    ]);
    expect((await post(`/classes/${c.id}/curriculum/${a.id}/status`, { status: 'now' }, other)).statusCode).toBe(404);
    expect((await post(`/classes/${c.id}/curriculum`, { items: [LIT] }, other)).statusCode).toBe(404);
  });

  it('goes into the research bundle with its class', async () => {
    const c = await aClass();
    await post(`/classes/${c.id}/curriculum`, { items: [LIT] });
    const { files } = await buildBundle(deps, s.session_id);
    const classes = JSON.parse(files['classes.json'] as string);
    expect(classes.classes[0].curriculum[0]).toMatchObject({ code: 'LIT 2-16a', text: LIT.text });
  });
});

describe('the curriculum', () => {
  it('searches the structured collection by words at a level, and lists each outcome with its organiser', async () => {
    const r = (await post('/curriculum/search', { query: 'main ideas', level: 2, area: 'Literacy and English' })).json();
    expect(r.options).toEqual([{ code: 'LIT 2-16a', text: LIT.text, area: 'Literacy and English', organiser: 'Reading', sub_organiser: 'Understanding, analysing and evaluating' }]);
    expect(r.version).toBe('v1');
    expect(calls.at(-1)).toMatchObject({ collection: 'cfe-curriculum', op: 'outcomes', body: { level: 'second', area: 'Literacy and English', text: 'main ideas' } });
  });

  it('gives its shape and the benchmarks for codes', async () => {
    expect((await get('/curriculum')).json()).toMatchObject({ benchmark_levels: ['second', 'third'] });
    const b = (await post('/curriculum/benchmarks', { codes: ['LIT 2-16a'] })).json();
    expect(b.benchmarks[0]).toMatchObject({ codes: ['LIT 2-16a'], text: 'Identifies the main ideas of a text with appropriate detail.' });
  });

  it('reads a code, the start of one, or letters as a code, and anything else as words', () => {
    expect(outcomesQuery({ query: 'lit 2-1' })).toMatchObject({ text: 'lit 2-1' });
    expect(outcomesQuery({ query: 'LIT 2-1' })).toMatchObject({ code: 'LIT 2-1' });
    expect(outcomesQuery({ query: 'SOC', level: 3 })).toMatchObject({ code: 'SOC', level: 'third' });
    expect(outcomesQuery({ query: 'main ideas', stage: 'p7' })).toMatchObject({ text: 'main ideas', stage: 'p7' });
  });
});
