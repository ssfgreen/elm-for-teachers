import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { needsNotice, saveThenSignOut, signInNotice, useAccountWorkspace } from './account';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const workspace = (notice_version: string | null = null) => ({ session_id: 'S1', token: 'tok-1', account: { provider: 'test', email: null, display_name: null, notice_version, is_admin: false } });

/** A fetch that answers by "METHOD path", and the calls it got. */
function serve(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: { key: string; body: unknown }[] = [];
  setFetch((async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return (routes[key] ?? (() => json({ error: 'unexpected' }, 500)))();
  }) as unknown as typeof fetch);
  return calls;
}

/** Whether the call rejected. Caught inside `act`: a rejection out of it loses later state updates. */
async function refused(call: () => Promise<void>): Promise<boolean> {
  let failed = false;
  await act(async () => {
    await call().catch(() => {
      failed = true;
    });
  });
  return failed;
}

afterEach(() => {
  cleanup();
  setFetch(null);
  vi.useRealTimers();
});

describe('the sign-in notice (config/sign-in-notice.json)', () => {
  const text = signInNotice.paragraphs.map((p) => p.map((part) => (typeof part === 'string' ? part : part.text)).join('')).join('\n');

  it('has a version, the title and the ethics line', () => {
    expect(signInNotice.version).toMatch(/\S/);
    expect(signInNotice.version.length).toBeLessThanOrEqual(40); // the server's limit
    expect(signInNotice.title).toBe('Before you start');
    expect(text).toContain('This study was certified according to the Informatics Research Ethics Process, reference number 541809.');
  });

  it('asks teachers not to upload identifiable pupil data, under a new version', () => {
    expect(text).toContain('Please do not upload identifiable pupil data into the system.');
    expect(text).not.toContain("Do not put pupils' real names or personal details in it.");
    expect(signInNotice.version).toBe('2026-11-15');
  });

  it('links the participant information sheet and the investigators', () => {
    const links = signInNotice.paragraphs.flat().filter((p) => typeof p !== 'string');
    expect(links.map((l) => l.href)).toEqual([
      'https://drive.google.com/file/d/1wtLh4oIcRYEghw1TuBOuNkNp1lQH0lvV/view?usp=sharing',
      'mailto:judy.robertson@ed.ac.uk',
      'mailto:samuel.green@ed.ac.uk',
    ]);
    expect(text).toContain('Please read the Participant Information Sheet (PIS)');
  });

  it('is shown until its version has been ticked, and again for a new version', () => {
    expect(needsNotice({ notice_version: null }, { version: '2' })).toBe(true);
    expect(needsNotice({ notice_version: '1' }, { version: '2' })).toBe(true);
    expect(needsNotice({ notice_version: '2' }, { version: '2' })).toBe(false);
  });
});

describe('saveThenSignOut', () => {
  it('saves first, then ends the sign-in', async () => {
    const order: string[] = [];
    let saved!: () => void;
    const done = saveThenSignOut({
      save: () => new Promise<void>((r) => (saved = r)).then(() => void order.push('saved')),
      end: async () => void order.push('ended'),
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    saved();
    await done;
    expect(order).toEqual(['saved', 'ended']);
  });

  it('gives up on a save that never finishes after the limit, and still signs out', async () => {
    vi.useFakeTimers();
    const end = vi.fn(async () => undefined);
    const done = saveThenSignOut({ save: () => new Promise<void>(() => undefined), end });
    await vi.advanceTimersByTimeAsync(4999);
    expect(end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('signs out when the save fails, and rejects when the server could not be told', async () => {
    const end = vi.fn(async () => undefined);
    await saveThenSignOut({ save: () => Promise.reject(new Error('offline')), end });
    expect(end).toHaveBeenCalledTimes(1);
    await expect(saveThenSignOut({ save: null, end: () => Promise.reject(new Error('offline')) })).rejects.toThrow('offline');
  });
});

describe('useAccountWorkspace', () => {
  it('holds the workspace and its token once the server answers', async () => {
    serve({ 'GET /api/account/workspace': () => json(workspace()) });
    const { result } = renderHook(() => useAccountWorkspace());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state).toMatchObject({ workspace: { token: 'tok-1' } });
    // In memory only.
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok-1');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('tok-1');
  });

  it('reads a 401 as signed out, and anything else as an error that can be tried again', async () => {
    serve({ 'GET /api/account/workspace': () => json({ error: 'sign-in required' }, 401) });
    const a = renderHook(() => useAccountWorkspace());
    await waitFor(() => expect(a.result.current.state.status).toBe('signed_out'));

    let fail = true;
    serve({ 'GET /api/account/workspace': () => (fail ? json({ error: 'down' }, 503) : json(workspace())) });
    const b = renderHook(() => useAccountWorkspace());
    await waitFor(() => expect(b.result.current.state.status).toBe('error'));
    fail = false;
    act(() => b.result.current.retry());
    await waitFor(() => expect(b.result.current.state.status).toBe('ready'));
  });

  it('records the ticked notice with its version', async () => {
    const calls = serve({ 'GET /api/account/workspace': () => json(workspace()), 'POST /api/account/notice': () => new Response(null, { status: 204 }) });
    const { result } = renderHook(() => useAccountWorkspace());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(() => result.current.accept('v9'));
    expect(calls.at(-1)).toEqual({ key: 'POST /api/account/notice', body: { version: 'v9' } });
    expect(result.current.state).toMatchObject({ workspace: { account: { notice_version: 'v9' } } });
  });

  it('keeps the notice unticked when the server refuses it', async () => {
    serve({ 'GET /api/account/workspace': () => json(workspace()), 'POST /api/account/notice': () => json({ error: 'no' }, 403) });
    const { result } = renderHook(() => useAccountWorkspace());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(await refused(() => result.current.accept('v9'))).toBe(true);
    expect(result.current.state).toMatchObject({ workspace: { account: { notice_version: null } } });
  });

  it('drops the token after signing out, and keeps it when signing out fails', async () => {
    let ok = false;
    const calls = serve({ 'GET /api/account/workspace': () => json(workspace('v1')), 'POST /api/auth/sign-out': () => (ok ? new Response(null, { status: 204 }) : json({ error: 'no' }, 500)) });
    const { result } = renderHook(() => useAccountWorkspace());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    expect(await refused(() => result.current.leave(null))).toBe(true);
    expect(result.current.state.status).toBe('ready');

    ok = true;
    const save = vi.fn(async () => {
      expect(calls.filter((c) => c.key === 'POST /api/auth/sign-out')).toHaveLength(1); // only the failed one so far
    });
    await act(() => result.current.leave(save));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'left' });
  });
});
