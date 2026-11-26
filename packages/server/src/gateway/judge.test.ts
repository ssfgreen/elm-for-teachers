import { createDoc, createState, insertBlock, newUlid as ulid, turnEffect, type AgentRequest, type AgentStep, type Ctx, type ProviderAdapter } from '@edw/shared';
import { describe, expect, it } from 'vitest';
import { fallbackFlags, judgeTurn, MAX_WHY_WORDS, parseAnswer } from './judge.js';
import { findingsOf, JUDGE_TOOL_NAME, judgeMessage, type JudgeCase } from './judge-prompt.js';
import { MockProvider } from './mock.js';

const ctx: Ctx = { now: () => '2026-11-11T12:00:00.000Z', newId: () => ulid() };
const thread = ulid();

/** A worksheet, and a turn that copies it, leaves out the learning intention and shortens the task. */
function copyTurn(): JudgeCase {
  const state = createState('s');
  const doc = createDoc(state, ctx, { thread_id: thread, name: 'Similes', created_by: 'teacher' }).doc;
  let after = 'start';
  const ids = ['# Similes', 'Learning intention: I can tell a simile from a metaphor.', 'Underline the simile in each sentence.'].map((content) => {
    const b = insertBlock(state, ctx, { doc_id: doc.id, after, type: 'paragraph', content, origin: 'teacher', status: 'live', actor: 'teacher', cause_event_id: ulid() }).block;
    after = b.id;
    return b.id;
  });
  const effect = turnEffect({
    blocks: [...state.blocks.values()],
    docs: [...state.docs.values()],
    operations: [
      { op: 'create_doc', temp_id: 'c', name: 'Similes (short)', copy_of: doc.id },
      { op: 'delete', id: `c/${ids[1]}` },
      { op: 'replace', id: `c/${ids[2]}`, content: 'Underline it.' },
    ],
    turn_id: 't',
    thread_id: thread,
    default_doc_id: doc.id,
  });
  const copy = effect.created_doc_ids[0]!;
  return { prompt: 'Create a duplicate with less text.', reply: 'I made a shorter copy.', effect, docs: [{ id: doc.id, name: 'Similes' }, { id: copy, name: 'Similes (short)', copy_of: doc.id }] };
}

const step = (args: unknown, name = JUDGE_TOOL_NAME): AgentStep => ({
  text: '',
  toolCalls: [{ call_id: 'c1', name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }],
  output: [],
  input_tokens: 100,
  output_tokens: 20,
  provider_request_id: null,
});

function provider(answers: AgentStep[]): ProviderAdapter & { requests: AgentRequest[] } {
  const requests: AgentRequest[] = [];
  return {
    model: 'judge',
    temperature: 1,
    requests,
    complete: () => Promise.reject(new Error('not used')),
    respond: (req) => {
      requests.push(req);
      return Promise.resolve(answers.shift()!);
    },
  };
}

describe('the judge', () => {
  it('writes the findings with references, doc by doc, and says what is left out', () => {
    const c = copyTurn();
    const text = judgeMessage(c, findingsOf(c.effect));
    expect(text).toContain('The teacher asked: "Create a duplicate with less text."');
    expect(text).toContain('In "Similes (short)" (a copy of "Similes", made this turn):');
    expect(text).toMatch(/E1 changed: "Underline the simile in each sentence\." → "Underline it\."/);
    expect(text).toMatch(/E2 removed \(left out of the copy\): "Learning intention/);
    expect(text).toContain('Not listed: 1 block(s) copied or moved unchanged');
  });

  it('takes an added label, for content the request did not call for', () => {
    const c = copyTurn();
    const answer = parseAnswer(step({ flags: [{ findings: ['E1'], label: 'added', title: 'Extra fact added', why: 'Pupils learn something not asked for.' }] }), findingsOf(c.effect));
    expect(answer).toMatchObject({ flags: [{ label: 'added', title: 'Extra fact added' }] });
  });

  it('forces its one tool, and turns references into blocks, with the text before for a change', async () => {
    const c = copyTurn();
    const p = provider([step({ flags: [{ findings: ['E2'], label: 'removed', title: 'Learning intention left out', why: 'The copy no longer says what pupils are learning.' }, { findings: ['E1'], label: 'changed', title: 'Task shortened', why: 'Shorter.' }] })]);
    const out = await judgeTurn(p, c, { model: 'mistral', reasoningEffort: 'none' });
    expect(p.requests[0]).toMatchObject({ toolChoice: { name: JUDGE_TOOL_NAME }, model: 'mistral', reasoningEffort: 'none' });
    const [changed, removed] = findingsOf(c.effect);
    expect(out.result).toEqual({
      by: 'judge',
      others: 0,
      flags: [
        { check: 'scope', label: 'removed', block_ids: removed!.block_ids, title: 'Learning intention left out', why: 'The copy no longer says what pupils are learning.' },
        { check: 'scope', label: 'changed', block_ids: changed!.block_ids, title: 'Task shortened', why: 'Shorter.', was: 'Underline the simile in each sentence.' },
      ],
    });
  });

  it('asks once more after an answer it cannot use, and gives up after the second', async () => {
    const c = copyTurn();
    const retried = await judgeTurn(provider([step('{not json'), step({ flags: [] })]), c);
    expect(retried).toMatchObject({ result: { flags: [], others: 0, by: 'judge' }, errors: ['arguments are not JSON'] });
    expect(retried.steps).toHaveLength(2);
    const failed = await judgeTurn(provider([step({ flags: [{ findings: ['E9'], label: 'removed', title: 'x', why: '' }] }), step({}, 'other_tool')]), c);
    expect(failed).toMatchObject({ result: null, flags: null, errors: ['unknown finding in ["E9"]', 'no tool call'] });
  });

  it('the mock judge flags what the turn removed or changed', async () => {
    const out = await judgeTurn(new MockProvider('mock', 1), copyTurn());
    expect(out.errors).toEqual([]);
    expect(out.result?.flags.map((f) => [f.label, f.title])).toEqual([
      ['changed', '“Underline the simile…” changed'],
      ['removed', '“Learning intention: I…” removed'],
    ]);
  });

  it('refuses a label it does not know', () => {
    const c = copyTurn();
    expect(parseAnswer(step({ flags: [{ findings: ['E1'], label: 'stale', title: 'x', why: '' }] }), findingsOf(c.effect))).toHaveProperty('error');
  });

  it('falls back to the removed and changed findings, titled by the first words they had', () => {
    const r = fallbackFlags(copyTurn().effect);
    expect(r.by).toBe('fallback');
    expect(r.flags.map((f) => [f.label, f.title, f.why])).toEqual([
      ['changed', '“Underline the simile in…” changed', ''],
      ['removed', '“Learning intention: I can…” removed', ''],
    ]);
  });

  it('cuts a long title or why, so the callout can be skimmed', () => {
    const c = copyTurn();
    const long = 'one two three four five six seven eight nine ten';
    const out = parseAnswer(step({ flags: [{ findings: ['E1'], label: 'changed', title: long, why: `${long} ${long} ${long}` }] }), findingsOf(c.effect));
    if (!('flags' in out)) throw new Error(out.error);
    expect(out.flags[0]!.title).toBe('one two three four five six seven eight…');
    expect(out.flags[0]!.why.split(' ')).toHaveLength(MAX_WHY_WORDS);
  });
});
