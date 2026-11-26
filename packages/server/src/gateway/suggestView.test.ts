import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Doc, LoadedConfig, Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import { newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { createChatService, type TurnInput } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const envelope = { client_ts: '2026-11-12T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;

const run = (over: Partial<TurnInput>) => {
  const { provider } = scripted(() => ({ text: 'Done.' }));
  return createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded }).runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Hello', envelope, ...over });
};
const lastPrompt = async () => (await deps.events.list(sid, { kinds: ['chat_prompt'] })).at(-1)!.payload;

beforeAll(async () => {
  t = await tempDb();
  const base = testLoaded();
  loaded = { ...base, config: { ...base.config, mode: 'agent', agent: { ...base.config.agent, tools: DEFAULT_TOOLS } } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
});

describe('the look of Suggesting, logged on chat_prompt (12 Nov 2026)', () => {
  it('logs Suggesting or Track changes with a Suggesting turn', async () => {
    await run({ suggest_view: 'inline' });
    expect(await lastPrompt()).toMatchObject({ edit_mode: 'suggest', suggest_view: 'inline' });
    await run({ suggest_view: 'track' });
    expect(await lastPrompt()).toMatchObject({ edit_mode: 'suggest', suggest_view: 'track' });
  });

  it('leaves it out in Editing mode, and when the client does not send it', async () => {
    await run({ edit_mode: 'edit', suggest_view: 'inline' });
    expect(await lastPrompt()).not.toHaveProperty('suggest_view');
    await run({});
    expect(await lastPrompt()).not.toHaveProperty('suggest_view');
  });
});
