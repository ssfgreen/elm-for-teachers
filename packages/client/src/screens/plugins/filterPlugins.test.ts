import { describe, expect, it } from 'vitest';
import type { PluginInfo } from '@edw/shared';
import { filterPlugins } from './filterPlugins';

const plugin = (p: Partial<PluginInfo>): PluginInfo => ({ id: 'x', kind: 'library', name: 'X', publisher: 'P', description: 'D', licence: 'L', tags: [], trust: 'use', available: true, ...p });
const all = [
  plugin({ id: 'arasaac', kind: 'pictures', name: 'ARASAAC pictures', publisher: 'Government of Aragón', tags: ['symbols'] }),
  plugin({ id: 'eo', name: 'Experiences and outcomes', publisher: 'Education Scotland', description: 'CfE outcomes, one per line with its code.' }),
  plugin({ id: 'trails', name: 'TRAILS', description: 'AI literacy lessons.', tags: ['technologies'] }),
  plugin({ id: 'pedagogy', kind: 'pedagogy', name: 'Pedagogy library (draft)', description: 'Adaptations and cautions.' }),
];
const ids = (ps: PluginInfo[]) => ps.map((p) => p.id);

describe('filterPlugins', () => {
  it('shows everything with no words and All', () => {
    expect(ids(filterPlugins(all, '  ', 'all'))).toEqual(['arasaac', 'eo', 'trails', 'pedagogy']);
  });

  it('matches every word in any case across name, publisher, description and tags', () => {
    expect(ids(filterPlugins(all, 'scotland CFE', 'all'))).toEqual(['eo']);
    expect(ids(filterPlugins(all, 'symbols', 'all'))).toEqual(['arasaac']);
    expect(ids(filterPlugins(all, 'technologies ai', 'all'))).toEqual(['trails']);
    expect(ids(filterPlugins(all, 'scotland ai', 'all'))).toEqual([]);
  });

  it('keeps to the kind picked', () => {
    expect(ids(filterPlugins(all, '', 'library'))).toEqual(['eo', 'trails', 'pedagogy']);
    expect(ids(filterPlugins(all, '', 'pictures'))).toEqual(['arasaac']);
  });
});
