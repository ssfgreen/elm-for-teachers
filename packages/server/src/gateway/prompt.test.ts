import { describe, expect, it } from 'vitest';
import { buildPrompt, serializeCanvas, splitHistory, type BuildPromptInput } from './prompt.js';
import { block, doc, DOC, turn, ulid } from './test-fixtures.js';

const A = ulid('a');
const B = ulid('b');
const C = ulid('c');
const D2 = ulid('d2');
const D3 = ulid('d3');

describe('serializeCanvas', () => {
  const docs = [
    doc({ id: D3, name: 'Later', created_at: '2026-10-29T11:00:00.000Z' }),
    doc({ id: D2, name: 'Earlier', created_at: '2026-10-29T10:30:00.000Z' }),
    doc({ id: DOC, name: 'Metaphors', created_at: '2026-10-29T12:00:00.000Z' }),
  ];
  const blocks = [
    block({ id: B, order: 2, type: 'numbered_list', content: '1. The sea is a mirror. ____\n2. Fast as a fox. ____' }),
    block({ id: A, order: 1, type: 'heading', content: '# Metaphors and similes' }),
    block({ id: ulid('gone'), order: 3, status: 'deleted', content: 'gone' }),
    block({ id: C, order: 0, doc_id: D2, type: 'paragraph', content: 'Earlier text' }),
    block({ id: ulid('p'), order: 5, status: 'proposed', content: 'pending' }),
    block({ id: ulid('r'), order: 6, status: 'rejected', content: 'turned down' }),
    block({ id: ulid('e'), order: 0, doc_id: D2, type: 'paragraph', content: 'Kept', pending: { op: 'replace', turn_id: 't', content: 'Kept, rewritten' } }),
  ];

  it('lists the open doc first, then the others oldest first: live blocks and suggestions not yet decided on, in order', () => {
    expect(serializeCanvas(blocks, docs, DOC)).toBe(
      [
        `## Document: Metaphors (id: ${DOC}; open)`,
        `1. [id=${A}] [type=heading] # Metaphors and similes`,
        `2. [id=${B}] [type=numbered_list] 1. The sea is a mirror. ____`,
        '   2. Fast as a fox. ____',
        `3. [id=${ulid('p')}] [type=paragraph] [suggested] pending`,
        '',
        `## Document: Earlier (id: ${D2})`,
        `1. [id=${C}] [type=paragraph] Earlier text`,
        `2. [id=${ulid('e')}] [type=paragraph] Kept`,
        '   (suggested, not yet accepted: replace with: Kept, rewritten)',
        '',
        `## Document: Later (id: ${D3})`,
        '(empty)',
      ].join('\n'),
    );
  });

  it('is stable under input permutation', () => {
    expect(serializeCanvas([...blocks].reverse(), [...docs].reverse(), DOC)).toBe(serializeCanvas(blocks, docs, DOC));
  });

  it("shows a doc's font and page colour, and a suggested one not yet accepted, under its heading", () => {
    const styled = [doc({ id: DOC, name: 'Metaphors', style: { font: 'arial', background: 'cream' }, proposed_style: { style: { background: 'green' }, turn_id: 't' } })];
    expect(serializeCanvas([], styled, DOC)).toBe(
      [`## Document: Metaphors (id: ${DOC}; open)`, 'Style: font=arial, background=cream', '(suggested style, not yet accepted: background=green)', '(empty)'].join('\n'),
    );
    expect(serializeCanvas([], [doc({ id: DOC, name: 'Plain' })], DOC)).toBe(`## Document: Plain (id: ${DOC}; open)\n(empty)`);
  });
});

