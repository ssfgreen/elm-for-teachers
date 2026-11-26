import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Doc, LoadedConfig, Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { rowToBlock } from '../db/rows.js';
import type { AppDeps } from '../deps.js';
import type { PictureLibrary, PictureOption } from '../pictures/arasaac.js';
import { newWorkspace, tempDb, testDeps, testLoaded, typeLine, type TempDb } from '../test-helpers.js';
import { loadTurns } from './history.js';
import { arasaacPicture, storePictures } from './pictures.js';
import { createChatService, type TurnInput } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const envelope = { client_ts: '2026-11-06T12:00:00.000Z', focus_pane: 'chat' } as const;
const APPLES: PictureOption[] = [
  { id: 2462, label: 'apple' },
  { id: 13645, label: 'apple' },
  { id: 3203, label: 'apple tree' },
];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

/** A library that finds apples (and nothing else) and has every picture but 13645. */
function library(): PictureLibrary & { searched: string[]; fetched: number[] } {
  const searched: string[] = [];
  const fetched: number[] = [];
  return {
    searched,
    fetched,
    search: async (q) => (searched.push(q), q === 'apple' ? APPLES : []),
    image: async (id) => (fetched.push(id), id === 13645 ? null : PNG),
  };
}

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;

const input = (text: string): TurnInput => ({ thread_id: thread.id, doc_id: doc.id, text, envelope });
async function blocksInDb() {
  const r = await t.db.execute('SELECT * FROM blocks WHERE session_id = ?', [sid]);
  return r.rows.map(rowToBlock);
}

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  loaded = { ...testLoaded(), config: { ...testLoaded().config, mode: 'agent', agent: { max_steps: 6, max_turn_ms: 200_000, reasoning_effort: 'medium', tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] } } };
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  ({ session: { session_id: sid }, thread, doc } = await newWorkspace(deps));
});

describe('arasaacPicture', () => {
  it('reads a picture reference, and nothing else', () => {
    expect(arasaacPicture('![an apple](arasaac:2462)')).toEqual({ id: 2462, alt: 'an apple' });
    expect(arasaacPicture(' ![](arasaac:7) ')).toEqual({ id: 7, alt: '' });
    expect(arasaacPicture('![an apple](asset:ast_1)')).toBeNull();
    expect(arasaacPicture('see ![x](arasaac:1) here')).toBeNull();
  });
});

describe('storePictures', () => {
  it('leaves other content alone, and drops a picture no search found', async () => {
    const ops = [
      { op: 'insert' as const, after: 'start', type: 'paragraph' as const, content: '![x](arasaac:2462)' },
      { op: 'insert' as const, after: 'start', type: 'image' as const, content: '![x](arasaac:99)' },
    ];
    const r = await storePictures(ops, new Set(), [{ query: 'apple', options: APPLES }], new Map([[2462, PNG]]), async () => 'ast_x');
    expect(r.operations).toEqual([ops[0]]);
    expect(r.dropped).toEqual([{ index: 1, op: ops[1], reason: 'invalid_image' }]);
    expect(r.offers).toEqual([]);
  });
});

describe('a turn that uses a picture from ARASAAC', () => {
  it('searches, saves the picture as a PNG in the block, and keeps the others found to offer the teacher', async () => {
    const pics = library();
    const { provider } = scripted(
      () => ({ calls: [{ name: 'search_pictures', args: { query: 'apple' } }] }),
      () => ({
        calls: [
          {
            name: 'edit_document',
            args: {
              operations: [
                { op: 'insert', after: 'start', type: 'image', content: '![an apple](arasaac:2462)' },
                // Not from a search this turn, and one that cannot be fetched: both dropped.
                { op: 'insert', after: 'start', type: 'image', content: '![a cat](arasaac:555)' },
                { op: 'insert', after: 'start', type: 'image', content: '![](arasaac:13645)' },
              ],
            },
          },
        ],
      }),
      () => ({ text: 'I added a picture of an apple.' }),
    );
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded, pictures: pics });
    await typeLine(deps, sid, doc, thread);
    const r = await chat.runTurn(sid, input('Add a picture of an apple'));
    if (!r.ok) throw new Error('expected ok');
    expect(pics.searched).toEqual(['apple']);
    // 555 was never fetched: no search found it.
    expect(pics.fetched.sort()).toEqual([13645, 2462]);
    expect(r.dropped).toBe(2);

    const img = (await blocksInDb()).find((b) => b.type === 'image')!;
    expect(img.status).toBe('proposed');
    const m = /^!\[an apple\]\(asset:(ast_\w+)\)$/.exec(img.content);
    expect(m).not.toBeNull();
    const stored = await t.db.execute('SELECT mime, data, filename FROM assets WHERE asset_id = ?', [m![1]!]);
    expect(stored.rows[0]).toMatchObject({ mime: 'image/png', filename: 'an apple.png' });
    expect(Buffer.from(stored.rows[0]!.data as ArrayBuffer)).toEqual(PNG);
    expect((await deps.events.list(sid, { kinds: ['asset_upload'] })).at(-1)!.payload).toMatchObject({ asset_id: m![1], mime: 'image/png', turn_id: r.turn_id });

    const offer = { block_id: img.id, alt: 'an apple', chosen: 2462, options: APPLES };
    expect(r.pictures).toEqual([offer]);
    expect((await loadTurns(t.db, sid)).at(-1)!.pictures).toEqual([offer]);
    expect((await chat.listTurns(sid, thread.id)).at(-1)!.pictures).toEqual([offer]);
  });

  it('applies nothing when a Stop comes in while the picture is fetched', async () => {
    // The fetch is the last wait before the commit: a Stop during it must still win.
    const closed = new AbortController();
    const pics = library();
    const slow: PictureLibrary = { search: pics.search, image: async (id) => (closed.abort(), pics.image(id)) };
    const { provider } = scripted(
      () => ({ calls: [{ name: 'search_pictures', args: { query: 'apple' } }] }),
      () => ({ calls: [{ name: 'edit_document', args: { operations: [{ op: 'insert', after: 'start', type: 'image', content: '![an apple](arasaac:2462)' }] } }] }),
      () => ({ text: 'I added a picture of an apple.' }),
    );
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded, pictures: slow });
    const r = await chat.runTurn(sid, input('Add a picture of an apple'), { signal: closed.signal });
    expect(r).toMatchObject({ ok: false, stopped: true });
    expect((await blocksInDb()).filter((b) => b.type === 'image')).toEqual([]);
    expect(await loadTurns(t.db, sid)).toEqual([]);
  });

  it('tells the model to draw when there is no picture library', async () => {
    const { provider, requests } = scripted(
      () => ({ calls: [{ name: 'search_pictures', args: { query: 'apple' } }] }),
      () => ({ text: 'Done.' }),
    );
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded });
    const r = await chat.runTurn(sid, input('Add a picture of an apple'));
    expect(r.ok && r.pictures).toBeFalsy();
    expect(JSON.stringify(requests[1]!.input)).toContain('draw the picture as an SVG instead');
  });
});
