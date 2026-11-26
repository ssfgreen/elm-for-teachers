import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ProviderAdapter } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { MockProvider } from '../gateway/mock.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { cleanTitle, titleMessage } from './title.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let threadId: string;
let docId: string;
let reply = '"Similes homework: reading support (P7)."';
let seen: { system: string; text: string } | null = null;
/** Runs inside the naming call, before it answers: to change things while the model is thinking. */
let during: (() => Promise<void>) | null = null;

const envelope = { client_ts: '2026-11-02T09:00:00.000Z', focus_pane: 'chat', doc_id: null, thread_id: null } as const;
const auth = () => ({ authorization: `Bearer ${s.participant_token}` });
const name = () => app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${threadId}/name`, headers: auth(), payload: { envelope } });
const autoName = () => app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${threadId}/name`, headers: auth(), payload: { envelope, auto: true } });
const send = (text: string) => app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${threadId}/chat`, headers: auth(), payload: { text, doc_id: docId, envelope } });

beforeEach(async () => {
  t = await tempDb();
  const mock = new MockProvider('mock-model', 1);
  // The chat itself is the mock's; the naming call (the skill as its instructions) is answered here.
  const provider: ProviderAdapter = Object.assign(Object.create(mock) as ProviderAdapter, {
    complete: async (messages: Parameters<ProviderAdapter['complete']>[0], system: string) => {
      if (!system.includes('# Naming a chat')) return mock.complete(messages, system);
      seen = { system, text: String(messages[0]!.content) };
      if (during) await during();
      if (reply === 'FAIL') throw new Error('provider down');
      return { text: reply, input_tokens: 50, output_tokens: 8, provider_request_id: 'r1', request: { n: 1 } };
    },
  });
  deps = testDeps(t.db, provider);
  app = await buildApp(deps);
  await app.ready();
  const w = await newWorkspace(deps);
  s = w.session;
  threadId = w.thread.id;
  docId = w.doc.id;
});
afterEach(async () => {
  seen = null;
  during = null;
  reply = '"Similes homework: reading support (P7)."';
  await app.close();
  t.cleanup();
});

describe('naming a chat (the wand)', () => {
  it('cleans the reply into a name', () => {
    expect(cleanTitle('"Similes homework: reading support (P7)."\nBecause…')).toBe('Similes homework: reading support (P7)');
    expect(cleanTitle('**Forces quiz**')).toBe('Forces quiz');
    expect(cleanTitle('  ')).toBeNull();
  });

  it('says there is nothing to name an empty chat from', async () => {
    const r = await name();
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('chat_empty');
  });

  it('asks the model with the naming skill, the chat and the other names, renames the chat and logs both', async () => {
    deps.loaded.naming_skill = { name: 'naming-chats', description: 'x', files: { 'SKILL.md': '# Naming a chat\n\nRules.' } };
    await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${threadId}/chat`, headers: auth(), payload: { text: 'Make my similes homework easier to read for P7', doc_id: docId, envelope } });
    await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads`, headers: auth(), payload: { envelope } }).then(async (r) => {
      await deps.threads.rename(s.session_id, r.json().thread.id, 'Forces quiz (P6)', envelope);
    });
    const r = await name();
    expect(r.statusCode).toBe(200);
    expect(r.json().thread.title).toBe('Similes homework: reading support (P7)');
    expect(seen!.system).toBe('# Naming a chat\n\nRules.');
    expect(seen!.text).toContain('- Forces quiz (P6)');
    expect(seen!.text).toContain('Teacher: Make my similes homework easier to read for P7');
    const [call] = await deps.events.list(s.session_id, { kinds: ['chat_title'] });
    expect(call!.payload).toMatchObject({ thread_id: threadId, title: 'Similes homework: reading support (P7)', trigger: 'wand', error: null, input_tokens: 50 });
    const renames = await deps.events.list(s.session_id, { kinds: ['thread_rename'] });
    expect(renames.at(-1)!.payload).toEqual({ thread_id: threadId, title: 'Similes homework: reading support (P7)', auto: true });
  });

  it('a failed call keeps the name, says so, and is logged', async () => {
    deps.loaded.naming_skill = { name: 'naming-chats', description: 'x', files: { 'SKILL.md': '# Naming a chat' } };
    reply = 'FAIL';
    await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${threadId}/chat`, headers: auth(), payload: { text: 'Hello', doc_id: docId, envelope } });
    const r = await name();
    expect(r.statusCode).toBe(502);
    expect((await deps.threads.get(s.session_id, threadId))!.title).toBe('Untitled');
    const [call] = await deps.events.list(s.session_id, { kinds: ['chat_title'] });
    expect(call!.payload).toMatchObject({ title: null, error: 'provider down' });
    reply = '"Similes homework: reading support (P7)."';
  });

  it('keeps a long chat to its start and end', () => {
    const turns = Array.from({ length: 50 }, (_, i) => ({ prompt: `Question ${i} ${'x'.repeat(200)}`, response_text: 'ok' }));
    const m = titleMessage({ turns, docNames: ['Similes'], otherTitles: [] });
    expect(m.length).toBeLessThan(7000);
    expect(m).toContain('Question 0');
    expect(m).toContain('Question 49');
  });
});

