import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import type { SessionApi } from '../api/participant';
import type { EventContext } from '../events/logger';
import { createFocusPaneState } from '../events/trackers';
import { installEditorPolyfills, installIntersectionObserver, makeSession, mockLogger } from '../test-utils';
import { takeAddDraftLink, takePendingDraft } from './plugins/draftLink';
import { WorkspaceScreen } from './WorkspaceScreen';
import { baseSnap, baseThreads, mockApi } from './workspaceTestKit';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
afterEach(() => {
  cleanup();
  takePendingDraft();
});

/** `on`: the server has drafts on; `off`: it answers 404 drafts_off. */
function renderWith(drafts: 'on' | 'off') {
  const off = new ApiError(404, JSON.stringify({ error: 'plugin drafts are not set up on this server', code: 'drafts_off' }));
  const api = {
    ...mockApi(baseSnap(), baseThreads()),
    listPlugins: vi.fn(async () => []),
    listPluginDrafts: drafts === 'on' ? vi.fn(async () => []) : vi.fn(async () => Promise.reject(off)),
    addPluginDraft: vi.fn(),
    removePluginDraft: vi.fn(),
  } as unknown as SessionApi;
  const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
  render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={context} />);
}

describe('the studio link in the workspace', () => {
  it('opens the Plugins screen, which offers the draft', async () => {
    window.history.replaceState(null, '', '/w#add-draft=https%3A%2F%2Fstudio.example%2Fd%2Fabc123XYZ');
    takeAddDraftLink();
    renderWith('on');
    expect(await screen.findByRole('group', { name: 'Add a draft from the studio' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Plugins' })).toBeTruthy();
  });

  it('opens the Plugins screen and says drafts are not set up, when the server has them off', async () => {
    window.history.replaceState(null, '', '/w#add-draft=https%3A%2F%2Fstudio.example%2Fd%2Fabc123XYZ');
    takeAddDraftLink();
    renderWith('off');
    expect(await screen.findByText('Drafts from the plugin studio are not set up here, so that draft cannot be added.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Plugins' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Add a draft from the studio' })).toBeNull();
    expect(takePendingDraft()).toBeNull();
  });

  it('opens the editor as usual without a link', async () => {
    renderWith('on');
    await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
    expect(screen.queryByRole('heading', { name: 'Plugins' })).toBeNull();
  });
});
