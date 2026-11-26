import { describe, expect, it, vi } from 'vitest';
import type { SessionApi } from '../api/participant';
import { featureApi } from './features';

const fullApi = () =>
  ({ sessionId: 's1', listThreads: vi.fn(), listClasses: vi.fn() }) as unknown as SessionApi;

describe('featureApi', () => {
  it('keeps teacher workspace methods intact', () => {
    const a = fullApi();
    const out = featureApi(a, undefined);
    expect(out.listThreads).toBe(a.listThreads);
    expect(out.listClasses).toBe(a.listClasses);
    expect(out.sessionId).toBe('s1');
  });
});
