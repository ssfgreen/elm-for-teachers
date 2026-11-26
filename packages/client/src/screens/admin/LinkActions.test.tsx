import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';
import { AccessCodeCell } from './AccessCodeCell';
import type { CellContext } from './columns';
import { LinkActions } from './LinkActions';

const row = (over: Partial<AdminSessionRow> = {}): AdminSessionRow => ({
  session_id: 'S1', label: 'Year 7', participant_token: 't', participant_url: 'http://site/s/t', access: 'link', access_code: 'ABCD-EFGH-JKMN', link_closed_at: null,
  first_opened_at: null, last_opened_at: null, interactions_on: false, interactions_until: null, interactions_active: false,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
});

afterEach(cleanup);

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('LinkActions', () => {
  it('replaces the link after asking, and puts the new row in the list', async () => {
    const replaced = row({ participant_token: 't2', participant_url: 'http://site/s/t2', access_code: 'WXYZ-0123-4567' });
    const setLink = vi.fn(async () => replaced);
    const onChanged = vi.fn();
    render(<LinkActions api={{ setLink }} row={row()} onChanged={onChanged} />);
    await click('Replace the link for Year 7');
    expect(screen.getByText(/The old ones stop working at once/)).toBeTruthy();
    expect(screen.getByText(/stops saving, and loses what they type after that/)).toBeTruthy();
    expect(setLink).not.toHaveBeenCalled();
    await click('Replace');
    expect(setLink).toHaveBeenCalledWith('S1', 'replace');
    expect(onChanged).toHaveBeenCalledWith(replaced);
    expect(screen.getByRole('button', { name: 'Replace the link for Year 7' })).toBeTruthy();
  });

  it('closes the link after asking; Cancel does nothing', async () => {
    const closed = row({ participant_url: null, access_code: null, link_closed_at: '2026-11-13T10:00:00Z' });
    const setLink = vi.fn(async () => closed);
    const onChanged = vi.fn();
    render(<LinkActions api={{ setLink }} row={row()} onChanged={onChanged} />);
    await click('Close the link for Year 7');
    await click('Cancel');
    expect(setLink).not.toHaveBeenCalled();
    await click('Close the link for Year 7');
    expect(screen.getByText(/no new one is made/).textContent).toContain('stops saving, and loses what they type');
    await click('Close link');
    expect(setLink).toHaveBeenCalledWith('S1', 'close');
    expect(onChanged).toHaveBeenCalledWith(closed);
  });

  it('offers only a new link once closed, and says so where the code was', async () => {
    const closed = row({ participant_url: null, access_code: null, link_closed_at: '2026-11-13T10:00:00Z' });
    const setLink = vi.fn(async () => row());
    render(<LinkActions api={{ setLink }} row={closed} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Close the link for Year 7' })).toBeNull();
    await click('Make a new link for Year 7');
    await click('Make a new link');
    expect(setLink).toHaveBeenCalledWith('S1', 'replace');
    cleanup();
    const ctx: CellContext = { api: {} as AdminApi, list: { rename: vi.fn(), replace: vi.fn(), deleted: vi.fn(), setFeatures: vi.fn() } };
    render(<AccessCodeCell row={closed} ctx={ctx} />);
    expect(screen.getByText('Link closed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Make an access code/ })).toBeNull();
  });

  it('shows the error and keeps the question open', async () => {
    const setLink = vi.fn(async () => Promise.reject(new Error('API 500: boom')));
    render(<LinkActions api={{ setLink }} row={row()} onChanged={vi.fn()} />);
    await click('Replace the link for Year 7');
    await click('Replace');
    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy();
  });

  it('shows nothing for an account workspace', () => {
    const { container } = render(<LinkActions api={{ setLink: vi.fn() }} row={row({ access: 'account', participant_url: null, access_code: null })} onChanged={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
