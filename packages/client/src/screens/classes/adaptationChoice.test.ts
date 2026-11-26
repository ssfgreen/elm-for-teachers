import { describe, expect, it } from 'vitest';
import type { EntryBrief } from '../../api/pedagogy';
import { adaptationGroups } from './adaptationChoice';

const e = (id: string, hints: string[]): EntryBrief => ({ id, type: 'adaptation', title: id, summary: '', status: 'draft', evidence: null, facets: { often_relevant_to: hints }, claims: [] });
const all = [e('spacing', ['dyslexia']), e('schedule', ['autism', 'ADHD']), e('glossary', ['EAL'])];

describe('adaptationGroups', () => {
  it('puts the adaptations hinted by the text first, keeps the rest on offer, and leaves out those chosen', () => {
    const g = adaptationGroups(all, ['Dyslexia', 'Working memory'], new Set(['schedule']));
    expect(g.hints).toEqual(['dyslexia']);
    expect(g.suggested.map((x) => x.id)).toEqual(['spacing']);
    expect(g.others.map((x) => x.id)).toEqual(['glossary']);
  });
  it('suggests nothing for text it has no hint for', () => {
    expect(adaptationGroups(all, ['High achiever'], new Set()).suggested).toEqual([]);
  });
  it("reads the hints from a pupil's note as a teacher writes it", () => {
    expect(adaptationGroups(all, ['Dyslexic. Reads slowly and loses their place.'], new Set()).suggested.map((x) => x.id)).toEqual(['spacing']);
  });
});
