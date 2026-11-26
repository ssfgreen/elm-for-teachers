import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccount } from '../../api/admin';
import { ApiError } from '../../api/http';
import { AdminsPanel } from './AdminsPanel';

const account = (id: string, name: string, admin: boolean): AdminAccount => ({
  id, name, email: `${id}@school.example`, provider: 'microsoft', admin, workspace: { session_id: `S-${id}`, label: `${name}'s workspace` },
});

afterEach(cleanup);

describe('AdminsPanel', () => {
  it('lists each account with its name, email and an Admin switch', () => {
    render(<AdminsPanel api={{ setAdmin: vi.fn() }} accounts={[account('a', 'Ann', true), account('b', 'Bea', false)]} meId="a" onChanged={vi.fn()} />);
    expect(screen.getByText('a@school.example')).toBeTruthy();
    expect(screen.getByText('(you)')).toBeTruthy();
    expect((screen.getByRole('switch', { name: 'Admin: Ann' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('switch', { name: 'Admin: Bea' }) as HTMLInputElement).checked).toBe(false);
  });

  it('turns admin on, then reloads the accounts', async () => {
    const setAdmin = vi.fn(async () => undefined);
    const onChanged = vi.fn();
    render(<AdminsPanel api={{ setAdmin }} accounts={[account('b', 'Bea', false)]} meId={null} onChanged={onChanged} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Admin: Bea' }));
    });
    expect(setAdmin).toHaveBeenCalledWith('b', true);
    expect(onChanged).toHaveBeenCalled();
  });

  it('says plainly when the last admin cannot be removed', async () => {
    const setAdmin = vi.fn(async () => {
      throw new ApiError(409, JSON.stringify({ error: 'the last admin cannot be removed', code: 'last_admin' }));
    });
    render(<AdminsPanel api={{ setAdmin }} accounts={[account('a', 'Ann', true)]} meId="a" onChanged={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Admin: Ann' }));
    });
    expect(screen.getByRole('alert').textContent).toBe('This is the only admin. Make another account admin first.');
  });
});
