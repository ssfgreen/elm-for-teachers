import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { JoinScreen } from './JoinScreen';
import { LandingScreen } from './LandingScreen';
import { SignInScreen } from './SignInScreen';
import { StartScreen } from './StartScreen';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let providers: { id: string; label: string; kind: string }[];
let account: { is_admin: boolean } | null;
let accessStatus: number;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  providers = [
    { id: 'google', label: 'Google', kind: 'oidc' },
    { id: 'microsoft', label: 'Microsoft', kind: 'oidc' },
  ];
  account = null;
  accessStatus = 200;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/providers') return json({ providers });
    if (url === '/api/account/workspace') return account ? json({ session_id: 'S1', token: 't', account: account }) : json({ error: 'sign in' }, 401);
    if (url === '/api/access' && init?.method === 'POST') {
      return accessStatus === 200 ? json({ session_id: 'S1', token: 'tok-1' }) : json({ code: 'code_unknown' }, accessStatus);
    }
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  setFetch(null);
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

const renderAt = async (path: string) => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/start" element={<StartScreen />} />
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="/join/:code" element={<JoinScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

describe('/', () => {
  it('shows the name, the strapline and one action, Sign up, with no code fields (#224)', async () => {
    await renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('ELM for teachers');
    expect(screen.getByText('An agentic harness designed specifically for teachers, with teachers.')).toBeTruthy();
    const ups = screen.getAllByRole('link', { name: 'Sign up' });
    expect(ups.length).toBeGreaterThan(0);
    for (const a of ups) expect(a.getAttribute('href')).toBe('/signup');
    expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull();
    expect(screen.queryByLabelText('Invite code')).toBeNull();
    expect(screen.queryByLabelText('Access code')).toBeNull();
  });

  it('has Log in top right in the nav, to /login, and no Pupils link (#224)', async () => {
    await renderAt('/');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
    expect(screen.getAllByRole('link', { name: 'Log in' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Pupils/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(within(header).queryByRole('link', { name: 'Your workspace' })).toBeNull();
  });

  it('has Your workspace in the nav instead when signed in', async () => {
    account = { is_admin: false };
    await renderAt('/');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Your workspace' }).getAttribute('href')).toBe('/w');
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
  });

  it('Sign up opens /signup', async () => {
    await renderAt('/');
    await act(async () => {
      fireEvent.click(screen.getAllByRole('link', { name: 'Sign up' })[0]!);
    });
    expect(screen.getByTestId('where').textContent).toBe('/signup');
  });

  it('offers only the workspace when signed in, even to an admin (#79: Dashboard is in the workspace)', async () => {
    account = { is_admin: true };
    await renderAt('/');
    expect(screen.getByRole('link', { name: 'Open your workspace' }).getAttribute('href')).toBe('/w');
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
  });

  it('no Admin for a teacher', async () => {
    account = { is_admin: false };
    await renderAt('/');
    expect(screen.getByRole('link', { name: 'Open your workspace' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });
});

describe('/start', () => {
  it('shows Log in and both code fields, focused on the first', async () => {
    await renderAt('/start');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Get started');
    expect(screen.getByText(/or log in if you have signed up before\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/signin');
    expect(screen.getByRole('link', { name: 'Back to the front page' }).getAttribute('href')).toBe('/');
    const invite = screen.getByLabelText('Invite code');
    expect(document.activeElement).toBe(invite);
    expect(invite.getAttribute('autocomplete')).toBe('off');
    expect(invite.getAttribute('autocapitalize')).toBe('characters');
    expect(invite.getAttribute('spellcheck')).toBe('false');
    expect(screen.getByLabelText('Access code')).toBeTruthy();
  });

  it('goes on to /join/<code> with the invite code, spaces taken out', async () => {
    await renderAt('/start');
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: ' abcd efgh ' } });
    expect((screen.getByLabelText('Invite code') as HTMLInputElement).value).toBe('abcdefgh');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });
    expect(screen.getByLabelText('Invite code')).toBeTruthy(); // the join screen
    expect((screen.getByLabelText('Invite code') as HTMLInputElement).value).toBe('abcdefgh');
  });

  it('opens the workspace for an access code', async () => {
    await renderAt('/start');
    fireEvent.change(screen.getByLabelText('Access code'), { target: { value: 'abcd efgh jkmn' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: 'Have an access code?' }));
    });
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/access');
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ code: 'ABCDEFGHJKMN' });
    expect(screen.getByTestId('where').textContent).toBe('/s/tok-1');
  });

  it('says so when the access code is wrong, and keeps focus in the field', async () => {
    accessStatus = 404;
    await renderAt('/start');
    const field = screen.getByLabelText('Access code');
    fireEvent.change(field, { target: { value: 'WRONG' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
    });
    expect(screen.getByRole('alert').textContent).toBe('That access code was not recognised. Please check it, or ask the person who gave it to you.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
  });

  it('offers only the workspace when signed in, even to an admin (#79: Dashboard is in the workspace)', async () => {
    account = { is_admin: true };
    await renderAt('/start');
    expect(screen.getByRole('link', { name: 'Open your workspace' }).getAttribute('href')).toBe('/w');
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByLabelText('Invite code')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
  });

  it('no Admin for a teacher', async () => {
    account = { is_admin: false };
    await renderAt('/start');
    expect(screen.getByRole('link', { name: 'Open your workspace' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });
});

describe('/join/:code', () => {
  it('fills in the code and sends it with each provider', async () => {
    await renderAt('/join/ABCD-EFGH-JKMN');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign up with your invite code');
    expect((screen.getByLabelText('Invite code') as HTMLInputElement).value).toBe('ABCD-EFGH-JKMN');
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toBe('/api/auth/google/start?invite=ABCD-EFGH-JKMN');
    expect(screen.getByRole('link', { name: 'Continue with Microsoft' }).getAttribute('href')).toBe('/api/auth/microsoft/start?invite=ABCD-EFGH-JKMN');
  });

  it('says when no provider is set up', async () => {
    providers = [];
    await renderAt('/join/ABCD');
    expect(screen.getByText('Sign-in is not set up here yet.')).toBeTruthy();
    expect(screen.queryAllByRole('link', { name: /Continue with/ })).toHaveLength(0);
  });
});

describe('/signin', () => {
  it('has a link per provider, the first focused, and the line for study participants', async () => {
    await renderAt('/signin');
    const google = screen.getByRole('link', { name: 'Continue with Google' });
    expect(google.getAttribute('href')).toBe('/api/auth/google/start');
    expect(document.activeElement).toBe(google);
    expect(screen.getByText('Teachers and admins both log in here.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go back' }).getAttribute('href')).toBe('/start');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says "You have signed out." after signing out, and not otherwise', async () => {
    await renderAt('/signin?signed_out=1');
    expect(screen.getByRole('status').textContent).toBe('You have signed out.');
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    await renderAt('/signin');
    expect(screen.queryByText('You have signed out.')).toBeNull();
  });

  it('shows the message for the reason it came back with', async () => {
    await renderAt('/signin?error=invite_used');
    expect(screen.getByRole('alert').textContent).toBe('That invite code has already been used. If it was you, just sign in.');
  });
});
