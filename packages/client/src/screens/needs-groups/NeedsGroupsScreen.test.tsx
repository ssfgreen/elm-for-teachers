import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NeedsGroupSummary } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { NeedsGroupsScreen } from './NeedsGroupsScreen';

afterEach(cleanup);

const envelope = (): Envelope => ({ client_ts: '2026-11-26T10:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null });

const sampleGroup = (over: Partial<NeedsGroupSummary> = {}): NeedsGroupSummary => ({
  id: '01JNG000000000000000000001',
  session_id: 'S1',
  name: 'Dyslexia group',
  description: 'Decoding support',
  what_helps: 'Chunked tasks and word banks',
  position: 0,
  class_ids: [],
  adaptations: [],
  created_at: '2026-11-26T10:00:00.000Z',
  updated_at: '2026-11-26T10:00:00.000Z',
  archived_at: null,
  ...over,
});

describe('NeedsGroupsScreen', () => {
  it('lists needs groups, creates a new group, starts a chat, and archives one', async () => {
    const existing = sampleGroup();
    const created = sampleGroup({ id: '01JNG000000000000000000002', name: 'EAL group', description: null, what_helps: 'Visual glossary' });
    const api = {
      listNeedsGroups: vi.fn(async () => [existing]),
      createNeedsGroup: vi.fn(async () => created),
      archiveNeedsGroup: vi.fn(async () => ({ ...existing, archived_at: '2026-11-26T11:00:00.000Z' })),
    } as unknown as SessionApi;
    const onStartChat = vi.fn();

    render(<NeedsGroupsScreen api={api} getEnvelope={envelope} classes={[]} onStartChat={onStartChat} />);
    await waitFor(() => expect(screen.getByText('Dyslexia group')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    expect(onStartChat).toHaveBeenCalledWith({ needs_group_id: existing.id });

    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'EAL group' } });
    fireEvent.change(screen.getByLabelText('What helps (optional)'), { target: { value: 'Visual glossary' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add needs group' }));
    });
    expect(api.createNeedsGroup).toHaveBeenCalledWith({ name: 'EAL group', description: null, what_helps: 'Visual glossary' }, envelope());
    expect(screen.getByText('EAL group')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Archive' })[0]!);
    });
    expect(api.archiveNeedsGroup).toHaveBeenCalledWith(existing.id, envelope());
    expect(screen.queryByText('Dyslexia group')).toBeNull();
  });
});
