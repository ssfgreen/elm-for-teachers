import { describe, expect, it, vi } from 'vitest';
import { classMembersApi, hasClassMembers } from './classMembers';

const envelope = { client_ts: '2026-11-24T12:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('classMembersApi', () => {
  it('lists the class’s pupils and removes one with DELETE and the envelope', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const member = { id: 'M1', label: 'Pupil 1', provider: 'google', joined_on: '2026-11-24' };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return init?.method === 'DELETE' ? json(null, 204) : json({ members: [member] });
    });
    const a = classMembersApi('S1', { token: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await a.listClassMembers('C1')).toEqual([member]);
    await a.removeClassMember('C1', 'M1', envelope);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/sessions/S1/classes/C1/members'],
      ['DELETE', '/api/sessions/S1/classes/C1/members/M1'],
    ]);
    expect(calls[1]!.body).toEqual({ envelope });
  });

  it('hasClassMembers needs both calls', () => {
    expect(hasClassMembers({})).toBe(false);
    expect(hasClassMembers({ listClassMembers: vi.fn() })).toBe(false);
    expect(hasClassMembers(classMembersApi('S1', {}))).toBe(true);
  });
});
