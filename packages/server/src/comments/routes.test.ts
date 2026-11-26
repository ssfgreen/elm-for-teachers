import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { buildBundle } from '../export/bundle.js';
import { createCommentStore } from './store.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let s: SessionRow;
let docId: string;
let blockId: string;
let otherBlock: string;

const envelope = { client_ts: '2026-10-30T12:00:00.000Z', focus_pane: 'canvas', doc_id: null, thread_id: null };
const auth = () => ({ authorization: `Bearer ${s.participant_token}` });
const post = (body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/comments`, headers: auth(), payload: { envelope, ...body } });
const list = async () => (await app.inject({ url: `/api/sessions/${s.session_id}/docs/${docId}/comments`, headers: auth() })).json().comments;

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  const w = await newWorkspace(deps);
  s = w.session;
  docId = w.doc.id;
  const env = envelopeFor(w.doc, w.thread);
  blockId = (await deps.canvas.structural(s.session_id, { command: 'insert', doc_id: docId, after: 'start', type: 'paragraph', content: 'The moon was a silver coin.' }, env)).block!.id;
  const other = await newWorkspace(deps, 'B');
  otherBlock = (await deps.canvas.structural(other.session.session_id, { command: 'insert', doc_id: other.doc.id, after: 'start', type: 'paragraph', content: 'x' }, envelopeFor(other.doc, other.thread))).block!.id;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('comments', () => {
  it('starts a thread on a block, takes replies, lists them oldest first and logs each', async () => {
    const root = await post({ doc_id: docId, block_id: blockId, body: 'Is this too hard for P4?', quote: 'silver coin' });
    expect(root.statusCode).toBe(201);
    const r = root.json().comment;
    expect(r).toMatchObject({ doc_id: docId, block_id: blockId, root_id: null, author: 'teacher', quote: 'silver coin', deleted_at: null });
    const reply = (await post({ doc_id: docId, root_id: r.id, body: 'Maybe use a coin they know.', quote: 'ignored' })).json().comment;
    expect(reply).toMatchObject({ root_id: r.id, block_id: blockId, quote: null });
    expect((await list()).map((c: { id: string }) => c.id)).toEqual([r.id, reply.id]);
    const logged = await deps.events.list(s.session_id, { kinds: ['comment_create'] });
    expect(logged.map((e) => e.payload)).toMatchObject([{ comment_id: r.id, root_id: null, author: 'teacher' }, { comment_id: reply.id, root_id: r.id }]);
    expect(logged[0]!.doc_id).toBe(docId);
  });

  it('refuses a block from another doc or session, a reply to a reply, and an empty body', async () => {
    expect((await post({ doc_id: docId, block_id: otherBlock, body: 'x' })).statusCode).toBe(404);
    expect((await post({ doc_id: docId, body: 'no block' })).statusCode).toBe(400);
    expect((await post({ doc_id: docId, block_id: blockId, body: '   ' })).statusCode).toBe(400);
    const root = (await post({ doc_id: docId, block_id: blockId, body: 'a' })).json().comment;
    const reply = (await post({ doc_id: docId, root_id: root.id, body: 'b' })).json().comment;
    expect((await post({ doc_id: docId, root_id: reply.id, body: 'c' })).statusCode).toBe(400);
  });

  it('deletes a reply alone, or a root with its whole thread; deleted comments stay in the export', async () => {
    const root = (await post({ doc_id: docId, block_id: blockId, body: 'a' })).json().comment;
    const r1 = (await post({ doc_id: docId, root_id: root.id, body: 'b' })).json().comment;
    const r2 = (await post({ doc_id: docId, root_id: root.id, body: 'c' })).json().comment;
    const del = (id: string) => app.inject({ method: 'DELETE', url: `/api/sessions/${s.session_id}/comments/${id}`, headers: auth(), payload: { envelope } });
    expect((await del(r1.id)).statusCode).toBe(204);
    expect((await list()).map((c: { id: string }) => c.id)).toEqual([root.id, r2.id]);
    expect((await del(root.id)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await del(root.id)).statusCode).toBe(404);
    expect((await post({ doc_id: docId, root_id: root.id, body: 'late' })).statusCode).toBe(404);
    const deleted = await deps.events.list(s.session_id, { kinds: ['comment_delete'] });
    expect(deleted.map((e) => e.payload)).toEqual([
      { comment_id: r1.id, replies: [] },
      { comment_id: root.id, replies: [r2.id] },
    ]);
    const { files } = await buildBundle(deps, s.session_id);
    const exported = (files['comments.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l));
    expect(exported.map((c) => [c.id, c.deleted_at !== null])).toEqual([
      [root.id, true],
      [r1.id, true],
      [r2.id, true],
    ]);
  });

  it('edits a teacher comment and logs the body before; resolves and reopens a thread', async () => {
    const root = (await post({ doc_id: docId, block_id: blockId, body: 'first try' })).json().comment;
    const act = (id: string, what: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/comments/${id}/${what}`, headers: auth(), payload: { envelope, ...payload } });
    const edited = await act(root.id, 'edit', { body: '  second try ' });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().comment).toMatchObject({ body: 'second try', edited_at: expect.any(String) });
    expect((await list())[0].body).toBe('second try');
    expect((await act(root.id, 'edit', { body: ' ' })).statusCode).toBe(400);
    expect((await deps.events.list(s.session_id, { kinds: ['comment_edit'] })).map((e) => e.payload)).toEqual([{ comment_id: root.id, body: 'second try', previous: 'first try' }]);

    const reply = (await post({ doc_id: docId, root_id: root.id, body: 'b' })).json().comment;
    expect((await act(reply.id, 'resolve', { resolved: true })).statusCode).toBe(400);
    expect((await act(root.id, 'resolve', { resolved: true })).json().comment.resolved_at).toEqual(expect.any(String));
    expect((await act(root.id, 'resolve', { resolved: true })).statusCode).toBe(200);
    const late = await post({ doc_id: docId, root_id: root.id, body: 'late' });
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe('comment_resolved');
    expect((await list()).map((c: { id: string }) => c.id)).toEqual([root.id, reply.id]);
    expect((await act(root.id, 'resolve', { resolved: false })).json().comment.resolved_at).toBeNull();
    expect((await post({ doc_id: docId, root_id: root.id, body: 'now' })).statusCode).toBe(201);
    expect((await deps.events.list(s.session_id, { kinds: ['comment_resolve'] })).map((e) => e.payload)).toEqual([
      { comment_id: root.id, resolved: true },
      { comment_id: root.id, resolved: false },
    ]);
  });

  it("won't edit or delete the assistant's comments, but resolves its threads", async () => {
    const store = createCommentStore(deps.db, deps.events);
    const env = { ...envelope, doc_id: docId, thread_id: null, focus_pane: 'canvas' as const };
    const note = await store.create(s.session_id, { doc_id: docId, block_id: blockId, author: 'model', body: 'Add an example.' }, env);
    const del = await app.inject({ method: 'DELETE', url: `/api/sessions/${s.session_id}/comments/${note.id}`, headers: auth(), payload: { envelope } });
    expect(del.statusCode).toBe(403);
    expect(del.json().code).toBe('comment_not_yours');
    const edit = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/comments/${note.id}/edit`, headers: auth(), payload: { envelope, body: 'mine now' } });
    expect(edit.statusCode).toBe(403);
    expect((await list())[0].body).toBe('Add an example.');
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/comments/${note.id}/resolve`, headers: auth(), payload: { envelope, resolved: true } });
    expect(res.statusCode).toBe(200);
    // The assistant's answer still lands in a thread resolved while it worked.
    expect((await store.create(s.session_id, { doc_id: docId, root_id: note.id, author: 'model', body: 'Done.' }, env)).root_id).toBe(note.id);
  });

  it("are only the session's own", async () => {
    const root = (await post({ doc_id: docId, block_id: blockId, body: 'a' })).json().comment;
    const other = await newWorkspace(deps, 'C');
    const theirs = { authorization: `Bearer ${other.session.participant_token}` };
    expect((await app.inject({ method: 'DELETE', url: `/api/sessions/${other.session.session_id}/comments/${root.id}`, headers: theirs, payload: { envelope } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/docs/${docId}/comments` })).statusCode).toBe(401);
  });
});
