/** The workspace's limits: its budget in pounds and its messages in the last hour, checked before a turn calls the model. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LoadedConfig, type ProviderAdapter, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import { newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { MockProvider } from './mock.js';
import { addTopUp } from '../budget/store.js';
import { BUDGET_MESSAGE } from './limits.js';
import { createChatService, type ChatService, type TurnInput } from './service.js';

const envelope = { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let docId: string;
let setupEvents: number;

function chat(over: { provider?: ProviderAdapter; loaded?: LoadedConfig } = {}): ChatService {
  return createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider: over.provider ?? new MockProvider('mock-model', 1), loaded: over.loaded ?? loaded });
}
const input = (text: string): TurnInput => ({ thread_id: thread.id, doc_id: docId, text, envelope });
const since = async () => (await deps.events.list(sid)).slice(setupEvents);
function scripted(text: string): ProviderAdapter {
  return { model: 'scripted', temperature: 1, complete: async () => ({ text, input_tokens: null, output_tokens: null, provider_request_id: null }) };
}

beforeAll(async () => {
  t = await tempDb();
  loaded = { ...testLoaded(), config: { ...testLoaded().config, mode: 'single' } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  docId = w.doc.id;
  setupEvents = (await deps.events.list(sid)).length;
});

/** Limits with this hourly cap and budget (overrun £5 unless given). */
const limited = (messages_per_hour: number, budget_gbp = 60, budget_overrun_gbp = 5): LoadedConfig => ({
  ...loaded,
  config: { ...loaded.config, limits: { messages_per_hour, budget_gbp, budget_overrun_gbp } },
});
/** A turn's model call recorded `minutesAgo` ago, as if made then, costing `gbp`; `calls` > 1 is an agent turn of several steps. */
async function pastCall(minutesAgo: number, calls = 1, gbp: number | null = null) {
  const turn = `t_${newUlid()}`;
  for (let i = 0; i < calls; i++) {
    await t.db.execute('INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newUlid(),
      sid,
      thread.id,
      turn,
      '{}',
      new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      gbp,
    ]);
  }
}
const costs = async () => (await t.db.execute('SELECT cost_gbp FROM gateway_calls WHERE session_id = ? ORDER BY rowid', [sid])).rows.map((r) => r.cost_gbp);

describe('the cost of each call', () => {
  /** One call of 1M tokens in and 100k out on the model `priced`. */
  const priced: ProviderAdapter = { model: 'priced', temperature: 1, complete: async () => ({ text: 'Hi', input_tokens: 1_000_000, output_tokens: 100_000, cached_tokens: 0, provider_request_id: null }) };
  const at = (input: number, output: number): LoadedConfig => ({ ...loaded, config: { ...loaded.config, provider: { ...loaded.config.provider, prices: { priced: { input, output } }, usd_to_gbp: 0.5 } } });

  it('is stored with the call, at the prices in force when it was made', async () => {
    await chat({ provider: priced, loaded: at(2, 10) }).runTurn(sid, input('one'));
    // ($2 + $1) at 0.5 pounds to the dollar.
    expect(await costs()).toEqual([1.5]);
  });

  it('is not worked out again when the prices change: later calls only take the new ones', async () => {
    await chat({ provider: priced, loaded: at(2, 10) }).runTurn(sid, input('one'));
    await chat({ provider: priced, loaded: at(4, 20) }).runTurn(sid, input('two'));
    expect(await costs()).toEqual([1.5, 3]);
  });

  it('is null for a model with no price, which the budget counts as nothing', async () => {
    await chat({ provider: { ...priced, model: 'unpriced' }, loaded: at(2, 10) }).runTurn(sid, input('one'));
    expect(await costs()).toEqual([null]);
  });
});

describe('the budget, before a turn', () => {
  it('refuses a turn once spend reaches the budget, without calling the model, and says so plainly', async () => {
    let calls = 0;
    const provider: ProviderAdapter = { ...scripted('Hi'), complete: async () => (calls++, { text: 'Hi', input_tokens: null, output_tokens: null, provider_request_id: null }) };
    await pastCall(120, 1, 30);
    await pastCall(60, 1, 30);
    await expect(chat({ provider, loaded: limited(100, 60) }).runTurn(sid, input('two'))).rejects.toMatchObject({ statusCode: 429, code: 'budget_spent', message: BUDGET_MESSAGE });
    expect(calls).toBe(0);
    const logged = (await since()).filter((e) => e.kind === 'error');
    expect(logged.at(-1)?.payload).toMatchObject({ source: 'server', message: expect.stringContaining('budget_spent') });
    expect((await since()).filter((e) => e.kind === 'chat_prompt')).toHaveLength(0);
  });

  it('refuses a turn over the budget too', async () => {
    await pastCall(5, 1, 61);
    await expect(chat({ loaded: limited(100, 60) }).runTurn(sid, input('again'))).rejects.toMatchObject({ code: 'budget_spent' });
  });

  it('lets a turn through just under the budget; calls without a cost count as nothing', async () => {
    await pastCall(5, 1, 59.99);
    await pastCall(5, 3);
    expect((await chat({ loaded: limited(100, 60) }).runTurn(sid, input('fine'))).ok).toBe(true);
  });

  it('lets a turn through once topped up, where it was refused at the £60 budget', async () => {
    await pastCall(5, 1, 60);
    await expect(chat({ loaded: limited(100, 60) }).runTurn(sid, input('refused'))).rejects.toMatchObject({ code: 'budget_spent' });
    await addTopUp(t.db, deps.events, limited(100, 60).config.limits, sid, 'password');
    expect((await chat({ loaded: limited(100, 60) }).runTurn(sid, input('fine'))).ok).toBe(true);
  });

  it("counts only this workspace's spend", async () => {
    const other = await newWorkspace(deps);
    await t.db.execute('INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp) VALUES (?, ?, ?, ?, ?, ?, ?)', [newUlid(), other.session.session_id, other.thread.id, 't_x', '{}', new Date().toISOString(), 100]);
    expect((await chat({ loaded: limited(100, 60) }).runTurn(sid, input('fine'))).ok).toBe(true);
  });
});

describe('the hourly cap', () => {
  it('refuses a turn over the hourly limit and says when to try again; older calls do not count', async () => {
    const service = chat({ loaded: limited(2) });
    await pastCall(90);
    await pastCall(45);
    await pastCall(10);
    await expect(service.runTurn(sid, input('again'))).rejects.toMatchObject({ statusCode: 429, code: 'usage_limit_hourly', message: expect.stringContaining('try again in 15 minutes') });
  });

  it('lets a turn through under the limit', async () => {
    await pastCall(90);
    expect((await chat({ loaded: limited(1) }).runTurn(sid, input('fine'))).ok).toBe(true);
  });

  it('counts a turn of several model calls (agent steps) as one message', async () => {
    await pastCall(5, 4);
    expect((await chat({ loaded: limited(2) }).runTurn(sid, input('fine'))).ok).toBe(true);
  });
});
