import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { wholeClassCode } from './ClassCode';
import { PupilJoinScreen } from './JoinScreen';

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The pupil routes: who is signed in, the providers, and how a login answers. */
function server(opts: { signedIn?: boolean; providers?: { id: string; label: string; kind: string }[]; login?: (body: Record<string, unknown>) => Response }) {
  const posted: Record<string, unknown>[] = [];
  setFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/pupil/providers') return json({ providers: opts.providers ?? [{ id: 'google', label: 'Google', kind: 'oidc' }] });
      if (url === '/api/pupil/me') return opts.signedIn ? json({ pupil: { provider: 'google' }, classes: [] }) : json({ error: 'pupil sign-in required' }, 401);
      if (url === '/api/pupil/login') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        posted.push(body);
        return opts.login ? opts.login(body) : json(null, 204);
      }
      return json({ error: 'unexpected' }, 500);
    }) as unknown as typeof fetch,
  );
  return posted;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

/** The router's own location on /r/join (MemoryRouter never changes window.location). */
function Here() {
  const l = useLocation();
  return <output data-testid="here">{l.pathname + l.search + l.hash + JSON.stringify(l.state)}</output>;
}

const show = async (at = '/r/join') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/r/join"
            element={
              <>
                <Here />
                <PupilJoinScreen />
              </>
            }
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

const type = async (label: string, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const toStep2 = async (code = 'abcd-efgh') => {
  await type('Class code', code);
  await click('Next');
};
const nextOff = () => (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled;

afterEach(() => {
  cleanup();
  setFetch(null);
  localStorage.clear();
  sessionStorage.clear();
});

describe('wholeClassCode', () => {
  it('needs all 8 letters or digits, and writes them ABCD-EFGH', () => {
    expect(wholeClassCode('ABCD-EFG')).toBeNull();
    expect(wholeClassCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(wholeClassCode('abcd-efgh')).toBe('ABCD-EFGH');
    expect(wholeClassCode('ABCDEFGHJ')).toBeNull();
  });
});

describe('/r/join', () => {
  it('step 1: "Sign up", Class code, Next only once the code is whole, and a link to Log in', async () => {
    server({});
    await show();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign up');
    expect(nextOff()).toBe(true);
    await type('Class code', 'abcd-efg');
    expect(nextOff()).toBe(true);
    await type('Class code', 'abcd-efgh');
    expect(nextOff()).toBe(false);
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/r/login');
  });

  it('step 2: shows the code and sends it with each provider', async () => {
    server({
      providers: [
        { id: 'google', label: 'Google', kind: 'oidc' },
        { id: 'microsoft', label: 'Microsoft', kind: 'oidc' },
      ],
    });
    await show();
    await toStep2();
    expect(screen.getByText('Class code ABCD-EFGH')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toBe('/api/pupil/auth/google/start?code=ABCD-EFGH');
    expect(screen.getByRole('link', { name: 'Continue with Microsoft' }).getAttribute('href')).toBe('/api/pupil/auth/microsoft/start?code=ABCD-EFGH');
    expect(screen.getByRole('heading', { name: 'Username and password from your teacher' })).toBeTruthy();
  });

  it('Change goes back to step 1 with the code kept', async () => {
    server({});
    await show();
    await toStep2();
    await click('Change');
    expect((screen.getByLabelText('Class code') as HTMLInputElement).value).toBe('ABCD-EFGH');
    expect(nextOff()).toBe(false);
  });

  it('the login form posts exactly username, password and code, then goes to /r', async () => {
    const posted = server({});
    await show();
    await toStep2();
    const username = screen.getByLabelText('Username');
    const password = screen.getByLabelText('Password');
    expect(username.getAttribute('autocomplete')).toBe('username');
    expect(username.getAttribute('autocapitalize')).toBe('none');
    expect(username.getAttribute('spellcheck')).toBe('false');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(password.getAttribute('type')).toBe('password');
    await type('Username', 'fox-12');
    await type('Password', 'river-pear');
    await click('Sign up');
    expect(posted).toEqual([{ username: 'fox-12', password: 'river-pear', code: 'ABCD-EFGH' }]);
    expect(screen.getByTestId('where').textContent).toBe('/r');
  });

  it('each refusal shows its words, clears the password and keeps the username', async () => {
    const words: Record<string, RegExp> = {
      login_wrong: /do not match/,
      login_locked: /Ask your teacher for a new password/,
      code_other_class: /different class/,
      login_taken: /already in use/,
      something_new: /did not work/,
    };
    for (const [code, said] of Object.entries(words)) {
      server({ login: () => json({ error: 'no', code }, 403) });
      await show();
      await toStep2();
      await type('Username', 'fox-12');
      await type('Password', 'wrong');
      await click('Sign up');
      expect(screen.getByRole('alert').textContent).toMatch(said);
      expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('fox-12');
      cleanup();
    }
  });

  it('keeps the code out of the URL and storage, and a remount has forgotten it', async () => {
    server({});
    await show();
    await toStep2();
    expect(screen.getByTestId('here').textContent).toBe('/r/joinnull');
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/ABCD/i);
    expect(JSON.stringify({ ...sessionStorage })).not.toMatch(/ABCD/i);
    cleanup();
    await show();
    expect((screen.getByLabelText('Class code') as HTMLInputElement).value).toBe('');
  });

  it('says why the last try failed (?error=), until the pupil presses Next', async () => {
    server({});
    await show('/r/join?error=code_unknown');
    expect(screen.getByRole('alert').textContent).toMatch(/does not work/);
    await toStep2();
    await click('Change');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('here').textContent).toBe('/r/joinnull');
  });

  it('never puts the username or password in an attribute on step 2', async () => {
    server({ login: () => json({ error: 'no', code: 'login_wrong' }, 401) });
    await show();
    await toStep2();
    await type('Username', 'fox-12');
    await type('Password', 'river-pear');
    const attrs = () => [...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.value)).join(' ');
    expect(attrs()).not.toMatch(/fox-12|river-pear/);
    await click('Sign up');
    expect(attrs()).not.toMatch(/fox-12|river-pear/);
  });

  it('with no provider set up, offers only the login form', async () => {
    server({ providers: [] });
    await show();
    await toStep2();
    expect(screen.queryByRole('link', { name: /Continue with/ })).toBeNull();
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });

  it('sends a pupil already signed in on to /r', async () => {
    server({ signedIn: true });
    await show();
    expect(screen.getByTestId('where').textContent).toBe('/r');
  });
});
