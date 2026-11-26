import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_REFERENCE_LIMITS } from '@edw/shared';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { createProjectService } from '../projects/service.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { readerFor } from './reader.js';
import { cleanSummary } from './summary.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let s: SessionRow;
let projectId: string;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const envelope = { client_ts: '2026-10-31T09:00:00.000Z', focus_pane: 'canvas', doc_id: null, thread_id: null } as const;
const auth = () => ({ authorization: `Bearer ${s.participant_token}` });
const upload = (body: Record<string, unknown>, project = projectId) =>
  app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/projects/${project}/references`, headers: auth(), payload: { envelope, name: 'Forces.docx', mime: DOCX, bytes: 12_000, pages: ['Forces act in pairs.'], ...body } });
const list = async () => (await app.inject({ url: `/api/sessions/${s.session_id}/projects/${projectId}/references`, headers: auth() })).json();

async function rebuild(over: Partial<Omit<AppDeps, 'canvas'>> = {}) {
  await app?.close();
  deps = { ...deps, ...over };
  app = await buildApp(deps);
  await app.ready();
}

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  await rebuild();
  s = (await newWorkspace(deps)).session;
  projectId = (await createProjectService(deps.db, deps.events).create(s.session_id, { name: 'P6 Science' }, envelope)).id;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('reference files', () => {
  it('previews a file: its pages as the model reads them, and whether the original can be downloaded', async () => {
    const { reference } = (await upload({ pages: ['Page one text.', 'Page two text.'] })).json();
    const r = await app.inject({ url: `/api/sessions/${s.session_id}/references/${reference.id}/pages`, headers: auth() });
    expect(r.json()).toEqual({ reference, pages: [{ page: 1, text: 'Page one text.' }, { page: 2, text: 'Page two text.' }], original: false });
    await app.inject({ method: 'DELETE', url: `/api/sessions/${s.session_id}/references/${reference.id}`, headers: auth(), payload: { envelope } });
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/references/${reference.id}/pages`, headers: auth() })).statusCode).toBe(404);
  });

  it('stores the text a page a row, lists the file with the limits, and logs the upload', async () => {
    const r = await upload({ pages: ['  Page one text.  ', 'Page two text.'] });
    expect(r.statusCode).toBe(201);
    const { reference, upload: put } = r.json();
    expect(put).toBeNull();
    expect(reference).toMatchObject({ project_id: projectId, name: 'Forces.docx', pages: 2, chars: 28, est_tokens: 7, status: 'ready', summary: '(mock) A reference file called Forces.docx.' });
    const listed = await list();
    expect(listed.references).toEqual([reference]);
    expect(listed.limits).toEqual(DEFAULT_REFERENCE_LIMITS);
    const logged = await deps.events.list(s.session_id, { kinds: ['reference_upload'] });
    expect(logged.map((e) => e.payload)).toEqual([{ reference_id: reference.id, project_id: projectId, thread_id: null, name: 'Forces.docx', mime: DOCX, bytes: 12_000, pages: 2, est_tokens: 7 }]);
    // The summary call is logged on its own, with what the model was sent, and is not a chat message.
    const [summary] = await deps.events.list(s.session_id, { kinds: ['reference_summary'] });
    expect(summary!.payload).toMatchObject({ reference_id: reference.id, summary: '(mock) A reference file called Forces.docx.', model: 'mock-model', error: null });
    expect(JSON.stringify((summary!.payload as { request: unknown }).request)).toContain('[page 2]\\nPage two text.');
    expect((await deps.db.execute('SELECT COUNT(*) AS n FROM gateway_calls')).rows[0]!.n).toBe(0);
  });

  it('keeps the file without a summary when the summary call fails', async () => {
    await rebuild({ provider: { model: 'down', temperature: 1, complete: async () => { throw new Error('provider down'); } } });
    const { reference } = (await upload({})).json();
    expect(reference).toMatchObject({ status: 'ready', summary: null });
    const [summary] = await deps.events.list(s.session_id, { kinds: ['reference_summary'] });
    expect(summary!.payload).toMatchObject({ summary: null, error: 'provider down' });
  });

  it('makes a catalogue line of the reply', () => {
    expect(cleanSummary('  "A Year 6 scheme of work on forces."\nMore text')).toBe('A Year 6 scheme of work on forces.');
    expect(cleanSummary('   ')).toBeNull();
    expect(cleanSummary('x'.repeat(300))!.length).toBe(240);
  });

  it('refuses an unknown type, a file with no text, and a project that is not this workspace’s or archived', async () => {
    expect((await upload({ mime: 'image/png' })).json()).toMatchObject({ code: 'unsupported_media_type' });
    const blank = await upload({ name: 'Scan.pdf', mime: 'application/pdf', pages: ['  ', ''] });
    expect(blank.statusCode).toBe(422);
    expect(blank.json().error).toContain('No text could be read from “Scan.pdf”');
    expect((await upload({}, '01JC0000000000000000000000')).statusCode).toBe(404);
    await createProjectService(deps.db, deps.events).archive(s.session_id, projectId, envelope);
    expect((await upload({})).statusCode).toBe(409);
  });

  it('refuses files over each limit with a message saying which', async () => {
    const limits = { ...DEFAULT_REFERENCE_LIMITS, files_per_project: 2, file_bytes: 1000, file_tokens: 100, project_tokens: 150, workspace_bytes: 2500 };
    await rebuild({ loaded: { ...deps.loaded, config: { ...deps.loaded.config, references: limits } } });
    const text = (chars: number) => ['x'.repeat(chars)];

    const big = await upload({ bytes: 1001 });
    expect([big.statusCode, big.json().code]).toEqual([413, 'reference_too_large']);
    expect(big.json().error).toBe('“Forces.docx” is 1 KB; a file can be at most 1 KB.');
    expect((await upload({ bytes: 10, pages: text(401) })).json().error).toContain('has too much text');

    expect((await upload({ bytes: 900, pages: text(320) })).statusCode).toBe(201);
    expect((await upload({ bytes: 900, pages: text(320) })).json().error).toContain("this project's files would have");
    expect((await upload({ bytes: 900, pages: text(40) })).statusCode).toBe(201);
    expect((await upload({ bytes: 10, pages: text(4) })).json().error).toContain('already has 2 files');

    // Another project in the same workspace still counts towards the workspace's storage.
    const other = (await createProjectService(deps.db, deps.events).create(s.session_id, { name: 'Other' }, envelope)).id;
    expect((await upload({ bytes: 800 }, other)).json().error).toContain('the files in this workspace would take');
  });

  it('deletes a file (kept, marked) so it no longer lists, counts or reaches the model', async () => {
    const { reference } = (await upload({})).json();
    const del = () => app.inject({ method: 'DELETE', url: `/api/sessions/${s.session_id}/references/${reference.id}`, headers: auth(), payload: { envelope } });
    expect((await del()).statusCode).toBe(204);
    expect((await del()).statusCode).toBe(404);
    expect((await list()).references).toEqual([]);
    expect((await readerFor(deps.db, s.session_id, projectId)).files).toEqual([]);
    expect((await deps.events.list(s.session_id, { kinds: ['reference_delete'] })).map((e) => e.payload)).toEqual([{ reference_id: reference.id, project_id: projectId, thread_id: null }]);
    const { files } = await buildBundle(deps, s.session_id);
    const lines = (files['references.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toMatchObject([{ id: reference.id, deleted_at: expect.any(String), has_original: false, text: '[page 1]\nForces act in pairs.' }]);
  });

  describe('with a bucket', () => {
    function fakeBucket() {
      const files = new Map<string, { bytes: number; contentType: string }>();
      return {
        files,
        put: (key: string, bytes: number, contentType: string) => files.set(key, { bytes, contentType }),
        presignPut: (key: string, contentType: string) => `https://bucket.test/${key}?put&type=${contentType}`,
        presignGet: (key: string) => `https://bucket.test/${key}?get`,
        head: async (key: string) => files.get(key) ?? null,
        delete: async (key: string) => void files.delete(key),
      };
    }

    it('signs a PUT for the original, keeps the file pending until it arrives, then logs it and serves the original', async () => {
      const bucket = fakeBucket();
      await rebuild({ bucket });
      const { reference, upload: put } = (await upload({})).json();
      const key = `sessions/${s.session_id}/ref_${reference.id}`;
      expect(reference.status).toBe('pending');
      expect(put).toEqual({ method: 'PUT', url: `https://bucket.test/${key}?put&type=${DOCX}`, headers: { 'Content-Type': DOCX } });
      expect((await readerFor(deps.db, s.session_id, projectId)).files).toEqual([]);

      const complete = () => app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/references/${reference.id}/complete`, headers: auth(), payload: { envelope } });
      expect((await complete()).json().code).toBe('upload_missing');
      bucket.put(key, 11_500, DOCX);
      expect((await complete()).json().reference).toMatchObject({ status: 'ready', bytes: 11_500, summary: '(mock) A reference file called Forces.docx.' });
      expect((await complete()).statusCode).toBe(200);
      expect((await deps.events.list(s.session_id, { kinds: ['reference_upload'] })).length).toBe(1);
      expect((await deps.events.list(s.session_id, { kinds: ['reference_summary'] })).length).toBe(1);
      const original = await app.inject({ url: `/api/sessions/${s.session_id}/references/${reference.id}/original`, headers: auth() });
      expect(original.headers.location).toBe(`https://bucket.test/${key}?get`);
      // The query token works too, so a link can open it in a new tab.
      const linked = await app.inject({ url: `/api/sessions/${s.session_id}/references/${reference.id}/original?token=${s.participant_token}` });
      expect(linked.statusCode).toBe(302);
      expect((await app.inject({ url: `/api/sessions/${s.session_id}/references/${reference.id}/pages`, headers: auth() })).json().original).toBe(true);

      // Deleting the workspace hands back the original's bucket id for removal.
      expect((await deps.sessions.delete(s.session_id))!.bucketAssetIds).toContain(`ref_${reference.id}`);
    });
  });

  it('a chat\'s own files ("+"): listed for that chat, read with its project\'s, and limited per chat', async () => {
    const chat = await deps.threads.create(s.session_id, envelope, undefined, projectId);
    const add = (body: Record<string, unknown> = {}, thread = chat.thread.id) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${thread}/references`, headers: auth(), payload: { envelope, name: 'Curriculum.pdf', mime: 'text/plain', bytes: 500, pages: ['Second level: forces.'], ...body } });
    const r = await add();
    expect(r.statusCode).toBe(201);
    const file = r.json().reference;
    expect(file).toMatchObject({ project_id: null, thread_id: chat.thread.id, status: 'ready' });
    await upload({});
    const listed = (await app.inject({ url: `/api/sessions/${s.session_id}/threads/${chat.thread.id}/references`, headers: auth() })).json().references;
    expect(listed.map((f: { id: string }) => f.id)).toEqual([file.id]);
    // The project's list leaves the chat's file out; the chat's reader has both.
    expect((await list()).references.map((f: { name: string }) => f.name)).toEqual(['Forces.docx']);
    const reader = await readerFor(deps.db, s.session_id, { projectId, threadId: chat.thread.id });
    expect(reader.files.map((f) => f.name)).toEqual(['Curriculum.pdf', 'Forces.docx']);
    expect((await readerFor(deps.db, s.session_id, projectId)).files.map((f) => f.name)).toEqual(['Forces.docx']);
    const logged = await deps.events.list(s.session_id, { kinds: ['reference_upload'] });
    expect(logged[0]!.payload).toMatchObject({ reference_id: file.id, project_id: null, thread_id: chat.thread.id });
    // An unknown chat, and the per-chat file limit.
    expect((await add({}, '01JZZZZZZZZZZZZZZZZZZZZZZZ')).statusCode).toBe(404);
    await rebuild({ loaded: { ...deps.loaded, config: { ...deps.loaded.config, references: { ...deps.loaded.config.references, files_per_project: 1 } } } });
    const full = await add();
    expect(full.statusCode).toBe(409);
    expect(full.json().error).toMatch(/^This chat already has 1 files/);
  });
});
