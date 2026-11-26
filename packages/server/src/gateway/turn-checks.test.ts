import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Doc, LoadedConfig, SpyglassMode, SpyglassResult, Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, ServerEnvelope } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { ProviderError } from './errors.js';
import { loadGatewayCalls, loadTurns } from './history.js';
import { JUDGE_PROMPT_HASH } from './judge.js';
import { createChatService, type TurnInput } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';
import { FUNCTION_LIMIT_MS } from './turn-checks.js';

const envelope = { client_ts: '2026-11-11T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let base: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;
let env: ServerEnvelope;

const loaded = (mode: SpyglassMode = 'shown_and_model', timeout = 8000): LoadedConfig => ({
  ...base,
  config: { ...base.config, mode: 'agent', agent: { ...base.config.agent, tools: DEFAULT_TOOLS }, spyglass: { mode, judge_timeout_ms: timeout, judge_models: [] } },
});
const chat = (provider: Parameters<typeof createChatService>[0]['provider'], l = loaded()) => createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: l });
const input = (text: string, over: Partial<TurnInput> = {}): TurnInput => ({ thread_id: thread.id, doc_id: doc.id, text, envelope, ...over });
const insert = async (content: string, after = 'start') => (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after, type: 'paragraph', content }, env)).block!;
const edit = (operations: unknown[]) => () => ({ calls: [{ name: 'edit_document', args: { operations } }] });
const reply = (text: string) => () => ({ text });
/** The judge's answer: flags on findings E1, E2, ... */
const judge = (flags: { findings: string[]; label: string; title: string; why: string }[]) => () => ({ calls: [{ name: 'report_flags', args: { flags } }] });
const shownEvents = async () => (await deps.events.list(sid, { kinds: ['spyglass_shown'] })).map((e) => e.payload);
const judgeCalls = async () => (await loadGatewayCalls(t.db, sid)).filter((c) => c.purpose === 'judge');

beforeAll(async () => {
  t = await tempDb();
  base = testLoaded();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  env = envelopeFor(doc, thread);
});

