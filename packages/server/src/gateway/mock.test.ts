import { describe, expect, it } from 'vitest';
import type { Block, InsertOp } from '@edw/shared';
import { MockProvider, sampleWorksheet } from './mock.js';
import { buildPrompt } from './prompt.js';
import { parseModelOutput } from './parse.js';
import { validateOperations } from './validate.js';
import { block, doc, DOC, ulid } from './test-fixtures.js';

const provider = new MockProvider('mock', 1);

async function run(prompt: string, blocks: Block[], anchor: { block_id: string; type: string; quote: string | null } | null = null) {
  const { system, messages } = buildPrompt({ systemPrompt: 'SYSTEM', docs: [doc({ id: DOC })], blocks, openDocId: DOC, history: [], runningSummary: null, currentPrompt: prompt, anchor });
  const result = await provider.complete(messages, system);
  const parsed = parseModelOutput(result.text);
  const live = blocks.filter((b) => b.status === 'live');
  const validated = validateOperations(parsed.rawOperations, {
    liveBlockIds: new Set(live.map((b) => b.id)),
    blockDoc: new Map(live.map((b) => [b.id, b.doc_id])),
    docIds: new Set([DOC]),
    openDocId: DOC,
  });
  return { result, parsed, validated };
}

const worksheet = (): Block[] => sampleWorksheet().map((op, i) => block({ id: ulid(`b${String(i).padStart(2, '0')}`), order: i, type: (op as InsertOp).type, content: (op as InsertOp).content }));

describe('MockProvider', () => {
  it('fills an empty open doc with the sample worksheet, which validates with zero drops', async () => {
    const { parsed, validated } = await run('Can you write a worksheet on similes?', []);
    expect(parsed.parseError).toBeNull();
    expect(validated.dropped).toEqual([]);
    expect(validated.operations).toHaveLength(12);
    expect(validated.operations.every((o) => o.op === 'insert' && o.after === 'start' && o.doc === undefined)).toBe(true);
  });

  it('creates a new doc when asked, filled through its temp id', async () => {
    const { validated } = await run('Can you make a new document with a simpler version?', worksheet());
    expect(validated.dropped).toEqual([]);
    const [cd, ...rest] = validated.operations;
    expect(cd).toEqual({ op: 'create_doc', temp_id: 'd1', name: 'Simpler version' });
    expect(rest.every((o) => o.op === 'insert' && o.doc === 'd1' && o.after === 'start')).toBe(true);
  });

  it('copies the open doc with copy_of when asked for a copy', async () => {
    const { parsed } = await run('Make a copy of this please', worksheet());
    expect(parsed.rawOperations).toEqual([{ op: 'create_doc', temp_id: 'copy', name: 'Copy', copy_of: DOC }]);
    expect((await run('Make a copy of this please', [])).parsed.rawOperations).not.toEqual(expect.arrayContaining([expect.objectContaining({ copy_of: DOC })]));
  });

  it('adds support material after the last block of a non-empty doc', async () => {
    const blocks = worksheet();
    const { validated } = await run('Please adapt this for pupils with dyslexia', blocks);
    expect(validated.dropped).toEqual([]);
    expect(validated.operations.every((o) => o.op === 'insert' && o.after === blocks.at(-1)!.id)).toBe(true);
  });

  it('answers an @model comment with a replace of that block', async () => {
    const blocks = worksheet();
    const target = blocks[2]!;
    const { validated } = await run('Make this clearer', blocks, { block_id: target.id, type: 'paragraph', quote: null });
    expect(validated.operations).toEqual([{ op: 'replace', id: target.id, content: `${target.content} (clearer version)` }]);
  });

  it('answers an @model comment asking for it shorter by taking its first word out', async () => {
    const blocks = worksheet();
    const target = blocks[2]!;
    const { validated } = await run('Make this shorter', blocks, { block_id: target.id, type: 'paragraph', quote: null });
    expect(validated.operations).toEqual([{ op: 'replace', id: target.id, content: target.content.replace(/^\S+\s+/, '') }]);
  });

  it('suggests a pale green page when asked about the background', async () => {
    const { validated } = await run('Make the background light green', []);
    expect(validated).toEqual({ operations: [{ op: 'set_style', background: 'green' }], dropped: [] });
  });

  it('answers questions in chat only, falls back to an offer of help, and is deterministic', async () => {
    const q = await run('What is the difference between a metaphor and a simile?', []);
    expect(q.parsed.rawOperations).toBeNull();
    expect(q.parsed.message).toMatch(/like/);
    const thanks = await run('Thanks', worksheet());
    expect(thanks.parsed.rawOperations).toBeNull();
    expect((await run('worksheet please', [])).result).toEqual((await run('worksheet please', [])).result);
  });
});
