import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import { createProjectService } from '../projects/service.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { queryTerms, readerFor, scorePage, snippetOf } from './reader.js';
import { createReferenceService } from './service.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let sid: string;
let pid: string;
const envelope = { client_ts: '2026-10-31T09:00:00.000Z', focus_pane: 'canvas', doc_id: null, thread_id: null } as const;

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  sid = (await newWorkspace(deps)).session.session_id;
  pid = (await createProjectService(deps.db, deps.events).create(sid, { name: 'Science' }, envelope)).id;
});
afterEach(() => t.cleanup());

const add = (name: string, pages: string[]) =>
  createReferenceService(deps.db, deps.events, deps.loaded.config.references).create(sid, pid, { name, mime: 'text/plain', bytes: 100, pages }, envelope).then((r) => r.file);

describe('readerFor', () => {
  it('reads whole pages from a page on, as many as fit', async () => {
    const f = await add('Long.txt', ['a'.repeat(900), 'b'.repeat(900), 'c'.repeat(900)]);
    const r = await readerFor(deps.db, sid, pid);
    expect(r.files.map((x) => x.id)).toEqual([f.id]);
    const first = (await r.read(f.id, 1, 2000))!;
    expect([first.first, first.last]).toEqual([1, 2]);
    expect(first.text.startsWith('[page 1]\naaa')).toBe(true);
    expect(first.text).toContain('[page 2]\nbbb');
    const rest = (await r.read(f.id, 3, 2000))!;
    expect([rest.first, rest.last]).toEqual([3, 3]);
    // Always at least one page, even when it is longer than asked for.
    expect((await r.read(f.id, 2, 10))!.last).toBe(2);
    expect(await r.read('01JC0000000000000000000000', 1, 2000)).toBeNull();
  });

  it('finds the pages that match best, with a snippet, across files or in the ones named', async () => {
    const a = await add('Forces.txt', ['Gravity pulls objects towards the Earth.', 'Friction slows moving objects. Friction acts against motion; friction makes heat.']);
    const b = await add('Plants.txt', ['Photosynthesis uses light. Plants make food.', 'Friction is not about plants.']);
    const r = await readerFor(deps.db, sid, pid);
    const hits = await r.search('friction');
    expect(hits.map((h) => [h.name, h.page])).toEqual([
      ['Forces.txt', 2],
      ['Plants.txt', 2],
    ]);
    expect(hits[0]!.snippet).toContain('Friction slows');
    expect((await r.search('friction', [b.id])).map((h) => h.file_id)).toEqual([b.id]);
    expect(await r.search('the and')).toEqual([]);
    expect((await r.search('100%_ friction'))[0]!.file_id).toBe(a.id);
  });
});

describe('search helpers', () => {
  it('keeps the words worth searching for', () => {
    expect(queryTerms('What is the Water Cycle? water!')).toEqual(['water', 'cycle']);
  });
  it('scores a page with every term and the phrase above one with some', () => {
    expect(scorePage('the water cycle and rain', ['water', 'cycle'], 'water cycle')).toBeGreaterThan(scorePage('water, then a bicycle', ['water', 'cycle'], 'water cycle'));
    expect(scorePage('nothing here', ['water'], 'water')).toBe(0);
  });
  it('cuts a snippet around the match at word boundaries', () => {
    const text = `${'lorem '.repeat(100)}the key passage is here ${'ipsum '.repeat(100)}`;
    const snip = snippetOf(text, ['key'], 'key');
    expect(snip).toContain('the key passage');
    expect(snip.startsWith('…') && snip.endsWith('…')).toBe(true);
    expect(snip.length).toBeLessThan(340);
  });
});
