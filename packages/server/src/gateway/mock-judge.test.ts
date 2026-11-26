import { describe, expect, it } from 'vitest';
import { mockJudgeArguments } from './mock-judge.js';

describe("the mock's judge", () => {
  it('flags what the turn removed or changed, and nothing it only added', () => {
    const message = ['What the turn did:', 'E1 removed (left out of the copy): "Learning intention"', 'E2 changed: "About 20 minutes" → "About 15 minutes"', 'E3 added: "Extension"'].join('\n');
    const { flags } = JSON.parse(mockJudgeArguments(message)) as { flags: { findings: string[]; label: string }[] };
    expect(flags.map((f) => [f.findings, f.label])).toEqual([
      [['E1'], 'removed'],
      [['E2'], 'changed'],
    ]);
  });
});
