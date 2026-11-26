import { describe, expect, it } from 'vitest';
import { facetLabel, facetOptions, TYPE_DESCRIPTIONS, TYPE_LABELS } from './labels';

describe('pedagogy labels', () => {
  it('reads facet values as words', () => {
    expect(facetLabel('working_memory')).toBe('Working memory');
    expect(facetLabel('p7')).toBe('P7');
    expect(facetLabel('EAL')).toBe('EAL');
  });
  it('orders facet options by use, then name', () => {
    expect(facetOptions({ s1: 3, p7: 5, s2: 3 })).toEqual([{ value: 'p7', count: 5 }, { value: 's1', count: 3 }, { value: 's2', count: 3 }]);
    expect(facetOptions(undefined)).toEqual([]);
  });
  it('describes every type the screen offers', () => {
    expect(Object.keys(TYPE_DESCRIPTIONS).sort()).toEqual(Object.keys(TYPE_LABELS).sort());
  });
});
