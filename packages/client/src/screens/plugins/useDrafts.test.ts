import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginDraft } from '@edw/shared';
import { ApiError } from '../../api/http';
import type { SessionApi } from '../../api/participant';
import { takeAddDraftLink, takePendingDraft } from './draftLink';
import { ADD_FAILED, REMOVE_FAILED } from './drafts';
import { useDrafts } from './useDrafts';

const ADDRESS = 'https://studio.example/d/abc123XYZ';
const envelope = { client_ts: '2026-11-22T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const a: PluginDraft = { id: 'd-aaaaaaaa', name: 'Fractions helper', added_at: '2026-11-22T09:00:00.000Z' };
const b: PluginDraft = { id: 'd-bbbbbbbb', name: 'Spelling', added_at: '2026-11-22T10:00:00.000Z' };
const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'x', code }));

function draftsApi(over: Partial<SessionApi> = {}) {
  return {
    listPluginDrafts: vi.fn(async () => [a]),
    addPluginDraft: vi.fn(async () => b),
    removePluginDraft: vi.fn(async () => undefined),
    ...over,
  } as unknown as SessionApi;
}
const open = async (api: SessionApi) => {
  const r = renderHook(() => useDrafts(api, () => envelope));
  await waitFor(() => expect(r.result.current.status).not.toBe('loading'));
  return r;
};
const sendLink = () => {
  window.history.replaceState(null, '', `/w#add-draft=${encodeURIComponent(ADDRESS)}`);
  takeAddDraftLink();
};

afterEach(() => {
  takePendingDraft();
});

describe('useDrafts', () => {
  it('is off when the server has drafts off, or the api has no drafts calls', async () => {
    expect((await open(draftsApi({ listPluginDrafts: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) }))).result.current.status).toBe('off');
    expect((await open({} as SessionApi)).result.current.status).toBe('off');
  });

  it('says so when the list cannot be loaded', async () => {
    const { result } = await open(draftsApi({ listPluginDrafts: vi.fn(async () => Promise.reject(new Error('offline'))) }));
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toMatch(/could not be loaded/);
  });

  it('adds a pasted address, trimmed, with the envelope', async () => {
    const api = draftsApi();
    const { result } = await open(api);
    expect(result.current.drafts).toEqual([a]);
    let ok = false;
    await act(async () => {
      ok = await result.current.add(`  ${ADDRESS} `);
    });
    expect(ok).toBe(true);
    expect(api.addPluginDraft).toHaveBeenCalledWith(ADDRESS, envelope);
    expect(result.current.drafts).toEqual([a, b]);
    expect(result.current.error).toBeNull();
  });

  it('says when the draft was already added', async () => {
    const { result } = await open(draftsApi({ addPluginDraft: vi.fn(async () => a) }));
    await act(async () => {
      await result.current.add(ADDRESS);
    });
    expect(result.current.drafts).toEqual([a]);
    expect(result.current.notice).toMatch(/“Fractions helper” is already in this workspace/);
  });

  it.each([
    ['not_the_studio', 400, /only be added from the plugin studio/],
    ['not_a_draft', 400, /not a draft's address/],
    ['too_many_drafts', 409, /already has 20 drafts/],
  ])('explains a %s refusal', async (code, status, message) => {
    const { result } = await open(draftsApi({ addPluginDraft: vi.fn(async () => Promise.reject(refused(status, code))) }));
    let ok = true;
    await act(async () => {
      ok = await result.current.add(ADDRESS);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(message);
    expect(result.current.drafts).toEqual([a]);
  });

  it('goes off when the add hears drafts are off', async () => {
    const { result } = await open(draftsApi({ addPluginDraft: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) }));
    await act(async () => {
      await result.current.add(ADDRESS);
    });
    expect(result.current.status).toBe('off');
  });

  it('offers a draft from a link once, and adds it on Add', async () => {
    sendLink();
    const api = draftsApi();
    const { result } = await open(api);
    expect(result.current.offered).toBe(true);
    await act(async () => {
      await result.current.acceptOffer();
    });
    expect(api.addPluginDraft).toHaveBeenCalledWith(ADDRESS, envelope);
    expect(result.current.offered).toBe(false);
    expect(result.current.drafts).toEqual([a, b]);
    // A second screen does not offer it again.
    expect((await open(draftsApi())).result.current.offered).toBe(false);
  });

  it('drops the offer on Cancel without calling the server', async () => {
    sendLink();
    const api = draftsApi();
    const { result } = await open(api);
    act(() => result.current.declineOffer());
    expect(result.current.offered).toBe(false);
    expect(api.addPluginDraft).not.toHaveBeenCalled();
  });

  it('keeps the offer after a failure, and drops it after a refusal', async () => {
    sendLink();
    const add = vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(refused(400, 'not_the_studio'));
    const { result } = await open(draftsApi({ addPluginDraft: add }));
    await act(async () => {
      await result.current.acceptOffer();
    });
    expect(result.current.error).toBe(ADD_FAILED);
    expect(result.current.offered).toBe(true);
    await act(async () => {
      await result.current.acceptOffer();
    });
    expect(result.current.error).toMatch(/only be added from the plugin studio/);
    expect(result.current.offered).toBe(false);
  });

  it('drops a link when drafts are off, without offering it', async () => {
    sendLink();
    const { result } = await open(draftsApi({ listPluginDrafts: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) }));
    expect(result.current.offered).toBe(false);
    expect(result.current.linkOff).toBe(true);
    expect(takePendingDraft()).toBeNull();
  });

  it('says nothing about a link when drafts are off and none was waiting', async () => {
    const { result } = await open(draftsApi({ listPluginDrafts: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) }));
    expect(result.current.linkOff).toBe(false);
  });

  it('marks the link refused when drafts go off as it is added', async () => {
    sendLink();
    const { result } = await open(draftsApi({ addPluginDraft: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) }));
    await act(async () => {
      await result.current.acceptOffer();
    });
    expect(result.current.status).toBe('off');
    expect(result.current.linkOff).toBe(true);
  });

  it('removes a draft, and one already gone', async () => {
    const api = draftsApi({ listPluginDrafts: vi.fn(async () => [a, b]) });
    const { result } = await open(api);
    await act(async () => {
      await result.current.remove(a.id);
    });
    expect(api.removePluginDraft).toHaveBeenCalledWith(a.id, envelope);
    expect(result.current.drafts).toEqual([b]);
    vi.mocked(api.removePluginDraft!).mockRejectedValueOnce(refused(404, 'not_found'));
    await act(async () => {
      await result.current.remove(b.id);
    });
    expect(result.current.drafts).toEqual([]);
  });

  it('keeps a draft that could not be removed, and rejects with the message', async () => {
    const { result } = await open(draftsApi({ removePluginDraft: vi.fn(async () => Promise.reject(new Error('offline'))) }));
    await act(async () => {
      await expect(result.current.remove(a.id)).rejects.toThrow(REMOVE_FAILED);
    });
    expect(result.current.drafts).toEqual([a]);
  });
});
