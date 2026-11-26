import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginDraft } from '@edw/shared';
import { ApiError } from '../../api/http';
import type { SessionApi } from '../../api/participant';
import { takeAddDraftLink, takePendingDraft } from './draftLink';
import { PluginsScreen } from './PluginsScreen';

const ADDRESS = 'https://studio.example/d/abc123XYZ';
const envelope = { client_ts: '2026-11-22T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const a: PluginDraft = { id: 'd-aaaaaaaa', name: 'Fractions helper', added_at: '2026-11-22T09:00:00.000Z' };
const b: PluginDraft = { id: 'd-bbbbbbbb', name: 'Spelling', added_at: '2026-11-22T10:00:00.000Z' };
const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'x', code }));

function setup(over: Partial<SessionApi> = {}) {
  const api = {
    listPlugins: vi.fn(async () => []),
    listPluginDrafts: vi.fn(async () => [a]),
    addPluginDraft: vi.fn(async () => b),
    removePluginDraft: vi.fn(async () => undefined),
    ...over,
  } as unknown as SessionApi;
  render(<PluginsScreen api={api} getEnvelope={() => envelope} />);
  return api;
}
const drafts = async () => within(await screen.findByRole('list', { name: 'Drafts' }));
const paste = (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft address' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add draft' }));
};

afterEach(() => {
  cleanup();
  takePendingDraft();
});

describe('Plugins: studio drafts', () => {
  it('lists the drafts with a Draft badge', async () => {
    setup();
    const card = within((await drafts()).getByRole('listitem', { name: 'Fractions helper' }));
    expect(card.getByText('Draft')).toBeTruthy();
    expect(card.getByText('Added 22 Nov 2026')).toBeTruthy();
  });

  it('adds a pasted address and empties the field', async () => {
    const api = setup();
    await drafts();
    paste(ADDRESS);
    expect(await (await drafts()).findByRole('listitem', { name: 'Spelling' })).toBeTruthy();
    expect(api.addPluginDraft).toHaveBeenCalledWith(ADDRESS, envelope);
    expect(screen.getByRole('textbox', { name: 'Draft address' })).toHaveProperty('value', '');
  });

  it.each([
    ['not_the_studio', 400, /Drafts can only be added from the plugin studio/],
    ['not_a_draft', 400, /That is not a draft's address/],
    ['too_many_drafts', 409, /already has 20 drafts\. Remove one/],
  ])('says why a %s address was refused, and keeps what was typed', async (code, status, message) => {
    setup({ addPluginDraft: vi.fn(async () => Promise.reject(refused(status, code))) });
    await drafts();
    paste('https://elsewhere.example/d/abc123');
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
    expect(screen.getByRole('textbox', { name: 'Draft address' })).toHaveProperty('value', 'https://elsewhere.example/d/abc123');
  });

  it('offers the draft from an #add-draft= link, and adds it on Add', async () => {
    window.history.replaceState(null, '', `/w#add-draft=${encodeURIComponent(ADDRESS)}`);
    takeAddDraftLink();
    expect(window.location.hash).toBe('');
    const api = setup();
    const offer = within(await screen.findByRole('group', { name: 'Add a draft from the studio' }));
    expect(offer.queryByText(/studio\.example/)).toBeNull();
    fireEvent.click(offer.getByRole('button', { name: 'Add' }));
    expect(await (await drafts()).findByRole('listitem', { name: 'Spelling' })).toBeTruthy();
    expect(api.addPluginDraft).toHaveBeenCalledWith(ADDRESS, envelope);
    expect(screen.queryByRole('group', { name: 'Add a draft from the studio' })).toBeNull();
  });

  it('drops the offer on Cancel', async () => {
    window.history.replaceState(null, '', `/w#add-draft=${encodeURIComponent(ADDRESS)}`);
    takeAddDraftLink();
    const api = setup();
    fireEvent.click(within(await screen.findByRole('group', { name: 'Add a draft from the studio' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Add a draft from the studio' })).toBeNull();
    expect(api.addPluginDraft).not.toHaveBeenCalled();
  });

  it('removes a draft after asking, and Cancel keeps it', async () => {
    const api = setup();
    const card = within((await drafts()).getByRole('listitem', { name: 'Fractions helper' }));
    fireEvent.click(card.getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(card.getByRole('group', { name: 'Remove Fractions helper' })).getByRole('button', { name: 'Cancel' }));
    expect(api.removePluginDraft).not.toHaveBeenCalled();
    fireEvent.click(card.getByRole('button', { name: 'Remove' }));
    const ask = within(card.getByRole('group', { name: 'Remove Fractions helper' }));
    expect(ask.getByText('Remove this draft? The studio keeps it.')).toBeTruthy();
    fireEvent.click(ask.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Fractions helper' })).toBeNull());
    expect(api.removePluginDraft).toHaveBeenCalledWith(a.id, envelope);
  });

  it('says in place when a draft could not be removed', async () => {
    setup({ removePluginDraft: vi.fn(async () => Promise.reject(new Error('offline'))) });
    const card = within((await drafts()).getByRole('listitem', { name: 'Fractions helper' }));
    fireEvent.click(card.getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(card.getByRole('group', { name: 'Remove Fractions helper' })).getByRole('button', { name: 'Remove' }));
    expect(await card.findByText('It could not be removed.')).toBeTruthy();
  });

  it('shows nothing about drafts when the server has them off', async () => {
    const api = setup({ listPluginDrafts: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) });
    await waitFor(() => expect(api.listPluginDrafts).toHaveBeenCalled());
    await screen.findByText(/Nothing matches that/);
    await act(async () => undefined);
    expect(screen.queryByText(/draft/i)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Draft address' })).toBeNull();
  });

  it('says in one line that drafts are not set up here when a link arrives with them off', async () => {
    window.history.replaceState(null, '', `/w#add-draft=${encodeURIComponent(ADDRESS)}`);
    takeAddDraftLink();
    setup({ listPluginDrafts: vi.fn(async () => Promise.reject(refused(404, 'drafts_off'))) });
    expect((await screen.findByRole('status')).textContent).toBe('Drafts from the plugin studio are not set up here, so that draft cannot be added.');
    expect(screen.queryByRole('group', { name: 'Add a draft from the studio' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Draft address' })).toBeNull();
  });
});
