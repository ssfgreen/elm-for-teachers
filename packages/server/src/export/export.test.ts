import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import { BUNDLE_FILES, DEFAULT_FEATURES, SessionJson, nowIso, type ClientEvent, type Doc, type Thread } from '@edw/shared';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/index.js';
import type { AppDeps, ServerEnvelope } from '../deps.js';
import { hashJson, sha256Hex } from '@edw/shared/node';
import { ADMIN_PASSWORD, clientEvent, envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { buildBundle, slug } from './bundle.js';
import { replayRevisions, rebuildFromBundle } from './rebuild.js';
import { replayTextEvents, type TextEventLine } from './textEvents.js';
import { zipBundle } from './zip.js';
import { zipDisposition } from './routes.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let sid: string;
let thread: Thread;
let doc: Doc;
let envelope: ServerEnvelope;
const auth = { authorization: `Bearer ${ADMIN_PASSWORD}` };

const batch = (blockId: string, edits: unknown[] | undefined, after: string): ClientEvent =>
  clientEvent(
    'keystroke_batch',
    {
      target: { kind: 'block', block_id: blockId },
      ...(edits ? { edits } : { steps: [] }),
      char_count: 1,
      batch_start_ts: nowIso(),
      batch_end_ts: nowIso(),
      content_after: { content: after },
    },
    { doc_id: doc.id, thread_id: thread.id },
  );

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  const w = await newWorkspace(deps, 'Year 7 English');
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  envelope = envelopeFor(doc, thread);
  await deps.sessions.recordOpen(sid);
  await deps.canvas.structural(sid, { command: 'doc_rename', doc_id: doc.id, name: 'Similes: part 1' }, envelope);
  const a = await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'First block' }, envelope);
  await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: a.block!.id, type: 'paragraph', content: 'Second block' }, envelope);
  await deps.events.appendClient(sid, [batch(a.block!.id, undefined, 'First block, edited')]);
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('buildBundle', () => {
  it("says in session.json how the workspace is reached: 'account' for a signed-in teacher's", async () => {
    const account = await deps.sessions.create('Signed in', { access: 'account' });
    const { files } = await buildBundle(deps, account.session.session_id);
    expect(SessionJson.parse(JSON.parse(files['session.json'] as string)).access).toBe('account');
  });

  it('lists the feature switches in force in session.json, and reads an older one without them as all on', async () => {
    const all = await deps.sessions.create('All on');
    const allJson = JSON.parse((await buildBundle(deps, all.session.session_id)).files['session.json'] as string);
    expect(allJson.features).toEqual(DEFAULT_FEATURES);

    const some = await deps.sessions.create('Some off', { features: { spyglass: false, plugins: false } });
    const someJson = JSON.parse((await buildBundle(deps, some.session.session_id)).files['session.json'] as string);
    expect(someJson.features).toEqual({ ...DEFAULT_FEATURES, spyglass: false, plugins: false });

    const older = { ...someJson } as Record<string, unknown>;
    delete older.features;
    expect(SessionJson.parse(older).features).toEqual(DEFAULT_FEATURES);
  });

  it('produces every expected file, one markdown file per doc, and a valid session.json', async () => {
    const second = await deps.threads.create(sid, envelopeFor(null, null));
    const { files, label } = await buildBundle(deps, sid);
    const loaded = testLoaded();
    const promptFile = `config/system_prompt-${loaded.system_prompt_hash.slice(0, 12)}.md`;
    const configFile = `config/app.config-${loaded.config_hash.slice(0, 12)}.json`;
    expect(label).toBe('Year 7 English');
    expect(Object.keys(files).sort()).toEqual(
      [...BUNDLE_FILES, 'docs/01-similes-part-1.md', 'docs/02-untitled.md', promptFile, configFile].sort(),
    );
    // The exact text behind each hash, recorded when the session was created.
    expect(files[promptFile]).toBe(loaded.system_prompt);
    expect(sha256Hex(files[promptFile] as string)).toBe(loaded.system_prompt_hash);
    expect(hashJson(JSON.parse(files[configFile] as string))).toBe(loaded.config_hash);
    const session = SessionJson.parse(JSON.parse(files['session.json'] as string));
    expect(session).toMatchObject({ session_id: sid, label: 'Year 7 English', tool_version: 'test', first_opened_at: expect.any(String), access: 'link' });
    expect(JSON.parse(files['threads.json'] as string).map((x: Thread) => x.id)).toEqual([thread.id, second.thread.id]);
    expect(JSON.parse(files['docs.json'] as string).map((x: Doc) => x.id)).toEqual([doc.id, second.doc.id]);
    const manifest = JSON.parse(files['MANIFEST.json'] as string);
    expect(manifest.files).toEqual(Object.keys(files).sort());
    expect(manifest.notes.config_files).toEqual({ [loaded.system_prompt_hash]: promptFile, [loaded.config_hash]: configFile });
    expect(manifest.notes).not.toHaveProperty('config_missing');
  });

  it("names a hash it has no text for, and where to find it, instead of failing", async () => {
    await t.db.execute('DELETE FROM config_versions');
    const { files } = await buildBundle(deps, sid);
    expect(Object.keys(files).some((f) => f.startsWith('config/'))).toBe(false);
    const notes = JSON.parse(files['MANIFEST.json'] as string).notes;
    expect(notes.config_missing).toContain(testLoaded().system_prompt_hash);
    expect(notes.config_missing).toContain('scripts/find-config-version.mjs');
  });

  it('exports a database from before migration 0019, with no block_splits table', async () => {
    const before = await buildBundle(deps, sid);
    await t.db.execute('DROP TABLE block_splits');
    const { files } = await buildBundle(deps, sid);
    expect(files['events.jsonl']).toBe(before.files['events.jsonl']);
  });

  it('lists events in gapless seq order', async () => {
    const { files } = await buildBundle(deps, sid);
    const seqs = (files['events.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l).seq as number);
    expect(seqs.length).toBeGreaterThan(3);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });

  it('renders each doc to markdown that the bundle rebuilds exactly, and replays revisions', async () => {
    const { files } = await buildBundle(deps, sid);
    const md = files['docs/01-similes-part-1.md'] as string;
    expect(md).toBe('# Similes: part 1\n\nFirst block, edited\n\nSecond block\n');
    const rebuilt = rebuildFromBundle(files);
    expect(`# Similes: part 1\n\n${rebuilt.markdown.get(doc.id)}`).toBe(md);
    expect([...replayRevisions(files).values()].map((c) => c.content).sort()).toEqual(['First block, edited', 'Second block']);
  });

  it('detects tampered revisions', async () => {
    const { files } = await buildBundle(deps, sid);
    const bad = { ...files, 'revisions.jsonl': (files['revisions.jsonl'] as string).split('\n').slice(0, 1).join('\n') + '\n' };
    expect(() => replayRevisions(bad)).toThrow();
  });

  it('zips deterministically', async () => {
    const a = await zipBundle((await buildBundle(deps, sid)).files);
    const b = await zipBundle((await buildBundle(deps, sid)).files);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const zip = await JSZip.loadAsync(a);
    expect(await zip.file('docs/01-similes-part-1.md')!.async('string')).toContain('Second block');
  });

  it('names the zip "<name> export.zip", with an ASCII stand-in for accented names', () => {
    expect(zipDisposition('Mrs Ó Briain')).toBe(`attachment; filename="Mrs O Briain export.zip"; filename*=UTF-8''Mrs%20%C3%93%20Briain%20export.zip`);
    expect(zipDisposition('  ')).toContain('filename="workspace export.zip"');
  });

  it('slugs doc names for file names', () => {
    expect(slug('Similes: Part 1 (P7)')).toBe('similes-part-1-p7');
    expect(slug('!!!')).toBe('untitled');
  });
});

describe('text_events.jsonl', () => {
  const lines = (files: Record<string, string | Uint8Array>) =>
    (files['text_events.jsonl'] as string).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as TextEventLine);
  const stats = (files: Record<string, string | Uint8Array>) => JSON.parse(files['MANIFEST.json'] as string).notes.text_events_stats;

  it('replays to every stored block, carries doc and thread ids, and a batch without edits is one resync', async () => {
    const { files } = await buildBundle(deps, sid);
    const ls = lines(files);
    expect(ls.map((l) => l.eventNum)).toEqual(ls.map((_, i) => i + 1));
    expect(ls.filter((l) => l.eventName === 'block-insert')).toHaveLength(2);
    expect(ls.filter((l) => l.eventName === 'text-resync')).toHaveLength(1);
    expect(ls.every((l) => l.doc_id === doc.id && l.thread_id === thread.id)).toBe(true);
    expect(stats(files)).toEqual({ lines: ls.length, resyncs: 1, unresolved_causes: 0, final_mismatches: 0 });
    const blocks = JSON.parse(files['blocks.json'] as string) as { id: string; content: string }[];
    const replayed = replayTextEvents(ls);
    for (const b of blocks) expect(replayed.get(b.id)).toBe(b.content);
  });

  it('carries per-keystroke edits, splits and a bad edit chain, and still ends on the stored text', async () => {
    const a = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Hello' }, envelope)).block!;
    await deps.events.appendClient(sid, [
      batch(a.id, [
        { t: 1000, ops: [{ retain: 5 }, { insert: ' w' }] },
        { t: 1080, ops: [{ retain: 7 }, { insert: 'orld' }] },
        { t: 1500, ops: [{ retain: 10 }, { delete: 1 }] },
      ], 'Hello worl'),
    ]);
    await deps.canvas.structural(sid, { command: 'split', block_id: a.id, first: { content: 'Hello' }, second: { content: ' worl' } }, envelope);
    // An edit that runs past the end: the chain breaks and a resync corrects it.
    await deps.events.appendClient(sid, [batch(a.id, [{ t: 2000, ops: [{ retain: 99 }, { insert: '!' }] }], 'Hello!')]);
    const { files } = await buildBundle(deps, sid);
    const ls = lines(files);
    const typed = ls.filter((l) => l.block_id === a.id && l.eventSource === 'user' && l.cause === undefined && l.textDelta !== undefined);
    expect(typed.map((l) => [l.eventName, l.eventTimestamp, l.textDelta?.ops])).toEqual([
      ['text-insert', 1000, [{ retain: 5 }, { insert: ' w' }]],
      ['text-insert', 1080, [{ retain: 7 }, { insert: 'orld' }]],
      ['text-delete', 1500, [{ retain: 10 }, { delete: 1 }]],
    ]);
    expect(ls.find((l) => l.eventName === 'block-split')).toMatchObject({ block_id: a.id, eventSource: 'user' });
    expect(stats(files)).toMatchObject({ resyncs: 2, unresolved_causes: 0, final_mismatches: 0 });
    const blocks = JSON.parse(files['blocks.json'] as string) as { id: string; content: string }[];
    const replayed = replayTextEvents(ls);
    for (const b of blocks) expect(replayed.get(b.id)).toBe(b.content);
    expect(replayed.get(a.id)).toBe('Hello!');
  });

  it('typing inside a suggested change is one line from the live revision, and the replay still ends on the stored text', async () => {
    const a = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'a big dog' }, envelope)).block!;
    await deps.canvas.applyTurn(sid, { turn_id: 't', cause_event_id: clientEvent('chat_prompt', { turn_id: 't', text: 'x' }, { doc_id: doc.id, thread_id: thread.id }).event_id, thread_id: thread.id, default_doc_id: doc.id, operations: [{ op: 'replace', id: a.id, content: 'a small dog' }] }, { envelope });
    await deps.events.appendClient(sid, [
      clientEvent(
        'keystroke_batch',
        { target: { kind: 'block', block_id: a.id }, edits: [{ t: 3000, ops: [{ retain: 11 }, { insert: '!' }] }], char_count: 1, batch_start_ts: nowIso(), batch_end_ts: nowIso(), content_after: { content: 'a small dog!' }, in_suggestion: true, live_after: { content: 'a big dog!' } },
        { doc_id: doc.id, thread_id: thread.id },
      ),
    ]);
    const { files } = await buildBundle(deps, sid);
    const ls = lines(files);
    const mine = ls.filter((l) => l.block_id === a.id && l.textDelta);
    expect(mine.at(-1)).toMatchObject({ eventSource: 'user', cause: 'keystroke_batch', textDelta: { ops: [{ retain: 9 }, { insert: '!' }] } });
    expect(stats(files)).toMatchObject({ resyncs: 1, final_mismatches: 0 });
    expect(replayTextEvents(ls).get(a.id)).toBe('a big dog!');
  });
});

describe('export routes', () => {
  it('requires the admin password', async () => {
    expect((await app.inject({ url: `/api/admin/sessions/${sid}/export` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/admin/sessions/${sid}/export.json` })).statusCode).toBe(401);
  });

  it('streams the zip with download headers and a json view', async () => {
    const res = await app.inject({ url: `/api/admin/sessions/${sid}/export`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/zip/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="Year 7 English export.zip"; filename*=UTF-8''Year%207%20English%20export.zip`);
    expect((await JSZip.loadAsync(res.rawPayload)).file('session.json')).not.toBeNull();
    const j = await app.inject({ url: `/api/admin/sessions/${sid}/export.json`, headers: auth });
    expect(Object.keys(j.json())).toContain('events.jsonl');
    expect((await app.inject({ url: '/api/admin/sessions/nope/export', headers: auth })).statusCode).toBe(404);
  });

  it('does not give a participant the analysis bundle', async () => {
    const token = (await deps.sessions.get(sid))!.participant_token;
    expect((await app.inject({ url: `/api/sessions/${sid}/export`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(404);
  });
});
