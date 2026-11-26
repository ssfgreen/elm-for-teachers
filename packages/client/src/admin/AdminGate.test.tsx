import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { AdminGate } from './AdminGate';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The server: who is signed in (`me`: null for a 401), whether the password is taken, the account, the providers. */
function server(opts: { me?: unknown; password?: boolean; account?: { is_admin: boolean } | null; acceptPassword?: string }) {
  const calls: { url: string; auth: string | null }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    calls.push({ url, auth });
    if (url === '/api/admin/me') {
      if (opts.acceptPassword && auth === `Bearer ${opts.acceptPassword}`) return json({ via: 'password' });
      if (opts.me) return json(opts.me);
      return json({ error: 'admin sign-in required', password: opts.password ?? false }, 401);
    }
    if (url === '/api/account/workspace') return opts.account ? json({ session_id: 'W', token: 't', account: opts.account }) : json({ error: 'sign in' }, 401);
    if (url === '/api/auth/providers') return json({ providers: [{ id: 'microsoft', label: 'Microsoft', kind: 'oidc' }] });
    if (url === '/api/auth/sign-out') return new Response(null, { status: 204 });
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(f as unknown as typeof fetch);
  return calls;
}

const show = async () => {
  await act(async () => {
    render(<AdminGate>{(_api, me, signOut) => <button onClick={signOut}>Inside as {me.via}</button>}</AdminGate>);
  });
};

afterEach(() => {
  cleanup();
  setFetch(null);
  sessionStorage.clear();
});

describe('AdminGate', () => {
  it('lets a signed-in admin straight in', async () => {
    server({ me: { via: 'account', account: { id: 'A', name: 'Ann', email: null, provider: 'microsoft' } } });
    await show();
    expect(screen.getByText('Inside as account')).toBeTruthy();
  });

  it('signed out in production: the sign-in buttons and no password form', async () => {
    server({ password: false });
    await show();
    expect(screen.getByRole('link', { name: 'Sign in with Microsoft' }).getAttribute('href')).toBe('/api/auth/microsoft/start?then=admin');
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('signed out locally: the password form as well, and a right password lets the admin in', async () => {
    server({ password: true, acceptPassword: 'pw' });
    await show();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });
    expect(screen.getByText('Inside as password')).toBeTruthy();
    expect(sessionStorage.getItem('edw.admin.password')).toBe('pw');
  });

  it('a password kept for this tab (from /signin) opens it with no prompt and one call', async () => {
    sessionStorage.setItem('edw.admin.password', 'pw');
    const calls = server({ password: true, acceptPassword: 'pw' });
    await show();
    expect(screen.getByText('Inside as password')).toBeTruthy();
    expect(calls).toEqual([{ url: '/api/admin/me', auth: 'Bearer pw' }]);
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('forgets a stored password the server turns down', async () => {
    sessionStorage.setItem('edw.admin.password', 'old');
    const calls = server({ password: true });
    await show();
    expect(calls[0]).toEqual({ url: '/api/admin/me', auth: 'Bearer old' });
    expect(sessionStorage.getItem('edw.admin.password')).toBeNull();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('a signed-in teacher who is not an admin is told so', async () => {
    server({ account: { is_admin: false } });
    await show();
    expect(screen.getByText('This account cannot open the admin pages.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Sign in with/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Your workspace' }).getAttribute('href')).toBe('/w');
  });

  it('an admin whose admin sign-in is too old is asked to sign in again', async () => {
    server({ account: { is_admin: true } });
    await show();
    expect(screen.getByText(/Sign in again/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in with Microsoft' })).toBeTruthy();
  });

  it('signing out of a password session forgets the password', async () => {
    sessionStorage.setItem('edw.admin.password', 'pw');
    server({ password: true, acceptPassword: 'pw' });
    await show();
    await act(async () => {
      fireEvent.click(screen.getByText('Inside as password'));
    });
    expect(sessionStorage.getItem('edw.admin.password')).toBeNull();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('leaves the admin screen at once on sign-out, before the server answers', async () => {
    server({ me: { via: 'account', account: { id: 'A', name: 'Ann', email: null, provider: 'microsoft' } } });
    await show();
    act(() => {
      fireEvent.click(screen.getByText('Inside as account'));
    });
    expect(screen.queryByText('Inside as account')).toBeNull();
    await act(async () => {});
  });

  it('where the password works, a signed-in teacher who is not an admin can still use it', async () => {
    server({ account: { is_admin: false }, password: true });
    await show();
    expect(screen.getByText('This account cannot open the admin pages.')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
