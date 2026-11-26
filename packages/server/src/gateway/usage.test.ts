/** The chat's token and cost counter: its thread's model calls, with the costs stored when each was made. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LoadedConfig, ProviderAdapter } from '@edw/shared';
import { newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { spendGbp } from '../budget/store.js';
import { createChatService } from './service.js';

const envelope = { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'chat' } as const;
const provider: ProviderAdapter = {
  model: 'priced',
  temperature: 1,
  complete: async () => ({ text: 'Hello', input_tokens: 1_000_000, output_tokens: 100_000, cached_tokens: 0, provider_request_id: null }),
};

let t: TempDb;
beforeAll(async () => {
  t = await tempDb();
});
afterAll(() => t.cleanup());

function loadedWith(provider: Partial<LoadedConfig['config']['provider']>): LoadedConfig {
  const base = testLoaded();
  return { ...base, config: { ...base.config, mode: 'single', provider: { ...base.config.provider, model: 'priced', ...provider } } };
}
const at = (input: number, output: number) => loadedWith({ prices: { priced: { input, output } }, usd_to_gbp: 0.5 });

describe('ChatService.usage', () => {
  it("adds up the thread's calls and their stored costs in pounds, and leaves other threads out", async () => {
    const deps = testDeps(t.db);
    const w = await newWorkspace(deps);
    const other = await newWorkspace(deps);
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: at(2, 10) });
    expect(await chat.usage(w.session.session_id, w.thread.id)).toEqual({ input_tokens: 0, output_tokens: 0, gbp: 0 });
    for (let i = 0; i < 2; i++) await chat.runTurn(w.session.session_id, { thread_id: w.thread.id, doc_id: w.doc.id, text: 'Hi', envelope });
    await chat.runTurn(other.session.session_id, { thread_id: other.thread.id, doc_id: other.doc.id, text: 'Hi', envelope });
    // Each call: ($2 + $1) at 0.5 pounds to the dollar.
    expect(await chat.usage(w.session.session_id, w.thread.id)).toEqual({ input_tokens: 2_000_000, output_tokens: 200_000, gbp: 3 });
  });

  it('after a price change, still gives what the calls cost when they were made: the sum the budget uses', async () => {
    const deps = testDeps(t.db);
    const w = await newWorkspace(deps);
    const turn = (loaded: LoadedConfig) =>
      createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded }).runTurn(w.session.session_id, { thread_id: w.thread.id, doc_id: w.doc.id, text: 'Hi', envelope });
    await turn(at(2, 10));
    await turn(at(4, 20));
    const now = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: at(100, 100) });
    const usage = await now.usage(w.session.session_id, w.thread.id);
    expect(usage.gbp).toBe(4.5);
    expect(usage.gbp).toBe(await spendGbp(t.db, w.session.session_id));
  });

  it('counts a call from before costs were stored (no cost_gbp) as nothing, keeping its tokens', async () => {
    const deps = testDeps(t.db);
    const w = await newWorkspace(deps);
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: at(2, 10) });
    await chat.runTurn(w.session.session_id, { thread_id: w.thread.id, doc_id: w.doc.id, text: 'Hi', envelope });
    await t.db.execute('UPDATE gateway_calls SET cost_gbp = NULL WHERE session_id = ?', [w.session.session_id]);
    expect(await chat.usage(w.session.session_id, w.thread.id)).toEqual({ input_tokens: 1_000_000, output_tokens: 100_000, gbp: 0 });
  });
});