describe('naming a chat on its own, after the first three prompts', () => {
  beforeEach(() => {
    deps.loaded.naming_skill = { name: 'naming-chats', description: 'x', files: { 'SKILL.md': '# Naming a chat\n\nRules.' } };
  });

  it('leaves a chat with fewer than three prompts as it is, without calling the model', async () => {
    await send('Make my similes homework easier to read for P7');
    await send('Shorter sentences, please');
    const r = await autoName();
    expect(r.statusCode).toBe(200);
    expect(r.json().thread.title).toBe('Untitled');
    expect(seen).toBeNull();
    expect(await deps.events.list(s.session_id, { kinds: ['chat_title'] })).toHaveLength(0);
  });

  it('names an Untitled chat once it has three prompts, and logs that it did so on its own', async () => {
    await send('Make my similes homework easier to read for P7');
    await send('Shorter sentences, please');
    await send('Add a picture');
    const r = await autoName();
    expect(r.statusCode).toBe(200);
    expect(r.json().thread.title).toBe('Similes homework: reading support (P7)');
    const [call] = await deps.events.list(s.session_id, { kinds: ['chat_title'] });
    expect(call!.payload).toMatchObject({ thread_id: threadId, title: 'Similes homework: reading support (P7)', trigger: 'auto', error: null });
    const renames = await deps.events.list(s.session_id, { kinds: ['thread_rename'] });
    expect(renames.at(-1)!.payload).toEqual({ thread_id: threadId, title: 'Similes homework: reading support (P7)', auto: true });
  });

  it('leaves a chat the teacher has named alone', async () => {
    await deps.threads.rename(s.session_id, threadId, 'My similes', envelope);
    for (const text of ['One', 'Two', 'Three']) await send(text);
    const r = await autoName();
    expect(r.json().thread.title).toBe('My similes');
    expect(seen).toBeNull();
  });

  it("keeps the teacher's name if they rename the chat while the model is naming it", async () => {
    for (const text of ['One', 'Two', 'Three']) await send(text);
    during = async () => {
      await deps.threads.rename(s.session_id, threadId, 'My similes', envelope);
    };
    const r = await autoName();
    expect(r.json().thread.title).toBe('My similes');
    expect((await deps.threads.get(s.session_id, threadId))!.title).toBe('My similes');
    const renames = await deps.events.list(s.session_id, { kinds: ['thread_rename'] });
    expect(renames.map((e) => e.payload)).toEqual([{ thread_id: threadId, title: 'My similes' }]);
  });

  it('a failed call keeps Untitled quietly (no error for the teacher) and is logged', async () => {
    reply = 'FAIL';
    for (const text of ['One', 'Two', 'Three']) await send(text);
    const r = await autoName();
    expect(r.statusCode).toBe(200);
    expect(r.json().thread.title).toBe('Untitled');
    const [call] = await deps.events.list(s.session_id, { kinds: ['chat_title'] });
    expect(call!.payload).toMatchObject({ title: null, trigger: 'auto', error: 'provider down' });
  });
});
