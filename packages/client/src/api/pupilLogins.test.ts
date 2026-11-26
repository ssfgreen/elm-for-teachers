import { describe, expect, it, vi } from 'vitest';
import { hasPupilLogins, pupilLoginsApi } from './pupilLogins';

const envelope = { client_ts: '2026-11-24T12:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('pupilLoginsApi', () => {
  it('lists with GET, makes with POST {count, envelope}, deletes with DELETE and no body', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const listed = { id: 'L1', username: 'tidy-otter-42', used: false, label: null, locked: false };
    const made = { id: 'L2', username: 'brave-heron-7', password: 'apple-river-9' };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith('/password')) return json({ login: made });
      return method === 'DELETE' ? json({ ok: true }) : json({ logins: method === 'POST' ? [made] : [listed] });
    });
    const a = pupilLoginsApi('S1', { token: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await a.listPupilLogins('C1')).toEqual([listed]);
    expect(await a.makePupilLogins('C1', 3, envelope)).toEqual([made]);
    expect(await a.deletePupilLogin('C1', 'L1')).toBeUndefined();
    expect(await a.newPupilPassword('C1', 'L2', envelope)).toEqual(made);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/sessions/S1/classes/C1/logins'],
      ['POST', '/api/sessions/S1/classes/C1/logins'],
      ['DELETE', '/api/sessions/S1/classes/C1/logins/L1'],
      ['POST', '/api/sessions/S1/classes/C1/logins/L2/password'],
    ]);
    expect(calls[3]!.body).toEqual({ envelope });
    expect(calls[0]!.body).toBeUndefined();
    expect(calls[1]!.body).toEqual({ count: 3, envelope });
    expect(calls[2]!.body).toBeUndefined();
  });

  it('hasPupilLogins needs all four calls; the make kit has none', () => {
    expect(hasPupilLogins({})).toBe(false);
    expect(hasPupilLogins({ listPupilLogins: vi.fn(), makePupilLogins: vi.fn() })).toBe(false);
    expect(hasPupilLogins({ listPupilLogins: vi.fn(), makePupilLogins: vi.fn(), deletePupilLogin: vi.fn() })).toBe(false);
    expect(hasPupilLogins(pupilLoginsApi('S1', {}))).toBe(true);
  });
});
