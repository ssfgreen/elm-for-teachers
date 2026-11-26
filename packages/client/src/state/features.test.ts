import { describe, expect, it, vi } from 'vitest';
import type { SessionApi } from '../api/participant';
import { featureApi, NEEDS_GROUP_METHODS } from './features';

const fullApi = () => {
  const a: Record<string, unknown> = { sessionId: 's1', listThreads: vi.fn(), listClasses: vi.fn() };
  for (const m of NEEDS_GROUP_METHODS) a[m] = vi.fn();
  return a as unknown as SessionApi;
};

describe('featureApi', () => {
  it('keeps needs groups methods by default and when needs_groups is on', () => {
    const a = fullApi();
    expect(featureApi(a, undefined)).toBe(a);
    expect(featureApi(a, { needs_groups: true })).toBe(a);
  });

  it('strips needs groups methods when needs_groups is off without mutating the source', () => {
    const a = fullApi();
    const off = featureApi(a, { needs_groups: false });
    for (const m of NEEDS_GROUP_METHODS) expect(off[m]).toBeUndefined();
    expect(off.listThreads).toBe(a.listThreads);
    expect(a.listNeedsGroups).toBeDefined();
  });
});
