import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { AccountMenu } from '../components/sidebar/AccountMenu';
import { DashboardLink } from '../components/sidebar/DashboardLink';
import { useSaveBeforeSignOut } from '../components/sidebar/accountContext';
import { DASHBOARD_PATH, signInNotice } from '../state/account';
import { AccountApp, SIGNED_OUT_PATH } from './AccountApp';

// The workspace itself is tested elsewhere: here it is the account menu, and something to save.
let save: () => Promise<void>;
vi.mock('./WorkspaceApp', () => ({
  plainScreenClass: 'plain',
  WorkspaceApp: ({ token }: { token: string }) => {
    useSaveBeforeSignOut(() => save());
    return (
      <div data-testid="workspace" data-token={token}>
        <DashboardLink />
        <AccountMenu name="Year 7" onDownloadData={async () => undefined} />
      </div>
    );
  },
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const empty = () => new Response(null, { status: 204 });

let account: { provider: string; email: string | null; display_name: string | null; notice_version: string | null; is_admin: boolean };
let calls: string[];
let routes: Record<string, () => Response | Promise<Response>>;
let leaveTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  account = { provider: 'test', email: 'teacher@example.org', display_name: 'A Teacher', notice_version: signInNotice.version, is_admin: false };
  calls = [];
  save = async () => void calls.push('save');
  leaveTo = vi.fn();
  routes = {
    'GET /api/account/workspace': () => json({ session_id: 'S1', token: 'tok-1', account }),
    'POST /api/account/notice': empty,
    'POST /api/auth/sign-out': empty,
  };
  setFetch((async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(init?.body ? `${key} ${String(init.body)}` : key);
    return (routes[key] ?? (() => json({ error: 'unexpected' }, 500)))();
  }) as unknown as typeof fetch);
});
afterEach(() => {
  cleanup();
  setFetch(null);
  vi.useRealTimers();
});

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/w']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/w" element={<AccountApp leaveTo={leaveTo} />} />
        <Route path="/signin" element={<p>the sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Account: Year 7' }));
  return within(screen.getByRole('menu', { name: 'Account' }));
}

describe('AccountApp (/w)', () => {
  it('sends someone who is not signed in to /signin', async () => {
    routes['GET /api/account/workspace'] = () => json({ error: 'sign-in required' }, 401);
    renderApp();
    expect(await screen.findByText('the sign-in page')).toBeTruthy();
  });

  it('opens the workspace with the token from the server', async () => {
    renderApp();
    expect((await screen.findByTestId('workspace')).dataset.token).toBe('tok-1');
    expect(screen.queryByRole('heading', { name: 'Before you start' })).toBeNull();
  });

  it('shows "Before you start" on a first visit, and the workspace once it is ticked', async () => {
    account.notice_version = null;
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Before you start' })).toBeTruthy();
    expect(screen.queryByTestId('workspace')).toBeNull();
    expect(screen.getByText(/reference number 541809\./)).toBeTruthy();

    // The information sheet opens in a new tab.
    const sheet = screen.getByRole('link', { name: /drive\.google\.com/ });
    expect(sheet.getAttribute('target')).toBe('_blank');
    expect(sheet.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: 'samuel.green@ed.ac.uk' }).getAttribute('href')).toBe('mailto:samuel.green@ed.ac.uk');

    const go = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: signInNotice.accept_label }));
    expect(go.disabled).toBe(false);
    fireEvent.click(go);

    expect(await screen.findByTestId('workspace')).toBeTruthy();
    expect(calls).toContain(`POST /api/account/notice ${JSON.stringify({ version: signInNotice.version })}`);
  });

  it('shows the notice again when its version has changed', async () => {
    account.notice_version = 'an-older-version';
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Before you start' })).toBeTruthy();
  });

  it('keeps the notice up, with a message, when the tick could not be saved', async () => {
    account.notice_version = null;
    routes['POST /api/account/notice'] = () => json({ error: 'no' }, 500);
    renderApp();
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be saved/);
    expect(screen.queryByTestId('workspace')).toBeNull();
  });

  it('has "Sign out" as the last item of the account menu, under the email', async () => {
    renderApp();
    const menu = await openMenu();
    expect(menu.getByText('teacher@example.org')).toBeTruthy();
    const items = [...screen.getByRole('menu', { name: 'Account' }).querySelectorAll('[role^="menuitem"]')];
    expect(items.length).toBeGreaterThan(2);
    expect(items.at(-1)?.textContent).toBe('Sign out');
  });

  it('signs out: saves pending work, then tells the server, then drops the token and leaves', async () => {
    let saved!: () => void;
    save = () => new Promise<void>((r) => (saved = r)).then(() => void calls.push('save'));
    renderApp();
    fireEvent.click((await openMenu()).getByRole('menuitem', { name: 'Sign out' }));

    // Waiting for the save: nothing has gone to the server yet, and the workspace is covered.
    expect((await screen.findByRole('status')).textContent).toMatch(/Saving your work/);
    // Inert, so the keyboard cannot reach the editor under the cover either.
    expect(screen.getByTestId('workspace').closest('[inert]')).not.toBeNull();
    expect(calls).not.toContain('POST /api/auth/sign-out');
    saved();

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(SIGNED_OUT_PATH));
    expect(calls.slice(-2)).toEqual(['save', 'POST /api/auth/sign-out']);
    expect(screen.queryByTestId('workspace')).toBeNull();
    expect(SIGNED_OUT_PATH).toBe('/signin?signed_out=1');
  });

  it('waits at most 5 s for a save that never finishes', async () => {
    renderApp();
    const menu = await openMenu();
    vi.useFakeTimers();
    save = () => new Promise<void>(() => undefined);
    fireEvent.click(menu.getByRole('menuitem', { name: 'Sign out' }));
    await act(() => vi.advanceTimersByTimeAsync(4900));
    expect(calls).not.toContain('POST /api/auth/sign-out');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(calls).toContain('POST /api/auth/sign-out');
    expect(leaveTo).toHaveBeenCalledWith(SIGNED_OUT_PATH);
  });

  it('stays in the workspace, with a message, when signing out fails', async () => {
    routes['POST /api/auth/sign-out'] = () => json({ error: 'no' }, 500);
    renderApp();
    fireEvent.click((await openMenu()).getByRole('menuitem', { name: 'Sign out' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Signing out did not work/);
    expect(screen.getByTestId('workspace')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('workspace').closest('[inert]')).toBeNull();
    expect(leaveTo).not.toHaveBeenCalled();
  });
});

