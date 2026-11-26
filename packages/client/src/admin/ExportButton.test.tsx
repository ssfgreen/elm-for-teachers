import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { createAdminApi } from '../api/admin';
import { ExportButton } from './ExportButton';

afterEach(() => {
  cleanup();
  setFetch(null);
  vi.restoreAllMocks();
});

describe('ExportButton', () => {
  it('fetches the zip with the admin password and saves it under the server filename', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Blob(['PK']), { status: 200, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="year-7-S1.zip"' } }),
    );
    setFetch(fetchMock as unknown as typeof fetch);
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:x';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    let downloaded: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });

    render(<ExportButton api={createAdminApi('pw')} sessionId="S1" label="Year 7" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download Year 7 as a .zip' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/sessions/S1/export', { method: 'GET', headers: { Authorization: 'Bearer pw' } });
    expect(created).toHaveLength(1);
    expect(downloaded).toBe('year-7-S1.zip');
    expect((screen.getByRole('button', { name: 'Download Year 7 as a .zip' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('spins its icon while the zip is prepared', async () => {
    let finish: (r: Response) => void = () => {};
    setFetch((() => new Promise<Response>((r) => (finish = r))) as unknown as typeof fetch);
    render(<ExportButton api={createAdminApi('pw')} sessionId="S1" label="Year 7" />);
    const button = screen.getByRole('button', { name: 'Download Year 7 as a .zip' });
    expect(button.className).not.toContain('animate-spin');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.className).toContain('motion-safe:*:animate-spin');
    await act(async () => {
      finish(new Response('nope', { status: 500 }));
    });
    expect(button.className).not.toContain('animate-spin');
  });

  it('shows the error when the export fails', async () => {
    setFetch((async () => new Response('session not found', { status: 404 })) as unknown as typeof fetch);
    render(<ExportButton api={createAdminApi('pw')} sessionId="nope" label="Year 7" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download Year 7 as a .zip' }));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/404/);
  });
});
