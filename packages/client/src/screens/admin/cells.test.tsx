import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccount, AdminApi } from '../../api/admin';
import { ApiError } from '../../api/http';
import type { AdminSessionRow } from '../../api/types';
import { AccessCell } from './AccessCell';
import { AccessCodeCell } from './AccessCodeCell';
import { DataCell, deleteWithMessages, LAST_ADMIN_MESSAGE } from './ActionsCell';
import type { CellContext } from './columns';

const row = (over: Partial<AdminSessionRow> = {}): AdminSessionRow => ({
  session_id: 'S1', label: 'Year 7', participant_token: 't', participant_url: 'http://site/s/t', access: 'link', access_code: null,
  first_opened_at: null, last_opened_at: null, interactions_on: false, interactions_until: null, interactions_active: false,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
});
const ann: AdminAccount = { id: 'A', name: 'Ann Teacher', email: 'ann@school.example', provider: 'microsoft', admin: false, workspace: { session_id: 'S1', label: 'Year 7' } };

const ctx = (over: Partial<CellContext> = {}): CellContext => ({
  api: {} as AdminApi,
  list: { rename: vi.fn(), replace: vi.fn(), deleted: vi.fn(), setFeatures: vi.fn() },
  ...over,
});

afterEach(cleanup);

describe('AccessCell', () => {
  it('names who signs in to an account workspace', () => {
    render(<AccessCell row={row({ access: 'account', participant_url: null })} ctx={ctx({ accounts: new Map([['S1', ann]]) })} />);
    expect(screen.getByText('Signed in with Microsoft')).toBeTruthy();
    expect(screen.getByText('Ann Teacher')).toBeTruthy();
    expect(screen.getByText('ann@school.example')).toBeTruthy();
  });

  it('offers a link workspace’s link to copy, open, replace and close, in that order', () => {
    render(<AccessCell row={row()} ctx={ctx()} />);
    const named = [...document.querySelectorAll('button, a')].map((e) => e.getAttribute('aria-label'));
    expect(named).toEqual(['Copy the link for Year 7', 'Open Year 7 in a new tab', 'Replace the link for Year 7', 'Close the link for Year 7']);
    const open = screen.getByRole('link', { name: 'Open Year 7 in a new tab' });
    expect(open.getAttribute('href')).toBe('http://site/s/t');
    expect(open.getAttribute('target')).toBe('_blank');
  });

  it('offers only a new link once the link is closed', () => {
    render(<AccessCell row={row({ participant_url: null, link_closed_at: '2026-11-13T10:00:00Z' })} ctx={ctx()} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Make a new link for Year 7']);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('AccessCodeCell', () => {
  it('shows and copies a code', () => {
    render(<AccessCodeCell row={row({ access_code: 'ABCD-EFGH-JKMN' })} ctx={ctx()} />);
    expect(screen.queryByText('ABCD-EFGH-JKMN')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the access code for Year 7' }));
    expect(screen.getByText('ABCD-EFGH-JKMN')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy the access code for Year 7' })).toBeTruthy();
  });

  it('makes one for an older workspace and puts the new row in the list', async () => {
    const updated = row({ access_code: 'WXYZ-0123-4567' });
    const newAccessCode = vi.fn(async () => updated);
    const c = ctx({ api: { newAccessCode } as unknown as AdminApi });
    render(<AccessCodeCell row={row()} ctx={c} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make an access code for Year 7' }));
    });
    expect(newAccessCode).toHaveBeenCalledWith('S1');
    expect(c.list.replace).toHaveBeenCalledWith(updated);
  });

  it('shows nothing for an account workspace', () => {
    const { container } = render(<AccessCodeCell row={row({ access: 'account', participant_url: null })} ctx={ctx()} />);
    expect(container.textContent).toBe('');
  });
});

describe('the icon buttons', () => {
  it('each name the action and the workspace, have a tooltip and an icon, and are 24px', () => {
    render(
      <MemoryRouter>
        <AccessCell row={row({ access_code: 'ABCD-EFGH-JKMN' })} ctx={ctx()} />
        <AccessCodeCell row={row({ access_code: 'ABCD-EFGH-JKMN' })} ctx={ctx()} />
        <DataCell row={row()} ctx={ctx()} />
      </MemoryRouter>,
    );
    const icons = [...document.querySelectorAll('button, a')];
    expect(icons.map((e) => e.getAttribute('aria-label'))).toEqual([
      'Copy the link for Year 7',
      'Open Year 7 in a new tab',
      'Replace the link for Year 7',
      'Close the link for Year 7',
      'Show the access code for Year 7',
      'Copy the access code for Year 7',
      'Replay Year 7',
      'Download Year 7 as a .zip',
      'Delete Year 7',
    ]);
    for (const e of icons) {
      expect(e.getAttribute('title')).toBeTruthy();
      expect(e.querySelector('svg')).toBeTruthy();
      expect(e.className).toContain('size-6');
      expect(e.className).toContain('focus-visible:ring-3');
    }
    expect(screen.getByRole('link', { name: 'Replay Year 7' }).getAttribute('href')).toBe('/admin/replay?session=S1');
    // A link never matches `:enabled`, so the links carry the hover plainly.
    for (const a of screen.getAllByRole('link')) expect(a.className.split(' ')).toContain('hover:bg-hover');
  });
});

describe('Delete on the only admin’s workspace', () => {
  it('turns 409 last_admin into a plain message', async () => {
    const api = deleteWithMessages({
      deleteSession: async () => {
        throw new ApiError(409, JSON.stringify({ error: 'conflict', code: 'last_admin' }));
      },
    });
    await expect(api.deleteSession('S1')).rejects.toThrow(LAST_ADMIN_MESSAGE);
  });

  it('leaves other errors as they were', async () => {
    const err = new ApiError(500, 'boom');
    const api = deleteWithMessages({ deleteSession: async () => Promise.reject(err) });
    await expect(api.deleteSession('S1')).rejects.toBe(err);
  });
});
