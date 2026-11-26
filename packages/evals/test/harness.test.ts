import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '@edw/shared/node';
import path from 'node:path';
import { REPO_ROOT } from '../src/context.js';
import { h, ol, p, runCase, table } from '../src/harness.js';
import { MockProvider } from '../../server/src/gateway/mock.js';
import { serializeCanvas } from '../../server/src/gateway/prompt.js';
import { parseCanvas } from '../src/fixtures.js';
import { budgetChecks, docInOrder, docKeeps, docMatches, edited, noRejectedEdits, usedTool } from '../src/judges.js';

const loaded = loadAppConfig(path.join(REPO_ROOT, 'config'));
const agent = { ...loaded, config: { ...loaded.config, mode: 'agent' as const } };
const mock = new MockProvider('mock-model', 1);

describe('runCase (with the mock provider)', () => {
  it('runs a turn in a fresh workspace and reports the steps, tool calls and the docs before and after', async () => {
    const run = await runCase({ docs: [{ name: 'Untitled', blocks: [] }], prompt: 'Please draft a worksheet on similes.' }, { provider: mock, loaded: agent });
    expect(run.ok).toBe(true);
    expect(run.steps.map((s) => s.step)).toEqual([0, 1]);
    expect(run.toolCalls.map((c) => c.name)).toEqual(['edit_document']);
    expect(run.before).toEqual({ Untitled: '' });
    expect(run.after.Untitled).toMatch(/^# /);
    for (const check of [edited, usedTool('edit_document'), noRejectedEdits, docMatches('Untitled', /simile/i)]) expect(check(run).pass).toBe(true);
    // The mock reports no tokens; the budget checks still run.
    expect(budgetChecks().map((c) => c(run).pass)).toEqual([true, true, true, true]);
  });

  it('points an anchor at a fixture block by its key, and seeds the chat history', async () => {
    const run = await runCase(
      { docs: [{ name: 'Weather', blocks: [h('# Weather'), p('The rain was heavy.', 'line')] }], history: [{ prompt: 'Hello', reply: 'Hi!' }], prompt: 'Make this a simile.', anchor: { key: 'line', quote: 'heavy' } },
      { provider: mock, loaded: agent },
    );
    expect(run.ok).toBe(true);
    // The mock rewords the commented block with a replace.
    expect(run.operations.map((o) => o.op)).toEqual(['replace']);
    expect(docKeeps('Weather', '# Weather')(run).pass).toBe(true);
  });

  it('refuses an anchor naming a block the fixture does not have', async () => {
    await expect(runCase({ docs: [{ name: 'A', blocks: [p('x')] }], prompt: 'Hi', anchor: { key: 'nope' } }, { provider: mock, loaded: agent })).rejects.toThrow(/unknown block key: nope/);
  });
});

describe('judges', () => {
  it('docInOrder needs every pattern, in order', () => {
    const run = { after: { D: '# Title\n\n## Part\n\n1. one' } } as never;
    expect(docInOrder('D', [/^# /, /^## /, /^1\. /])(run).pass).toBe(true);
    expect(docInOrder('D', [/^## /, /^# /])(run).pass).toBe(false);
    expect(docInOrder('D', [/^# /, /missing/])(run).pass).toBe(false);
  });
});

describe('parseCanvas', () => {
  it('reads back what serializeCanvas writes, ids as keys and continuation lines included', () => {
    const blocks = [
      { ...h('# Title'), id: '01JB10CK000000000000000001', doc_id: 'D1', status: 'live', order: 0 },
      { ...ol(['One', 'Two']), id: '01JB10CK000000000000000002', doc_id: 'D1', status: 'live', order: 1 },
      { ...table([['A', 'B'], ['1', '2']]), id: '01JB10CK000000000000000003', doc_id: 'D2', status: 'live', order: 0 },
    ];
    const docs = [
      { id: 'D1', name: 'First', thread_id: 'T', session_id: 'S', created_by: 'teacher', created_at: '2026-10-30T10:00:00.000Z' },
      { id: 'D2', name: 'Second', thread_id: 'T', session_id: 'S', created_by: 'model', created_at: '2026-10-30T10:01:00.000Z' },
    ];
    const parsed = parseCanvas(serializeCanvas(blocks as never, docs as never, 'D1'));
    expect(parsed.map((d) => [d.name, d.open ?? false, d.blocks.length])).toEqual([
      ['First', true, 2],
      ['Second', false, 1],
    ]);
    expect(parsed[0]!.blocks[1]).toEqual({ type: 'numbered_list', content: '1. One\n2. Two', key: '01JB10CK000000000000000002' });
    expect(parsed[1]!.blocks[0]!.content).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });
});

describe('runCase with comments (mock provider)', () => {
  it('seeds threads, runs the message as an @model comment in one, and reports the model’s reply there', async () => {
    const run = await runCase(
      {
        docs: [{ name: 'Weather', blocks: [h('# Weather'), p('The rain was heavy.', 'line')] }],
        comments: [{ key: 't', block: 'line', quote: 'heavy', body: 'Too plain?', replies: [{ body: 'Maybe.' }] }],
        inThread: 't',
        prompt: '@model what do you think?',
      },
      { provider: mock, loaded: agent },
    );
    expect(run.ok).toBe(true);
    expect(run.modelComments).toEqual([{ root: false, quote: null, body: run.message, onBlock: 'line' }]);
  });
});
