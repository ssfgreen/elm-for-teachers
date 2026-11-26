import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { PupilLoginScreen } from './LoginScreen';

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function server(opts: { signedIn?: boolean; off?: boolean; login?: () => Response } = {}) {
  const posted: Record<string, unknown>[] = [];
  setFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (opts.off) return json({ error: 'pupil sign-in is switched off', code: 'pupils_off' }, 403);
      if (url === '/api/pupil/providers') return json({ providers: [{ id: 'google', label: 'Google', kind: 'oidc' }] });
      if (url === '/api/pupil/me') return opts.signedIn ? json({ pupil: { provider: 'login' }, classes: [] }) : json({ error: 'pupil sign-in required' }, 401);
      if (url === '/api/pupil/login') {
        posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return opts.login ? opts.login() : json(null, 204);
      }
      return json({ error: 'unexpected' }, 500);
    }) as unknown as typeof fetch,
  );
  return posted;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

const show = async (at = '/r/login') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/r/login" element={<PupilLoginScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

const logIn = async (username: string, password: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  });
};

afterEach(() => {
  cleanup();
  setFetch(null);
});

describe('/r/login', () => {
  it('"Log in": providers with no code, and links to sign up and to the teacher page', async () => {
    server();
    await show();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Log in');
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toBe('/api/pupil/auth/google/start');
    expect(screen.getByRole('link', { name: 'Sign up with your class code' }).getAttribute('href')).toBe('/r/join');
    expect(screen.getByRole('link', { name: 'Log in on the teacher page' }).getAttribute('href')).toBe('/signin');
  });

  it('posts username and password with no code key, then goes to /r', async () => {
    const posted = server();
    await show();
    await logIn('fox-12', 'river-pear');
    expect(posted).toEqual([{ username: 'fox-12', password: 'river-pear' }]);
    expect('code' in posted[0]!).toBe(false);
    expect(screen.getByTestId('where').textContent).toBe('/r');
  });

  it('never puts the username or password in an attribute, typed or refused', async () => {
    server({ login: () => json({ error: 'no', code: 'login_wrong' }, 401) });
    await show();
    const attrs = () => [...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.value)).join(' ');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'fox-12' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'river-pear' } });
    });
    expect(attrs()).not.toMatch(/fox-12|river-pear/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    });
    expect(attrs()).not.toMatch(/fox-12|river-pear/);
  });

  it('a wrong password: says so, clears the password, keeps the username', async () => {
    server({ login: () => json({ error: 'no', code: 'login_wrong' }, 401) });
    await show();
    await logIn('fox-12', 'nope');
    expect(screen.getByRole('alert').textContent).toBe('That username and password do not match. Check your slip and try again.');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('fox-12');
  });

  it('"You have signed out." after Sign out, and why the last try failed', async () => {
    server();
    await show('/r/login?signed_out=1');
    expect(screen.getByRole('status').textContent).toBe('You have signed out.');
    cleanup();
    await show('/r/login?error=cancelled');
    expect(screen.getByRole('alert').textContent).toMatch(/cancelled/);
  });

  it('a refusal of the form replaces the last try\'s reason: one alert at a time', async () => {
    server({ login: () => json({ error: 'no', code: 'login_wrong' }, 401) });
    await show('/r/login?error=cancelled');
    await logIn('fox-12', 'nope');
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['That username and password do not match. Check your slip and try again.']);
  });

  it('with pupil sign-in off: says so and offers nothing', async () => {
    server({ off: true });
    await show();
    expect(screen.getByText('Pupil sign-in is switched off here.')).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });

  it('sends a pupil already signed in on to /r', async () => {
    server({ signedIn: true });
    await show();
    expect(screen.getByTestId('where').textContent).toBe('/r');
  });
});
