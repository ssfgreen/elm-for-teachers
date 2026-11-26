/** The budget before each model call in an agent turn: no call starts that could take spend past budget plus overrun. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LoadedConfig, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { ProviderError } from './errors.js';
import { loadGatewayCalls } from './history.js';
import { addTopUp } from '../budget/store.js';
import { BUDGET_MESSAGE, BudgetError, checkCallBudget } from './limits.js';
import { createChatService, type TurnInput } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const envelope = { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let sid: string;
let thread: Thread;
let docId: string;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  docId = w.doc.id;
});

/**
 * Agent mode on gpt-6-sol at $2 in and $10 out per million, 0.5 pounds to the dollar: a million
 * tokens in costs £1. Budget £1 plus £0.5 overrun. The output cap is what a call's worst cost
 * mostly is: 100,000 tokens is £0.50.
 */
function loadedWith(maxOutputTokens: number): LoadedConfig {
  const base = testLoaded();
  return {
    ...base,
    config: {
      ...base.config,
      mode: 'agent',
      provider: { ...base.config.provider, model: 'gpt-6-sol', max_output_tokens: maxOutputTokens, prices: { 'gpt-6-sol': { input: 2, output: 10 } }, usd_to_gbp: 0.5 },
      agent: { max_steps: 6, max_turn_ms: 200_000, reasoning_effort: 'medium', tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] },
      limits: { messages_per_hour: 100, budget_gbp: 1, budget_overrun_gbp: 0.5 },
    },
  };
}

/** Scripted steps, each reporting `tokens[i]` input tokens and no output. */
function steps(tokens: number[], ...script: Parameters<typeof scripted>) {
  const s = scripted(...script);
  const respond = s.provider.respond!;
  s.provider.respond = async (req, onText, signal) => ({ ...(await respond(req, onText, signal)), input_tokens: tokens[s.requests.length - 1]!, output_tokens: 0, cached_tokens: 0 });
  return s;
}
const readDoc = () => ({ calls: [{ name: 'read_document', args: { doc_id: docId } }] });
const answer = () => ({ text: 'Done.' });

const input = (text: string): TurnInput => ({ thread_id: thread.id, doc_id: docId, text, envelope, spyglass: false });
const costs = async () => (await t.db.execute('SELECT cost_gbp FROM gateway_calls WHERE session_id = ? ORDER BY rowid', [sid])).rows.map((r) => r.cost_gbp);

describe('the budget before each model call', () => {
  it('stops the turn before a call that could take spend past budget plus overrun, keeping the steps done', async () => {
    // Step 1 costs £1; step 2 could cost £0.50 more: £1.50 and a little, past £1.50.
    const s = steps([1_000_000], readDoc, answer);
    const r = await createChatService({ ...deps, provider: s.provider, loaded: loadedWith(100_000) }).runTurn(sid, input('Go'));
    expect(r).toMatchObject({ ok: false, message: BUDGET_MESSAGE });
    expect(s.requests).toHaveLength(1);
    // The step that ran, and the refused call, which cost nothing.
    expect(await costs()).toEqual([1, 0]);
    const errors = await deps.events.list(sid, { kinds: ['error'] });
    expect(errors.at(-1)!.payload).toMatchObject({ source: 'server', message: expect.stringContaining('budget_spent') });
    // The amounts stay out of the log, which the export carries.
    expect(JSON.stringify(errors.at(-1)!.payload)).not.toMatch(/£|\d\.\d/);
    expect(JSON.stringify((await loadGatewayCalls(t.db, sid)).at(-1))).not.toContain('£');
  });

  it('lets a call go ahead past the budget while it cannot pass the overrun; the next turn is refused', async () => {
    // Step 1 costs £0.90; step 2 could cost about £0.50: under £1.50. Together they spend £1.10.
    const s = steps([900_000, 200_000], readDoc, answer);
    const service = createChatService({ ...deps, provider: s.provider, loaded: loadedWith(100_000) });
    expect((await service.runTurn(sid, input('Go'))).ok).toBe(true);
    expect(await costs()).toEqual([0.9, 0.2]);
    await expect(service.runTurn(sid, input('Again'))).rejects.toMatchObject({ statusCode: 429, code: 'budget_spent' });
  });

  it("counts the workspace's saved spend: a first call can be refused", async () => {
    await t.db.execute('INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp) VALUES (?, ?, ?, ?, ?, ?, ?)', [newUlid(), sid, thread.id, 't_old', '{}', new Date().toISOString(), 0.99]);
    // £0.99 is under the budget, so the turn starts; its first call could cost £0.52 or more.
    const s = steps([], answer);
    const r = await createChatService({ ...deps, provider: s.provider, loaded: loadedWith(104_000) }).runTurn(sid, input('Go'));
    expect(r).toMatchObject({ ok: false, message: BUDGET_MESSAGE });
    expect(s.requests).toHaveLength(0);
  });
});

