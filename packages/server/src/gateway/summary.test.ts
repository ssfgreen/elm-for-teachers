import { describe, expect, it } from 'vitest';
import { planHistory, summaryMessages, updateRunningSummary, SUMMARY_MAX_CHARS } from './summary.js';
import { turn } from './test-fixtures.js';

describe('updateRunningSummary', () => {
  it('returns the previous summary (or null) when nothing was trimmed', () => {
    expect(updateRunningSummary(null, [])).toBeNull();
    expect(updateRunningSummary('old', [])).toBe('old');
  });

  it('appends one line per trimmed turn with op counts', () => {
    const t = turn(1, [
      { op: 'insert', after: 'start', type: 'paragraph', content: 'x' },
      { op: 'insert', after: 'start', type: 'paragraph', content: 'y' },
      { op: 'delete', id: 'Z' },
    ]);
    expect(updateRunningSummary('Earlier line', [t, turn(2)])).toBe(
      [
        'Earlier line',
        'Teacher asked: prompt 1. Assistant: response 1; ops: insert 2, delete 1',
        'Teacher asked: prompt 2. Assistant: response 2; ops: none',
      ].join('\n'),
    );
  });

  it('truncates prompt and response to 120 characters and flattens newlines', () => {
    const t = { ...turn(1), prompt: 'a\n'.repeat(100), response_text: 'b'.repeat(300) };
    const line = updateRunningSummary(null, [t])!;
    expect(line).not.toContain('\n');
    expect(line).toBe(
      `Teacher asked: ${'a '.repeat(60)}. Assistant: ${'b'.repeat(120)}; ops: none`,
    );
  });

  it('caps at the limit by dropping the oldest lines', () => {
    const turns = Array.from({ length: 40 }, (_, i) => ({
      ...turn(i),
      prompt: `p${i} ${'x'.repeat(100)}`,
    }));
    const s = updateRunningSummary(null, turns)!;
    expect(s.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    const lines = s.split('\n');
    expect(lines.at(-1)).toContain('p39 ');
    expect(s).not.toContain('p0 ');
  });
});

describe('planHistory', () => {
  const h = [1, 2, 3, 4, 5, 6, 7].map((i) => turn(i));
  it('sends everything past the summary while it fits in max_turns', () => {
    expect(planHistory(h.slice(0, 4), 0, 4, 2)).toEqual({ fold: [], kept: h.slice(0, 4), covered: 0 });
    expect(planHistory(h, 3, 4, 2)).toEqual({ fold: [], kept: h.slice(3), covered: 3 });
  });
  it('past max_turns, folds all but keep_turns of the rest', () => {
    expect(planHistory(h.slice(0, 5), 0, 4, 2)).toEqual({ fold: h.slice(0, 3), kept: h.slice(3, 5), covered: 3 });
    expect(planHistory(h, 2, 4, 0)).toEqual({ fold: h.slice(2), kept: [], covered: 7 });
  });
  it('clamps a stored count beyond the history (turns deleted) and keep_turns above max_turns', () => {
    expect(planHistory(h.slice(0, 2), 9, 4, 2)).toEqual({ fold: [], kept: [], covered: 2 });
    expect(planHistory(h, 0, 4, 10).kept).toHaveLength(4);
  });
});

describe('summaryMessages', () => {
  it('asks for a summary of the turns, or for an update of the previous one, with each turn and its edits', () => {
    const t = { ...turn(1, [{ op: 'insert', after: 'start', type: 'paragraph', content: 'x' }]), anchor: { block_id: 'B', from: null, to: null, quote: 'like silk' } };
    const [first] = summaryMessages(null, [t]);
    expect(first!.content).toMatch(/^Summarise these turns/);
    expect(first!.content).toContain('<conversation>\nTeacher (about the passage "like silk"): prompt 1\nAssistant: response 1\n[Suggested edits: insert 1]\n</conversation>');
    const [update] = summaryMessages('## Done\n- x', [turn(2)]);
    expect(update!.content).toMatch(/^Here is the summary/);
    expect(update!.content).toContain('<summary>\n## Done\n- x\n</summary>');
  });
});