describe('buildPrompt', () => {
  const base: BuildPromptInput = {
    systemPrompt: 'SYSTEM',
    docs: [doc({ id: DOC })],
    blocks: [],
    openDocId: DOC,
    history: [],
    runningSummary: null,
    currentPrompt: 'Make me a worksheet',
  };

  it('puts the system prompt in system and the docs with the prompt in the last message', () => {
    const { system, messages } = buildPrompt(base);
    expect(system).toBe('SYSTEM');
    expect(messages).toEqual([{ role: 'user', content: `## Documents\n\n## Document: Untitled (id: ${DOC}; open)\n(empty)\n\n---\n\nTeacher: Make me a worksheet` }]);
  });

  it('names the anchored block before the teacher text for an @model comment', () => {
    const last = buildPrompt({ ...base, anchor: { block_id: A, type: 'paragraph', quote: 'the sea' } }).messages.at(-1)!.content;
    expect(last).toContain(`---\n\nThe teacher is commenting on block [id=${A}] (paragraph) and selected the text "the sea". Make the change there unless they ask otherwise.\n\nTeacher: Make me a worksheet`);
  });

  it('replays the history it is given as alternating user/assistant, after the summary when there is one', () => {
    const history = [4, 5].map((i) => turn(i));
    const messages = buildPrompt({ ...base, history, runningSummary: 'SUM' }).messages;
    expect(messages.map((m) => [m.role, m.content.split('\n')[0]])).toEqual([
      ['system', 'Summary of earlier conversation:'],
      ['user', 'prompt 4'],
      ['assistant', 'assistant 4'],
      ['user', 'prompt 5'],
      ['assistant', 'assistant 5'],
      ['user', '## Documents'],
    ]);
    expect(messages[0]!.content).toBe('Summary of earlier conversation:\n\nSUM');
    expect(buildPrompt({ ...base, history }).messages).toHaveLength(5);
  });
});

describe('splitHistory', () => {
  it('returns kept and trimmed turns', () => {
    const h = [1, 2, 3].map((i) => turn(i));
    expect(splitHistory(h, 2)).toEqual({ kept: [h[1], h[2]], trimmed: [h[0]] });
    expect(splitHistory(h, 5)).toEqual({ kept: h, trimmed: [] });
  });
});

describe('serializeCanvas: list items', () => {
  it('shows each item as its own block, numbered as the teacher sees it', () => {
    const [x, y, z] = [ulid('x'), ulid('y'), ulid('z')];
    const blocks = [
      block({ id: x, order: 0, type: 'numbered_item', content: '1. Starter' }),
      block({ id: y, order: 1, type: 'numbered_item', content: '1. Practice\n   ____', pending: { op: 'replace', turn_id: 't', content: '1. Practice in pairs' } }),
      block({ id: z, order: 2, type: 'bullet_item', content: '- Note' }),
    ];
    expect(serializeCanvas(blocks, [doc({ id: DOC, name: 'Plan' })], DOC).split('\n').slice(1)).toEqual([
      `1. [id=${x}] [type=numbered_item] 1. Starter`,
      `2. [id=${y}] [type=numbered_item] 2. Practice`,
      '      ____',
      '   (suggested, not yet accepted: replace with: 2. Practice in pairs)',
      `3. [id=${z}] [type=bullet_item] - Note`,
    ]);
  });

  it('says which waiting changes to a list are one suggestion', () => {
    const [a, b, c, d, e] = [ulid('ia'), ulid('ib'), ulid('ic'), ulid('id'), ulid('ie')];
    const blocks = [
      block({ id: a, order: 0, type: 'numbered_item', content: '1. Starter' }),
      block({ id: b, order: 1, type: 'numbered_item', content: '2. Share', pending: { op: 'replace', turn_id: 't1', content: '2. Share (15 minutes)' } }),
      block({ id: c, order: 2, type: 'numbered_item', content: '3. Exit ticket', pending: { op: 'delete', turn_id: 't1' } }),
      block({ id: d, order: 3, type: 'numbered_item', content: '4. Plenary', status: 'proposed', origin_turn: 't1' }),
      block({ id: e, order: 4, type: 'paragraph', content: 'Notes', pending: { op: 'replace', turn_id: 't1', content: 'Notes, longer' } }),
    ];
    expect(serializeCanvas(blocks, [doc({ id: DOC, name: 'Plan' })], DOC).split('\n').slice(1)).toEqual([
      `1. [id=${a}] [type=numbered_item] 1. Starter`,
      `2. [id=${b}] [type=numbered_item] 2. Share`,
      '   (suggested, not yet accepted: replace with: 2. Share (15 minutes); one suggestion with blocks 3, 4)',
      `3. [id=${c}] [type=numbered_item] 3. Exit ticket`,
      '   (suggested, not yet accepted: delete this block; one suggestion with blocks 2, 4)',
      `4. [id=${d}] [type=numbered_item] [suggested] (one suggestion with blocks 2, 3) 4. Plenary`,
      `5. [id=${e}] [type=paragraph] Notes`,
      '   (suggested, not yet accepted: replace with: Notes, longer)',
    ]);
  });
});