describe('the budget before each call, with top-ups', () => {
  it('adds the top-ups: a call refused at the config budget goes ahead once topped up', async () => {
    const limits = loadedWith(100_000).config.limits;
    const next = { model: 'gpt-6-sol', inputBytes: 400, maxOutputTokens: 100_000 };
    await t.db.execute('INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp) VALUES (?, ?, ?, ?, ?, ?, ?)', [newUlid(), sid, thread.id, 't_old', '{}', new Date().toISOString(), 1.2]);
    // £1.20 spent and about £0.50 to come: past £1 budget plus £0.50 overrun.
    await expect(checkCallBudget(t.db, limits, loadedWith(100_000).config.provider, sid, next, [])).rejects.toBeInstanceOf(BudgetError);
    await addTopUp(t.db, deps.events, limits, sid, 'password');
    // £11 budget plus overrun now.
    expect(await checkCallBudget(t.db, limits, loadedWith(100_000).config.provider, sid, next, [])).toBeGreaterThan(0.5);
  });
});

describe('a call that reached the provider but came back without its token counts', () => {
  /** Step 1 reads the doc (100 tokens in); step 2 ends as `fail` says. */
  function failingSecond(fail: () => Promise<never> | 'no usage') {
    const s = steps([100], readDoc, answer);
    const respond = s.provider.respond!;
    s.provider.respond = async (req, onText, signal) => {
      if (s.requests.length === 1) {
        const f = fail();
        if (f === 'no usage') return { ...(await respond(req, onText, signal)), input_tokens: null, output_tokens: null, cached_tokens: null };
        s.requests.push(req);
        return f;
      }
      return respond(req, onText, signal);
    };
    return s;
  }
  const run = (s: ReturnType<typeof steps>) => createChatService({ ...deps, provider: s.provider, loaded: loadedWith(100_000) }).runTurn(sid, input('Go'));

  it('is charged at its worst cost when it timed out', async () => {
    await run(failingSecond(() => Promise.reject(new ProviderError('timeout', 'provider timed out after 1 ms without data'))));
    const [first, second] = (await costs()) as number[];
    expect(first).toBeCloseTo(0.0001);
    // At least the output cap: 100,000 tokens is £0.50.
    expect(second).toBeGreaterThan(0.5);
  });

  it('is charged at its worst cost when the stream failed or was stopped', async () => {
    await run(failingSecond(() => Promise.reject(new ProviderError('bad_response', 'provider stream ended without a finished response'))));
    expect(((await costs()) as number[])[1]).toBeGreaterThan(0.5);
  });

  it('is charged at its worst cost when the teacher stopped it', async () => {
    const r = await run(failingSecond(() => Promise.reject(new ProviderError('aborted', 'the request was stopped'))));
    expect(r).toMatchObject({ ok: false, stopped: true });
    expect(((await costs()) as number[])[1]).toBeGreaterThan(0.5);
  });

  it('is charged at its worst cost when it finished but the provider left the counts out', async () => {
    await run(failingSecond(() => 'no usage'));
    expect(((await costs()) as number[])[1]).toBeGreaterThan(0.5);
  });

  it('costs nothing when the provider refused it before running (an HTTP error)', async () => {
    await run(failingSecond(() => Promise.reject(new ProviderError('http', 'provider returned HTTP 429: busy', 429))));
    expect(((await costs()) as number[])[1]).toBe(0);
  });
});

describe("this turn's steps without counts", () => {
  it("count at their worst cost in the next step's check", async () => {
    // Output cap 160,000 tokens: each call's worst cost is £0.80 and a little. Step 1 comes back
    // without counts, so it counts at that; step 2 could take spend to £1.60, past £1.50.
    const s = steps([0], readDoc, answer);
    const respond = s.provider.respond!;
    s.provider.respond = async (req, onText, signal) => ({ ...(await respond(req, onText, signal)), input_tokens: null, output_tokens: null, cached_tokens: null });
    const r = await createChatService({ ...deps, provider: s.provider, loaded: loadedWith(160_000) }).runTurn(sid, input('Go'));
    expect(r).toMatchObject({ ok: false, message: BUDGET_MESSAGE });
    expect(s.requests).toHaveLength(1);
    const [first, refused] = (await costs()) as number[];
    expect(first).toBeGreaterThan(0.8);
    expect(refused).toBe(0);
  });
});

describe('known gap: turns running at once', () => {
  // Each turn sees saved spend and its own unsaved steps, not the other's, so together they can
  // pass budget plus overrun. Left as it is (a follow-up item if Sam wants a hard ceiling).
  it('lets two turns at once both run, and together they spend past budget plus overrun', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started = 0;
    const both = new Promise<void>((r) => {
      const tick = setInterval(() => started >= 2 && (clearInterval(tick), r()), 5);
    });
    /** One step of 1,000,000 tokens in (£1), held until both turns have passed the check. */
    const held = () => {
      const s = steps([1_000_000], answer);
      const respond = s.provider.respond!;
      s.provider.respond = async (req, onText, signal) => {
        started++;
        await gate;
        return respond(req, onText, signal);
      };
      return s;
    };
    const other = await deps.threads.create(sid, envelopeFor(null, null));
    const loaded = loadedWith(100_000);
    const one = createChatService({ ...deps, provider: held().provider, loaded }).runTurn(sid, input('One'));
    const two = createChatService({ ...deps, provider: held().provider, loaded }).runTurn(sid, { ...input('Two'), thread_id: other.thread.id, doc_id: other.doc.id });
    await both;
    release();
    expect((await one).ok).toBe(true);
    expect((await two).ok).toBe(true);
    // £2 spent against £1 plus £0.50.
    expect(((await costs()) as number[]).reduce((n, c) => n + c, 0)).toBe(2);
  });
});