describe('the Dashboard link (#79)', () => {
  it('shows only for an admin', async () => {
    renderApp();
    await screen.findByTestId('workspace');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    cleanup();
    account.is_admin = true;
    renderApp();
    expect((await screen.findByRole('link', { name: 'Dashboard' })).getAttribute('href')).toBe('/admin');
  });

  it('saves pending work first, then leaves for /admin with a full page load, without signing out', async () => {
    account.is_admin = true;
    let saved!: () => void;
    save = () => new Promise<void>((r) => (saved = r)).then(() => void calls.push('save'));
    renderApp();
    fireEvent.click(await screen.findByRole('link', { name: 'Dashboard' }));

    // Waiting for the save: covered, inert, and not gone yet.
    expect((await screen.findByRole('status')).textContent).toMatch(/Saving your work/);
    expect(screen.getByTestId('workspace').closest('[inert]')).not.toBeNull();
    expect(leaveTo).not.toHaveBeenCalled();
    saved();

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(DASHBOARD_PATH));
    expect(DASHBOARD_PATH).toBe('/admin');
    expect(calls).toContain('save');
    expect(calls).not.toContain('POST /api/auth/sign-out');
  });

  it('waits at most 5 s for a save that never finishes', async () => {
    account.is_admin = true;
    renderApp();
    const link = await screen.findByRole('link', { name: 'Dashboard' });
    vi.useFakeTimers();
    save = () => new Promise<void>(() => undefined);
    fireEvent.click(link);
    await act(() => vi.advanceTimersByTimeAsync(4900));
    expect(leaveTo).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(leaveTo).toHaveBeenCalledWith(DASHBOARD_PATH);
  });
});

describe('coming back from the browser\'s back-forward cache (#79 review)', () => {
  const pageshow = (persisted: boolean) => {
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: persisted });
    act(() => void window.dispatchEvent(e));
  };

  const renderWith = async (reload: () => void) => {
    account.is_admin = true;
    render(
      <MemoryRouter initialEntries={['/w']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AccountApp leaveTo={leaveTo} reload={reload} />
      </MemoryRouter>,
    );
    await screen.findByTestId('workspace');
  };

  it('does not reload a restore when the page was not left on purpose: the editor\'s unsent typing would be lost', async () => {
    const reload = vi.fn();
    await renderWith(reload);
    pageshow(false);
    pageshow(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads a restore after Dashboard, so a covered, inert workspace is not shown again', async () => {
    const reload = vi.fn();
    await renderWith(reload);
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(DASHBOARD_PATH));
    pageshow(false);
    expect(reload).not.toHaveBeenCalled();
    pageshow(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload after a sign-out that failed: the workspace is usable again', async () => {
    routes['POST /api/auth/sign-out'] = () => json({ error: 'no' }, 500);
    const reload = vi.fn();
    await renderWith(reload);
    fireEvent.click((await openMenu()).getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('alert');
    pageshow(true);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('the account menu in a workspace opened by link', () => {
  it('has no "Sign out"', () => {
    render(<AccountMenu name="Year 7" onDownloadData={async () => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account: Year 7' }));
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
  });
});
