import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSessionRow } from '../../api/types';
import { useAdminSessions } from './useAdminSessions';

const row = (over: Partial<AdminSessionRow> = {}): AdminSessionRow => ({
  session_id: 'S1', label: 'Year 7', participant_token: 't', participant_url: 'http://site/s/t', access: 'link', access_code: 'ABCD-EFGH-JKMN', link_closed_at: null,
  first_opened_at: null, last_opened_at: null, interactions_on: false, interactions_until: null, interactions_active: false,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
});

async function justCreated() {
  const api = {
    listSessions: vi.fn(async () => [row()]),
    createSession: vi.fn(async () => ({ session: row(), participant_url: 'http://site/s/t' })),
    renameSession: vi.fn(),
    setFeatures: vi.fn(),
  };
  const hook = renderHook(() => useAdminSessions(api));
  await act(async () => {
    await hook.result.current.create('Year 7', false);
  });
  await waitFor(() => expect(hook.result.current.sessions).toHaveLength(1));
  expect(hook.result.current.created?.participant_url).toBe('http://site/s/t');
  return hook;
}

describe('useAdminSessions: the link just made', () => {
  it('shows the new link after Replace, not the dead one', async () => {
    const hook = await justCreated();
    act(() => hook.result.current.replace(row({ participant_token: 't2', participant_url: 'http://site/s/t2', access_code: 'WXYZ-0123-4567' })));
    expect(hook.result.current.created?.participant_url).toBe('http://site/s/t2');
    expect(hook.result.current.created?.session.access_code).toBe('WXYZ-0123-4567');
    expect(hook.result.current.sessions[0]?.participant_url).toBe('http://site/s/t2');
  });

  it('drops it after Close', async () => {
    const hook = await justCreated();
    act(() => hook.result.current.replace(row({ participant_url: null, access_code: null, link_closed_at: '2026-11-13T10:00:00Z' })));
    expect(hook.result.current.created).toBeNull();
  });

  it('keeps it when a change carries no link (the interaction logging switch)', async () => {
    const hook = await justCreated();
    const noLink: Partial<AdminSessionRow> = row({ interactions_on: true });
    delete noLink.participant_url;
    act(() => hook.result.current.replace(noLink as AdminSessionRow));
    expect(hook.result.current.created?.participant_url).toBe('http://site/s/t');
    expect(hook.result.current.created?.session.interactions_on).toBe(true);
  });
});

describe('useAdminSessions: feature switches', () => {
  const setup = (setFeatures: (id: string, p: object) => Promise<AdminSessionRow>) => {
    const api = { listSessions: vi.fn(async () => [row()]), createSession: vi.fn(), renameSession: vi.fn(), setFeatures: vi.fn(setFeatures) };
    return { api, hook: renderHook(() => useAdminSessions(api)) };
  };

  it('moves the switch at once and keeps the saved row', async () => {
    let resolve: (r: AdminSessionRow) => void = () => {};
    const { api, hook } = setup(() => new Promise((r) => (resolve = r)));
    await waitFor(() => expect(hook.result.current.sessions).toHaveLength(1));
    let done: Promise<string | null> = Promise.resolve(null);
    act(() => {
      done = hook.result.current.setFeatures('S1', { spyglass: false });
    });
    expect(hook.result.current.sessions[0]?.features?.spyglass).toBe(false);
    expect(api.setFeatures).toHaveBeenCalledWith('S1', { spyglass: false });
    await act(async () => {
      resolve(row({ updated_at: '2026-11-23T10:00:00Z', features: { classes: true, curriculum: true, pedagogy: true, preferences: true, spyglass: false, plugins: true, pupils: false } }));
      expect(await done).toBeNull();
    });
    expect(hook.result.current.sessions[0]?.updated_at).toBe('2026-11-23T10:00:00Z');
  });

  it('puts the switch back and gives the reason when the save is refused', async () => {
    const { hook } = setup(async () => Promise.reject(new Error('not allowed')));
    await waitFor(() => expect(hook.result.current.sessions).toHaveLength(1));
    let reason: string | null = null;
    await act(async () => {
      reason = await hook.result.current.setFeatures('S1', { pupils: true });
    });
    expect(reason).toBe('not allowed');
    expect(hook.result.current.sessions[0]?.features?.pupils).toBe(false);
  });

  it('sends the chosen switches with a new workspace', async () => {
    const api = { listSessions: vi.fn(async () => [row()]), createSession: vi.fn(async () => ({ session: row(), participant_url: null })), renameSession: vi.fn(), setFeatures: vi.fn() };
    const hook = renderHook(() => useAdminSessions(api));
    await act(async () => {
      await hook.result.current.create('Year 8', false, { pupils: true });
    });
    expect(api.createSession).toHaveBeenCalledWith('Year 8', { study: false, features: { pupils: true } });
  });
});

describe('useAdminSessions: two saves on one workspace', () => {
  it('keeps the newer answer when the older one arrives last', async () => {
    const answers: ((r: AdminSessionRow) => void)[] = [];
    const api = {
      listSessions: vi.fn(async () => [row()]),
      createSession: vi.fn(),
      renameSession: vi.fn(),
      setFeatures: vi.fn(() => new Promise<AdminSessionRow>((r) => answers.push(r))),
    };
    const hook = renderHook(() => useAdminSessions(api));
    await waitFor(() => expect(hook.result.current.sessions).toHaveLength(1));
    const on = { classes: true, curriculum: true, pedagogy: true, preferences: true, spyglass: true, plugins: true, pupils: false };
    let a: Promise<string | null> = Promise.resolve(null);
    let b: Promise<string | null> = Promise.resolve(null);
    act(() => {
      a = hook.result.current.setFeatures('S1', { spyglass: false });
    });
    act(() => {
      b = hook.result.current.setFeatures('S1', { classes: false });
    });
    await act(async () => {
      answers[1]!(row({ features: { ...on, spyglass: false, classes: false } }));
      await b;
      answers[0]!(row({ features: { ...on, spyglass: false } }));
      await a;
    });
    expect(hook.result.current.sessions[0]?.features).toMatchObject({ spyglass: false, classes: false });
  });
});
