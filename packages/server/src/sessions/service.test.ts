import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDeps } from '../deps.js';
import { newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { NEW_DOC_NAME, NEW_THREAD_TITLE } from '../threads/service.js';

let t: TempDb;
let deps: AppDeps;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());

describe('create', () => {
  it('creates a session with hashes and a token, its first thread and a blank doc, and logs both', async () => {
    const { session, thread, doc } = await newWorkspace(deps, 'Year 7 English');
    const loaded = testLoaded();
    expect(session).toMatchObject({ label: 'Year 7 English', config_hash: loaded.config_hash, system_prompt_hash: loaded.system_prompt_hash, first_opened_at: null });
    expect(session.participant_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(thread).toMatchObject({ session_id: session.session_id, title: NEW_THREAD_TITLE });
    expect(doc).toMatchObject({ session_id: session.session_id, thread_id: thread.id, name: NEW_DOC_NAME, created_by: 'teacher' });
    const events = await deps.events.list(session.session_id);
    expect(events.map((e) => e.kind)).toEqual(['doc_create', 'thread_create']);
    expect(events[1]).toMatchObject({ thread_id: thread.id, doc_id: doc.id, payload: { thread_id: thread.id, doc_id: doc.id } });
    expect(await deps.sessions.get(session.session_id)).toEqual(session);
  });

  it("is a link workspace unless asked for an account one, and the access is kept on the row", async () => {
    const link = await newWorkspace(deps, 'Linked');
    expect(link.session.access).toBe('link');
    const account = await deps.sessions.create('Signed in', { access: 'account' });
    expect(account.session.access).toBe('account');
    expect((await deps.sessions.get(account.session.session_id))?.access).toBe('account');
  });

  it('lists sessions newest first', async () => {
    const a = await newWorkspace(deps, 'A');
    const b = await newWorkspace(deps, 'B');
    const listed = await deps.sessions.list();
    expect(listed.find((s) => s.session_id === a.session.session_id)?.last_opened_at).toBeNull();
    const ids = listed.map((s) => s.session_id);
    expect(ids.indexOf(b.session.session_id)).toBeLessThan(ids.indexOf(a.session.session_id));
  });
});

describe('tokens and opens', () => {
  it('resolves a good token and rejects unknown or empty ones', async () => {
    const { session } = await newWorkspace(deps);
    expect((await deps.sessions.byParticipantToken(session.participant_token))?.session_id).toBe(session.session_id);
    expect(await deps.sessions.byParticipantToken('nope')).toBeNull();
    expect(await deps.sessions.byParticipantToken('')).toBeNull();
  });

  it('sets first_opened_at on the first open only and logs every open', async () => {
    const { session } = await newWorkspace(deps);
    const first = await deps.sessions.recordOpen(session.session_id);
    expect(first.first_opened_at).not.toBeNull();
    const second = await deps.sessions.recordOpen(session.session_id);
    expect(second.first_opened_at).toBe(first.first_opened_at);
    const opens = await deps.events.list(session.session_id, { kinds: ['participant_open'] });
    expect(opens.map((e) => e.payload)).toEqual([{ first: true }, { first: false }]);
    const listed = (await deps.sessions.list()).find((s) => s.session_id === session.session_id);
    expect(listed?.last_opened_at).toBe(opens[1]!.server_ts);
    expect(listed!.last_opened_at! > first.first_opened_at!).toBe(true);
    await expect(deps.sessions.recordOpen('nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('threads', () => {
  it('creates further threads with their own blank doc, lists them oldest first, and scopes get to the session', async () => {
    const { session, thread } = await newWorkspace(deps);
    const other = await newWorkspace(deps);
    const second = await deps.threads.create(session.session_id, { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'threads', doc_id: null, thread_id: null });
    expect(second.doc.thread_id).toBe(second.thread.id);
    expect((await deps.threads.list(session.session_id)).map((x) => x.id)).toEqual([thread.id, second.thread.id]);
    expect(await deps.threads.get(session.session_id, other.thread.id)).toBeNull();
    const logged = (await deps.events.list(session.session_id, { kinds: ['thread_create'] })).at(-1)!;
    expect(logged).toMatchObject({ focus_pane: 'threads', thread_id: second.thread.id, doc_id: second.doc.id });
  });

  it('stores the title and running summary, inside a tx', async () => {
    const { session, thread } = await newWorkspace(deps);
    await t.db.transaction(async (tx) => {
      await deps.threads.setTitle(thread.id, 'Similes', tx);
      await deps.threads.setRunningSummary(thread.id, 'SUM', tx);
    });
    expect((await deps.threads.get(session.session_id, thread.id))?.title).toBe('Similes');
    expect(await deps.threads.runningSummary(thread.id)).toBe('SUM');
  });
});
