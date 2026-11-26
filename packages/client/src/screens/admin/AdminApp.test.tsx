import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import type { AdminSessionRow } from '../../api/types';
import { AdminApp } from './AdminApp';

const row = (id: string, label: string): AdminSessionRow => ({
  session_id: id,
  label,
  participant_token: `tok-${id}`,
  participant_url: `http://site/s/tok-${id}`,
  access: 'link',
  access_code: null,
  first_opened_at: null,
  last_opened_at: null,
  interactions_on: false,
  interactions_until: null,
  interactions_active: false,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let rows: AdminSessionRow[];
let budget: number;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.setItem('edw.admin.password', 'pw');
  rows = [row('S1', 'Year 7')];
  budget = 60;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/admin/me') return json({ via: 'password' });
    if (url === '/api/admin/accounts') return json({ accounts: [] });
    if (url === '/api/admin/budgets') return json({ budgets: rows.map((r) => ({ session_id: r.session_id, spent_gbp: 12.4, budget_gbp: budget })) });
    if (url === '/api/admin/sessions/S1/budget/topup' && method === 'POST') return json({ budget: { session_id: 'S1', spent_gbp: 12.4, budget_gbp: (budget += 10) } });
    if (url === '/api/admin/invites' && method === 'GET') return json({ invites: [] });
    if (url === '/api/admin/sessions' && method === 'GET') return json({ sessions: rows });
    if (url === '/api/admin/sessions/S1' && method === 'DELETE') return json({ error: 'the only admin', code: 'last_admin' }, 409);
    if (url === '/api/admin/sessions' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { label: string };
      const s = row('S2', body.label);
      rows = [...rows, s];
      return json({ session: s, participant_url: s.participant_url });
    }
    if (url === '/api/admin/sessions/S1' && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as { label: string };
      const s = { ...row('S1', body.label) };
      rows = rows.map((r) => (r.session_id === 'S1' ? s : r));
      return json({ session: s, participant_url: s.participant_url });
    }
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  setFetch(null);
  sessionStorage.clear();
});

const renderAdmin = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <AdminApp />
      </MemoryRouter>,
    );
  });
};

describe('AdminApp', () => {
  it('lists workspaces with their columns and links', async () => {
    await renderAdmin();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Name', 'Access', 'Access code', 'Budget', 'Features', 'Created', 'First opened', 'Last opened', 'Interaction logging', 'Data']);
    const r = screen.getByText('Year 7').closest('tr')!;
    expect(within(r).getAllByText('Not yet')).toHaveLength(2);
    expect(within(r).getByRole('link', { name: 'Open Year 7 in a new tab' }).getAttribute('href')).toBe('http://site/s/tok-S1');
    expect(within(r).queryByRole('link', { name: 'Make kit' })).toBeNull();
    expect(within(r).getByRole('link', { name: 'Replay Year 7' }).getAttribute('href')).toBe('/admin/replay?session=S1');
    expect(within(r).queryByRole('button', { name: 'Copy kit link' })).toBeNull();
    expect(within(r).getByRole('button', { name: 'Delete Year 7' })).toBeTruthy();
  });

  it('shows each workspace’s spend of its budget, and adds £10 to it', async () => {
    await renderAdmin();
    const r = screen.getByText('Year 7').closest('tr')!;
    expect(within(r).getByText('£12.40 of £60')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(r).getByRole('button', { name: 'Add £10 to the budget for Year 7' }));
    });
    expect(within(r).getByText('£12.40 of £70')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/admin/sessions/S1/budget/topup')).toHaveLength(1);
  });

  it('creates a workspace, shows its link and adds it to the list', async () => {
    await renderAdmin();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: ' Year 8 ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ label: 'Year 8', study: true });
    expect(screen.getByText(/Link for Year 8/)).toBeTruthy();
    expect(screen.getAllByText('Year 8')).toHaveLength(1);
    expect(screen.getByText('http://site/s/tok-S2')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /Name/ }) as HTMLInputElement).value).toBe('');
  });

  it('shows a failed list as an error', async () => {
    const ok = fetchMock;
    setFetch((async (url: string, init?: RequestInit) => (url === '/api/admin/sessions' ? json({ error: 'boom' }, 500) : ok(url, init))) as unknown as typeof fetch);
    await renderAdmin();
    expect(screen.getByText(/boom/).className).toBe('text-destructive');
  });

  it('says plainly why the only admin’s workspace cannot be deleted', async () => {
    await renderAdmin();
    const r = screen.getByText('Year 7').closest('tr')!;
    fireEvent.click(within(r).getByRole('button', { name: 'Delete Year 7' }));
    fireEvent.change(within(r).getByRole('textbox', { name: 'Type DELETE to delete Year 7' }), { target: { value: 'DELETE' } });
    await act(async () => {
      fireEvent.click(within(r).getByRole('button', { name: 'Delete for good' }));
    });
    expect(within(r).getByRole('alert').textContent).toContain('This is the only admin’s workspace. Make another account admin first.');
    expect(screen.getByText('Year 7')).toBeTruthy();
  });
});
