import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Doc } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import { SendToStudentsDialog } from './SendToStudentsDialog';

afterEach(cleanup);

const doc: Doc = {
  id: '01JDOC00000000000000000001',
  session_id: 'S1',
  thread_id: '01JTHR00000000000000000001',
  name: 'Water cycle',
  created_by: 'teacher',
  created_at: '2026-11-26T10:00:00.000Z',
};

const envelope = (): Envelope => ({ client_ts: '2026-11-26T10:00:00.000Z', focus_pane: 'canvas', doc_id: doc.id, thread_id: doc.thread_id });

describe('SendToStudentsDialog', () => {
  it('creates a Content Pack v1 link, shows the import URL, and revokes active links', async () => {
    const packId = '01JPK000000000000000000001';
    const created = {
      pack_id: packId,
      content_hash: 'sha256:abc',
      download_url: 'https://teachers.example/api/packs/secret',
      import_url: 'https://students.example/import?pack=https%3A%2F%2Fteachers.example%2Fapi%2Fpacks%2Fsecret',
      expires_at: '2026-12-03T10:00:00.000Z',
      pack: {
        id: packId,
        doc_id: doc.id,
        kind: 'worksheet' as const,
        title: doc.name,
        format_version: '1',
        content_hash: 'sha256:abc',
        bytes: 1200,
        created_at: '2026-11-26T10:00:00.000Z',
        expires_at: '2026-12-03T10:00:00.000Z',
        revoked_at: null,
      },
    };
    const api = {
      listContentPacks: vi.fn(async () => []),
      createContentPack: vi.fn(async () => created),
      revokeContentPack: vi.fn(async () => undefined),
    } as unknown as SessionApi;

    render(<SendToStudentsDialog doc={doc} api={api} getEnvelope={envelope} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Worksheet'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });

    expect(api.createContentPack).toHaveBeenCalledWith(doc.id, { kind: 'worksheet', title: 'Water cycle' }, envelope());
    const input = (await screen.findByLabelText('Content pack import link')) as HTMLInputElement;
    expect(input.value).toBe(created.import_url);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    });
    expect(api.revokeContentPack).toHaveBeenCalledWith(packId);
    await waitFor(() => expect(screen.queryByLabelText('Content pack import link')).toBeNull());
  });
});
