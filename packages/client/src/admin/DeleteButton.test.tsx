import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { createAdminApi } from '../api/admin';
import { DeleteButton } from './DeleteButton';

afterEach(() => {
  cleanup();
  setFetch(null);
});

describe('DeleteButton', () => {
  it('keeps Delete for good off until the box holds exactly DELETE, then deletes with the admin password', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    setFetch(fetchMock as unknown as typeof fetch);
    const onDeleted = vi.fn();
    render(<DeleteButton api={createAdminApi('pw')} sessionId="S1" label="Year 7" onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Year 7' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete “Year 7” and all its data/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/all its data/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Year 7' }));
    const box = screen.getByRole('textbox', { name: 'Type DELETE to delete Year 7' });
    const confirm = () => screen.getByRole('button', { name: 'Delete for good' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    for (const wrong of ['delete', 'DELET', 'DELETE ', ' DELETE', 'Year 7']) {
      fireEvent.change(box, { target: { value: wrong } });
      expect(confirm().disabled).toBe(true);
      await act(async () => {
        fireEvent.submit(box.closest('form')!);
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'DELETE' } });
    expect(confirm().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirm());
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/sessions/S1', expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer pw' }) }));
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it('shows a failure and keeps the workspace', async () => {
    setFetch((async () => new Response('{"error":"boom"}', { status: 500 })) as unknown as typeof fetch);
    const onDeleted = vi.fn();
    render(<DeleteButton api={createAdminApi('pw')} sessionId="S1" label="Year 7" onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Year 7' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Type DELETE to delete Year 7' }), { target: { value: 'DELETE' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('Delete failed');
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('forgets what was typed on Cancel', () => {
    render(<DeleteButton api={{ deleteSession: vi.fn() }} sessionId="S1" label="Year 7" onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Year 7' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Year 7' }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Delete for good' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
