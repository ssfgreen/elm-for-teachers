import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminInvite } from '../../api/admin';
import { InvitesPanel } from './InvitesPanel';

const invite = (id: string, label: string, status: AdminInvite['status']): AdminInvite => ({
  id, label, email: null, status,
  created_at: '2026-11-01T10:00:00Z', expires_at: '2026-11-15T10:00:00Z',
  used_at: status === 'used' ? '2026-11-02T10:00:00Z' : null, session_id: status === 'used' ? 'S9' : null,
});

afterEach(cleanup);

function setUp(start: AdminInvite[]) {
  let invites = start;
  const api = {
    listInvites: vi.fn(async () => invites),
    createInvite: vi.fn(async (label: string, email: string | null) => {
      const i = { ...invite('NEW', label, 'open'), email };
      invites = [i, ...invites];
      return { invite: i, code: 'ABCD-EFGH-JKMN' };
    }),
    deleteInvite: vi.fn(async (id: string) => {
      invites = invites.filter((i) => i.id !== id);
    }),
  };
  return api;
}

const show = async (api: ReturnType<typeof setUp>) => {
  await act(async () => {
    render(<InvitesPanel api={api} />);
  });
};

describe('InvitesPanel', () => {
  it('makes an invite and shows its code and /join link once', async () => {
    const api = setUp([]);
    await show(api);
    expect(screen.getByText(/kept with the research data/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: ' Teacher A ' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@school.example' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make' }));
    });
    expect(api.createInvite).toHaveBeenCalledWith('Teacher A', 'a@school.example');
    const made = screen.getByRole('status');
    expect(within(made).getByText('ABCD-EFGH-JKMN')).toBeTruthy();
    expect(within(made).getByText(`${window.location.origin}/join/ABCD-EFGH-JKMN`)).toBeTruthy();
    expect((screen.getByLabelText(/Label/) as HTMLInputElement).value).toBe('');
    // In the list now, without its code.
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('a@school.example'))!;
    expect(within(row).getByText('Open')).toBeTruthy();
  });

  it('sends no email when none is given', async () => {
    const api = setUp([]);
    await show(api);
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Teacher B' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make' }));
    });
    expect(api.createInvite).toHaveBeenCalledWith('Teacher B', null);
  });

  it('lists invites with their status; only an open one can be deleted', async () => {
    const api = setUp([invite('I1', 'Open one', 'open'), invite('I2', 'Used one', 'used'), invite('I3', 'Old one', 'expired')]);
    await show(api);
    expect(screen.getByText('Used')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete the invite for Used one' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete the invite for Old one' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete the invite for Open one' }));
    });
    expect(api.deleteInvite).toHaveBeenCalledWith('I1');
    expect(screen.queryByText('Open one')).toBeNull();
  });
});
