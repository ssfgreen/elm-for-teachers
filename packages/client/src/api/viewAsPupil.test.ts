import { describe, expect, it, vi } from 'vitest';
import { hasViewAsPupil, viewAsPupilApi } from './viewAsPupil';

const envelope = { client_ts: '2026-11-24T12:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };

describe('viewAsPupilApi', () => {
  it('posts the envelope to the class’s view-as-pupil route', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(null, { status: 204 });
    });
    await viewAsPupilApi('S1', { token: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch }).viewAsPupil('C1', envelope);
    expect(calls).toEqual([{ url: '/api/sessions/S1/classes/C1/view-as-pupil', method: 'POST', body: { envelope } }]);
  });

  it('hasViewAsPupil needs the call', () => {
    expect(hasViewAsPupil({})).toBe(false);
    expect(hasViewAsPupil(viewAsPupilApi('S1', {}))).toBe(true);
  });
});
