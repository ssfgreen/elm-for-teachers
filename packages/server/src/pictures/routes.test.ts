import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Doc, PictureOffer, Thread } from '@edw/shared';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { rowToBlock } from '../db/rows.js';
import type { AppDeps } from '../deps.js';
import { createChatService } from '../gateway/service.js';
import { scripted } from '../gateway/test-fixtures.js';
import { DEFAULT_TOOLS } from '../gateway/tools/index.js';
import { newWorkspace, tempDb, testDeps, testLoaded, typeLine, type TempDb } from '../test-helpers.js';
import type { PictureLibrary } from './arasaac.js';

const PNG = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, n]);
const OPTIONS = [
  { id: 2462, label: 'apple' },
  { id: 3203, label: 'apple tree' },
  { id: 9057, label: 'apple pie / pie' },
];
const envelope = { client_ts: '2026-11-06T12:00:00.000Z', focus_pane: 'chat' as const, doc_id: null, thread_id: null };

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let library: PictureLibrary & { down: Set<number> };
let sid: string;
let token: string;
let thread: Thread;
let doc: Doc;

beforeAll(async () => {
  t = await tempDb();
  const down = new Set<number>();
  library = { down, search: async () => OPTIONS, image: async (id) => (down.has(id) ? null : PNG(id % 256)) };
  deps = { ...testDeps(t.db), pictures: library };
  app = await buildApp(deps);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});
beforeEach(async () => {
  library.down.clear();
  const w = await newWorkspace(deps);
  ({ session_id: sid, participant_token: token } = w.session);
  ({ thread, doc } = w);
});

/** A turn in which the assistant put in an apple from ARASAAC; returns its offer. */
async function turnWithPicture(): Promise<{ turn_id: string; offer: PictureOffer }> {
  // With a line of the teacher's in it, so the picture is a suggestion (a blank doc takes the turn straight in).
  await typeLine(deps, sid, doc, thread);
  const { provider } = scripted(
    () => ({ calls: [{ name: 'search_pictures', args: { query: 'apple' } }] }),
    () => ({ calls: [{ name: 'edit_document', args: { operations: [{ op: 'insert', after: 'start', type: 'image', content: '![an apple](arasaac:2462)' }] } }] }),
    () => ({ text: 'Here is an apple.' }),
  );
  const loaded = { ...testLoaded(), config: { ...testLoaded().config, mode: 'agent' as const, agent: { max_steps: 6, max_turn_ms: 200_000, reasoning_effort: 'medium' as const, tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] } } };
  const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded, pictures: library });
  const r = await chat.runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Add an apple', envelope });
  if (!r.ok || !r.pictures?.[0]) throw new Error('expected a picture');
  return { turn_id: r.turn_id, offer: r.pictures[0] };
}

const choose = (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/api/sessions/${sid}/pictures/choose`, headers: { authorization: `Bearer ${token}` }, payload: { envelope, ...body } });
const blockOf = async (id: string) => rowToBlock((await t.db.execute('SELECT * FROM blocks WHERE id = ?', [id])).rows[0]!);

describe('POST /pictures/choose', () => {
  it('puts the picture chosen in the block, accepting it, and logs the choice', async () => {
    const { turn_id, offer } = await turnWithPicture();
    const res = await choose({ turn_id, block_id: offer.block_id, picture: 3203 });
    expect(res.statusCode).toBe(200);
    const { asset_id, changes } = res.json() as { asset_id: string; changes: { blocks: { id: string; content: string; status: string }[] } };
    expect(changes.blocks).toEqual([expect.objectContaining({ id: offer.block_id, content: `![apple tree](asset:${asset_id})`, status: 'live' })]);
    expect(changes.blocks[0]).not.toHaveProperty('origin');

    const block = await blockOf(offer.block_id);
    expect(block).toMatchObject({ status: 'live', content: `![apple tree](asset:${asset_id})` });
    const stored = await t.db.execute('SELECT mime, filename, data FROM assets WHERE asset_id = ?', [asset_id]);
    expect(stored.rows[0]).toMatchObject({ mime: 'image/png', filename: 'apple tree.png' });
    expect(Buffer.from(stored.rows[0]!.data as ArrayBuffer)).toEqual(PNG(3203 % 256));

    const kinds = (await deps.events.list(sid)).map((e) => e.kind);
    expect(kinds.slice(-4)).toEqual(['asset_upload', 'picture_choose', 'block_revision', 'proposal_accept']);
    const chose = (await deps.events.list(sid, { kinds: ['picture_choose'] }))[0]!;
    expect(chose.payload).toEqual({ turn_id, block_id: offer.block_id, picture: 3203, position: 1, replaced: 2462, asset_id });
    expect((await deps.events.list(sid, { kinds: ['proposal_accept'] })).at(-1)!.payload).toEqual({ block_id: offer.block_id, doc_id: null, mode: 'edit_then_accept' });
  });

  it('takes only a picture the turn offered for that block', async () => {
    const { turn_id, offer } = await turnWithPicture();
    expect((await choose({ turn_id, block_id: offer.block_id, picture: 555 })).statusCode).toBe(404);
    expect((await choose({ turn_id: 'turn_nope', block_id: offer.block_id, picture: 3203 })).statusCode).toBe(404);
    expect((await choose({ turn_id, block_id: doc.id, picture: 3203 })).statusCode).toBe(404);
    expect((await choose({ turn_id, block_id: offer.block_id, picture: 'x' })).statusCode).toBe(400);
    expect((await blockOf(offer.block_id)).status).toBe('proposed');
  });

  it('changes nothing when ARASAAC does not send the picture', async () => {
    const { turn_id, offer } = await turnWithPicture();
    library.down.add(9057);
    const before = (await deps.events.list(sid)).length;
    expect((await choose({ turn_id, block_id: offer.block_id, picture: 9057 })).statusCode).toBe(502);
    expect((await deps.events.list(sid)).length).toBe(before);
    expect((await blockOf(offer.block_id)).status).toBe('proposed');
  });

  it('refuses a block the teacher has rejected', async () => {
    const { turn_id, offer } = await turnWithPicture();
    await t.db.execute("UPDATE blocks SET status = 'rejected' WHERE id = ?", [offer.block_id]);
    expect((await choose({ turn_id, block_id: offer.block_id, picture: 3203 })).statusCode).toBe(409);
  });

  it('needs the workspace link', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${sid}/pictures/choose`, payload: { envelope, turn_id: 'x', block_id: 'y', picture: 1 } });
    expect(res.statusCode).toBe(401);
  });
});
