import { describe, expect, it } from 'vitest';
import type { ClassesList } from '@edw/shared';
import { classForCurriculum, groupOutcomes } from './groupOutcomes';

const o = (code: string, organiser: string, sub_organiser: string | null = null) => ({ code, text: code, area: 'Literacy and English', organiser, sub_organiser });

describe('groupOutcomes', () => {
  it('groups by area, organiser and sub-organiser, keeping the order found', () => {
    expect(groupOutcomes([o('a', 'Reading', 'Tools'), o('b', 'Writing'), o('c', 'Reading', 'Tools')]).map(([k, xs]) => [k, xs.map((x) => x.code)])).toEqual([
      ['Literacy and English › Reading › Tools', ['a', 'c']],
      ['Literacy and English › Writing', ['b']],
    ]);
  });
  it('finds the class with the level its year group gives', () => {
    const list = { schools: [], year_groups: [{ id: 'Y', name: 'P7' }], classes: [{ id: 'C', name: 'P7A', stage: null, year_group_id: 'Y' }] } as unknown as ClassesList;
    expect(classForCurriculum(list, 'C')).toEqual({ id: 'C', name: 'P7A', level: 2 });
    expect(classForCurriculum(list, 'X')).toBeNull();
    expect(classForCurriculum(list, undefined)).toBeNull();
  });
});
