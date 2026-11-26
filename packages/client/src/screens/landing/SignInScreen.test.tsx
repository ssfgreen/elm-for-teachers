import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { SignInScreen } from './SignInScreen';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The server: its providers, whether it takes the admin password, and which password is right. */
function server(opts: { providers?: { id: string; label: string; kind: string }[]; password: boolean; right?: string }) {
  const calls: { url: string; auth: string | null }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    calls.push({ url, auth });
    if (url === '/api/auth/providers') return json({ providers: opts.providers ?? [] });
    if (url === '/api/admin/me') {
      if (opts.right && auth === `Bearer ${opts.right}`) return json({ via: 'password' });
      return json({ error: 'admin sign-in required', password: opts.password }, 401);
    }
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(f as unknown as typeof fetch);
  return calls;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

const show = async () => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/signin']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

const signIn = async (username: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  });
};

afterEach(() => {
  cleanup();
  setFetch(null);
  sessionStorage.clear();
});

describe('/signin', () => {
  it('is headed "Log in" (#245, answer 117), for teachers and admins', async () => {
    server({ providers: [{ id: 'google', label: 'Google', kind: 'oidc' }], password: false });
    await show();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Log in');
    expect(screen.getByText('Teachers and admins both log in here.')).toBeTruthy();
  });
});

describe('/signin with the admin password', () => {
  it('in production, where the password is refused: the provider buttons only', async () => {
    server({ providers: [{ id: 'google', label: 'Google', kind: 'oidc' }], password: false });
    await show();
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('in production with no provider: says sign-in is not set up', async () => {
    server({ password: false });
    await show();
    expect(screen.getByText('Sign-in is not set up here yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('where the password works: username and password under the provider buttons', async () => {
    server({ providers: [{ id: 'google', label: 'Google', kind: 'oidc' }], password: true });
    await show();
    const button = screen.getByRole('link', { name: 'Continue with Google' });
    const username = screen.getByLabelText('Username');
    expect(button.compareDocumentPosition(username) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password');
  });

  it('where the password works and no provider is set up: the fields, not "not set up"', async () => {
    server({ password: true });
    await show();
    expect(screen.getByLabelText('Username')).toBeTruthy();
    expect(screen.queryByText('Sign-in is not set up here yet.')).toBeNull();
  });

  it('"admin" (any case, spaces trimmed) and the right password: on to /admin, kept for the tab', async () => {
    server({ password: true, right: 'pw' });
    await show();
    await signIn('  Admin ', 'pw');
    expect(screen.getByTestId('where').textContent).toBe('/admin');
    expect(sessionStorage.getItem('edw.admin.password')).toBe('pw');
    expect(localStorage.getItem('edw.admin.password')).toBeNull();
  });

  it('a wrong password: one message that does not say which was wrong', async () => {
    server({ password: true, right: 'pw' });
    await show();
    await signIn('admin', 'nope');
    expect(screen.getByText('That username or password is not right.')).toBeTruthy();
    expect(screen.queryByTestId('where')).toBeNull();
    expect(sessionStorage.getItem('edw.admin.password')).toBeNull();
  });

  it('a wrong username: the same message, and the password is not sent', async () => {
    const calls = server({ password: true, right: 'pw' });
    await show();
    await signIn('teacher', 'pw');
    expect(screen.getByText('That username or password is not right.')).toBeTruthy();
    expect(calls.some((c) => c.auth === 'Bearer pw')).toBe(false);
    expect(sessionStorage.getItem('edw.admin.password')).toBeNull();
  });
});