describe('Spyglass after the commit', () => {
  it('calls no judge, stores nothing and logs nothing when the turn changed only formatting', async () => {
    const a = await insert('Read the *poem*.');
    const { provider, requests } = scripted(edit([{ op: 'replace', id: a.id, content: 'Read the **poem**.' }]), reply('Made it bold.'));
    const r = await chat(provider).runTurn(sid, input('Make poem bold'));
    expect(r.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(await shownEvents()).toEqual([]);
    expect((await loadTurns(t.db, sid))[0]!.spyglass).toBeUndefined();
  });

  it("asks the judge about a change, stores its flags with the turn on the real block, and tells later turns", async () => {
    const a = await insert('Learning intention: use similes.');
    const b = await insert('Answer 6: Metaphor', a.id);
    const { provider, requests } = scripted(edit([{ op: 'replace', id: b.id, content: 'Answer 6: Simile' }]), reply('Tidied the answers.'), judge([{ findings: ['E1'], label: 'changed', title: 'Answer 6 changed', why: 'The answer key now says Simile.' }]));
    const seen: SpyglassResult[] = [];
    const order: string[] = [];
    const r = await chat(provider).runTurn(sid, input('Tidy the layout'), { onResult: () => order.push('result'), onSpyglass: (_id, s) => (order.push('spyglass'), seen.push(s)) });
    if (!r.ok) throw new Error('expected ok');
    expect(order).toEqual(['result', 'spyglass']);
    expect(requests.at(-1)!.toolChoice).toEqual({ name: 'report_flags' });
    const flag = { check: 'scope', label: 'changed', block_ids: [b.id], title: 'Answer 6 changed', why: 'The answer key now says Simile.', was: 'Answer 6: Metaphor' };
    expect(seen).toEqual([{ flags: [flag], others: 0, by: 'judge' }]);

    const [turn] = await loadTurns(t.db, sid);
    const [call] = await judgeCalls();
    expect(call).toMatchObject({ turn_id: r.turn_id, system_prompt_hash: JUDGE_PROMPT_HASH, error: null });
    expect(turn!.spyglass).toEqual({ flags: [flag], others: 0, by: 'judge', judge_call_id: call!.gateway_call_id });
    expect(turn!.rewritten_assistant_content.endsWith('\n[Spyglass: changed "Answer 6 changed"]')).toBe(true);
    expect(await shownEvents()).toEqual([{ turn_id: r.turn_id, flags: [{ check: 'scope', label: 'changed', block_ids: [b.id] }], others: 0, by: 'judge', gateway_call_id: call!.gateway_call_id }]);
    expect((await chat(provider).listTurns(sid, thread.id))[0]!.spyglass).toEqual({ flags: [flag], others: 0, by: 'judge' });
  });

  it('names the blocks of a copy made this turn by their real ids', async () => {
    const a = await insert('Learning intention: use similes.');
    const b = await insert('About 20 minutes', a.id);
    const { provider } = scripted(
      edit([{ op: 'create_doc', temp_id: 'c', name: 'Shorter', copy_of: doc.id }, { op: 'delete', id: `c/${a.id}` }, { op: 'replace', id: `c/${b.id}`, content: 'About 15 minutes' }]),
      reply('Made a shorter copy.'),
      // In document order: the copy's changed time (E1), then the learning intention it left out (E2).
      judge([{ findings: ['E2'], label: 'removed', title: 'Learning intention left out', why: 'The copy has no learning intention.' }, { findings: ['E1'], label: 'changed', title: 'Time changed', why: 'Now 15 minutes.' }]),
    );
    const r = await chat(provider).runTurn(sid, input('Make a shorter copy'));
    if (!r.ok) throw new Error('expected ok');
    const copy = r.created_doc_ids[0]!;
    const copied = r.changes.blocks.filter((x) => x.doc_id === copy);
    const flags = (await loadTurns(t.db, sid))[0]!.spyglass!.flags;
    const time = copied.find((x) => x.derived_from === b.id)!;
    expect(time).toBeDefined();
    expect(flags[0]).toMatchObject({ label: 'removed', block_ids: [a.id] });
    expect(flags[1]).toMatchObject({ label: 'changed', block_ids: [time.id], was: 'About 20 minutes' });
  });

  it('keeps three flags and counts the rest', async () => {
    const blocks = [];
    let after = 'start';
    for (const n of [1, 2, 3, 4, 5]) {
      const x = await insert(`Question ${n}: what is a simile?`, after);
      blocks.push(x);
      after = x.id;
    }
    const { provider } = scripted(
      edit(blocks.map((x, k) => ({ op: 'replace', id: x.id, content: `Question ${k + 1}: what is a metaphor?` }))),
      reply('Done.'),
      judge(blocks.map((_, k) => ({ findings: [`E${k + 1}`], label: 'changed', title: `Question ${k + 1}`, why: 'Asks about metaphors now.' }))),
    );
    const seen: SpyglassResult[] = [];
    await chat(provider).runTurn(sid, input('Fix the spacing'), { onSpyglass: (_id, s) => seen.push(s) });
    expect(seen[0]!.flags.map((f) => f.title)).toEqual(['Question 1', 'Question 2', 'Question 3']);
    expect(seen[0]!.others).toBe(2);
    expect((await loadTurns(t.db, sid))[0]!.rewritten_assistant_content).toContain('; 2 more]');
  });

  it("does not flag a block deleted in place in Suggesting mode (it has its own card), but does in Editing mode", async () => {
    const a = await insert('Learning intention: use similes.');
    const b = await insert('Task 1', a.id);
    const flagged = judge([{ findings: ['E1'], label: 'removed', title: 'Learning intention gone', why: 'Pupils no longer see what they are learning.' }]);
    const suggest = scripted(edit([{ op: 'delete', id: a.id }]), reply('Removed it.'), flagged);
    await chat(suggest.provider).runTurn(sid, input('Shorter please'));
    expect((await loadTurns(t.db, sid))[0]!.spyglass).toMatchObject({ flags: [], others: 0, by: 'judge' });

    const direct = scripted(edit([{ op: 'delete', id: b.id }]), reply('Removed it.'), flagged);
    await chat(direct.provider).runTurn(sid, input('Shorter please', { edit_mode: 'edit' }));
    expect((await loadTurns(t.db, sid))[1]!.spyglass!.flags).toMatchObject([{ label: 'removed', block_ids: [b.id] }]);
  });

  it("falls back to the effect's findings, titled by the words they had, when the judge takes too long", async () => {
    const a = await insert('Answer 6: Metaphor');
    const { provider } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'));
    const slow = { ...provider, respond: async (req: Parameters<NonNullable<typeof provider.respond>>[0], onText?: (d: string) => void, signal?: AbortSignal) => {
      if (typeof req.toolChoice === 'object') {
        await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('the judge timed out'))));
      }
      return provider.respond!(req, onText, signal);
    } };
    const r = await chat(slow, loaded('shown_and_model', 50)).runTurn(sid, input('Tidy'));
    if (!r.ok) throw new Error('expected ok');
    const stored = (await loadTurns(t.db, sid))[0]!.spyglass!;
    expect(stored).toMatchObject({ by: 'fallback', flags: [{ label: 'changed', block_ids: [a.id], title: '“Answer 6: Metaphor” changed', why: '', was: 'Answer 6: Metaphor' }] });
    expect(await judgeCalls()).toMatchObject([{ error: 'the judge timed out' }]);
  });

  it('charges a judge call that timed out at its worst cost, and one the provider refused at nothing', async () => {
    const priced = (l: LoadedConfig): LoadedConfig => ({ ...l, config: { ...l.config, spyglass: { ...l.config.spyglass, judge_model: 'gpt-6-sol' } } });
    const failing = (id: string, err: Error) => {
      const { provider } = scripted(edit([{ op: 'replace', id, content: 'Answer: Simile' }]), reply('Done.'));
      return { ...provider, respond: async (req: Parameters<NonNullable<typeof provider.respond>>[0], onText?: (d: string) => void, signal?: AbortSignal) => {
        if (typeof req.toolChoice === 'object') throw err;
        return provider.respond!(req, onText, signal);
      } };
    };
    const judgeCost = async () => (await t.db.execute("SELECT cost_gbp FROM gateway_calls WHERE session_id = ? AND json_extract(payload, '$.purpose') = 'judge'", [sid])).rows.map((r) => r.cost_gbp);
    const a = await insert('Answer 6: Metaphor');
    const b = await insert('Answer 7: Metaphor', a.id);
    await chat(failing(a.id, new ProviderError('timeout', 'provider timed out after 8000 ms without data')), priced(loaded())).runTurn(sid, input('Tidy'));
    // At least its output cap (4,000 tokens at $10 a million, 0.75 pounds to the dollar).
    expect((await judgeCost())[0]).toBeGreaterThan(0.03);
    await t.db.execute('DELETE FROM gateway_calls WHERE session_id = ?', [sid]);
    await chat(failing(b.id, new ProviderError('http', 'provider returned HTTP 500: down', 500)), priced(loaded())).runTurn(sid, input('Tidy again'));
    expect(await judgeCost()).toEqual([0]);
  });

  it('skips the judge when too little of the function time is left', async () => {
    const a = await insert('Answer 6: Metaphor');
    const { provider, requests } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'));
    const realNow = performance.now.bind(performance);
    let started = false;
    // The request began almost the function's whole limit ago.
    performance.now = () => (started ? realNow() + FUNCTION_LIMIT_MS : (started = true, realNow()));
    try {
      await chat(provider).runTurn(sid, input('Tidy'));
    } finally {
      performance.now = realNow;
    }
    expect(requests).toHaveLength(2);
    expect(await judgeCalls()).toEqual([]);
    expect((await shownEvents())[0]).toMatchObject({ by: 'fallback', flags: [{ label: 'changed', block_ids: [a.id] }] });
  });

  it('reads the function limit from the setting, not only the 300 s default', async () => {
    const a = await insert('Answer 6: Metaphor');
    const { provider, requests } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'));
    // A limit shorter than the judge's own time limit leaves no room for the judge.
    const l = loaded();
    await createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: l, functionLimitMs: l.config.spyglass.judge_timeout_ms }).runTurn(sid, input('Tidy'));
    expect(requests).toHaveLength(2);
    expect(await judgeCalls()).toEqual([]);
    expect((await shownEvents())[0]).toMatchObject({ by: 'fallback' });
  });

  it.each([
    ['the teacher turned it off', 'shown_and_model' as const, false, 'teacher_off'],
    ['the deployment has it off', 'off' as const, true, 'config_off'],
  ])('still judges and logs when %s, but shows nothing and tells later turns nothing', async (_why, mode, on, hidden) => {
    const a = await insert('Answer 6: Metaphor');
    const { provider, requests } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'), judge([{ findings: ['E1'], label: 'changed', title: 'Answer 6 changed', why: 'Simile now.' }]));
    const seen: unknown[] = [];
    await chat(provider, loaded(mode)).runTurn(sid, input('Tidy', { spyglass: on }), { onSpyglass: (...x) => seen.push(x) });
    expect(requests).toHaveLength(3);
    expect(seen).toEqual([]);
    const [turn] = await loadTurns(t.db, sid);
    expect(turn!.spyglass).toMatchObject({ hidden, flags: [{ label: 'changed' }] });
    expect(turn!.rewritten_assistant_content).not.toContain('[Spyglass');
    expect((await shownEvents())[0]).toMatchObject({ hidden, flags: [{ label: 'changed', block_ids: [a.id] }] });
    expect((await chat(provider).listTurns(sid, thread.id))[0]!.spyglass).toBeUndefined();
  });

  it('hides the flags with workspace_off when the workspace has Spyglass off, whatever the toggle says', async () => {
    await deps.sessions.setFeatures(sid, { spyglass: false }, 'password');
    const a = await insert('Answer 6: Metaphor');
    const { provider, requests } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'), judge([{ findings: ['E1'], label: 'changed', title: 'Answer 6 changed', why: 'Simile now.' }]));
    const seen: unknown[] = [];
    await chat(provider).runTurn(sid, input('Tidy', { spyglass: true }), { onSpyglass: (...x) => seen.push(x) });
    // The checker still ran, unseen.
    expect(requests).toHaveLength(3);
    expect(seen).toEqual([]);
    const [turn] = await loadTurns(t.db, sid);
    expect(turn!.spyglass).toMatchObject({ hidden: 'workspace_off', flags: [{ label: 'changed' }] });
    expect(turn!.rewritten_assistant_content).not.toContain('[Spyglass');
    expect((await shownEvents())[0]).toMatchObject({ hidden: 'workspace_off', flags: [{ label: 'changed', block_ids: [a.id] }] });
    expect((await chat(provider).listTurns(sid, thread.id))[0]!.spyglass).toBeUndefined();
  });

  it('says the workspace had it off before the teacher', async () => {
    await deps.sessions.setFeatures(sid, { spyglass: false }, 'password');
    const a = await insert('Answer 6: Metaphor');
    const { provider } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'), judge([]));
    await chat(provider).runTurn(sid, input('Tidy', { spyglass: false }));
    expect((await loadTurns(t.db, sid))[0]!.spyglass).toMatchObject({ hidden: 'workspace_off' });
  });

  it('says the deployment had it off before the workspace', async () => {
    await deps.sessions.setFeatures(sid, { spyglass: false }, 'password');
    const a = await insert('Answer 6: Metaphor');
    const { provider } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'), judge([]));
    await chat(provider, loaded('off')).runTurn(sid, input('Tidy', { spyglass: false }));
    expect((await loadTurns(t.db, sid))[0]!.spyglass).toMatchObject({ hidden: 'config_off' });
  });

  it.each([
    ['gpt-6-luna', 'gpt-6-luna'],
    ['gpt-6-astra', 'gpt-6-sol'],
  ])('a turn on %s is judged by %s', async (turnModel, judgeModel) => {
    const a = await insert('Answer 6: Metaphor');
    const { provider, requests } = scripted(edit([{ op: 'replace', id: a.id, content: 'Answer 6: Simile' }]), reply('Done.'), judge([]));
    const l = loaded();
    const models = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'].map((id) => ({ id, label: id, reasoning: true }));
    const config = { ...l.config, provider: { ...l.config.provider, model: 'gpt-6-sol', models }, spyglass: { ...l.config.spyglass, judge_model: 'gpt-6-sol', judge_models: ['gpt-6-sol', 'gpt-6-luna'] } };
    await chat(provider, { ...l, config }).runTurn(sid, input('Tidy', { model: turnModel }));
    expect(requests).toHaveLength(3);
    expect(requests[0]!.model).toBe(turnModel);
    expect(requests[2]!.model).toBe(judgeModel);
  });

  it("logs the teacher's toggle with the prompt", async () => {
    const { provider } = scripted(reply('Hello.'));
    await chat(provider).runTurn(sid, input('Hi', { spyglass: false }));
    expect((await deps.events.list(sid, { kinds: ['chat_prompt'] }))[0]!.payload).toMatchObject({ spyglass: false });
  });
});
