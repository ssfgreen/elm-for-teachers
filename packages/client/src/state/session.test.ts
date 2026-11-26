import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { makeSession } from '../test-utils';
import { useSession } from './session';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => setFetch(null));

describe('useSession', () => {
  it('resolves the link token, then loads the session with it', async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    setFetch(vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') });
      return String(url) === '/api/participant' ? json({ session_id: 'S1' }) : json(makeSession());
    }) as unknown as typeof fetch);
    const { result } = renderHook(() => useSession('tok'));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(result.current).toMatchObject({ sessionId: 'S1', error: null, session: { label: 'Year 7 English' } });
    expect(calls).toEqual([
      { url: '/api/participant', auth: 'Bearer tok' },
      { url: '/api/sessions/S1', auth: 'Bearer tok' },
    ]);
  });

  it('reports a bad link', async () => {
    setFetch((async () => json({ error: 'invalid participant token' }, 401)) as unknown as typeof fetch);
    const { result } = renderHook(() => useSession('nope'));
    await waitFor(() => expect(result.current.error).toMatch(/401/));
    expect(result.current.session).toBeNull();
  });

  it('resolves the link once per page load, so one open is recorded however often it mounts', async () => {
    const opens = vi.fn();
    setFetch(vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/participant') {
        opens();
        return json({ session_id: 'S9' });
      }
      return json(makeSession({ session_id: 'S9' }));
    }) as unknown as typeof fetch);
    const a = renderHook(() => useSession('tok-once'));
    const b = renderHook(() => useSession('tok-once'));
    await waitFor(() => expect(a.result.current.session).not.toBeNull());
    await waitFor(() => expect(b.result.current.session).not.toBeNull());
    expect(opens).toHaveBeenCalledTimes(1);
  });
});
