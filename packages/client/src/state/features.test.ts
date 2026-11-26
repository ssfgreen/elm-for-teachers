import { describe, expect, it, vi } from 'vitest';
import type { SessionApi } from '../api/participant';
import { featureApi, PUPIL_METHODS } from './features';

const fullApi = () => {
  const a: Record<string, unknown> = { sessionId: 's1', listThreads: vi.fn(), listClasses: vi.fn() };
  for (const m of PUPIL_METHODS) a[m] = vi.fn();
  return a as unknown as SessionApi;
};

describe('featureApi', () => {
  it('with pupils off, takes away readings, reader settings and the class code, and nothing else', () => {
    const a = fullApi();
    const off = featureApi(a, { pupils: false });
    for (const m of PUPIL_METHODS) expect(off[m]).toBeUndefined();
    expect(off.listThreads).toBe(a.listThreads);
    expect(off.listClasses).toBe(a.listClasses);
    expect(off.sessionId).toBe('s1');
    // The api given is left as it was.
    for (const m of PUPIL_METHODS) expect(a[m]).toBeDefined();
  });

  it('with pupils on, keeps them all (the same object)', () => {
    const a = fullApi();
    expect(featureApi(a, { pupils: true })).toBe(a);
  });

  it('reads absent switches as the defaults: pupils off', () => {
    expect(featureApi(fullApi(), undefined).getClassCode).toBeUndefined();
    expect(featureApi(fullApi(), {}).listReadings).toBeUndefined();
  });
});
