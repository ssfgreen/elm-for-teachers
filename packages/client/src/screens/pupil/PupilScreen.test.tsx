import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { PupilLoginScreen } from './LoginScreen';
import { pupilErrorPage, PupilScreen } from './PupilScreen';

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The server: whether a pupil is signed in, and whether pupil sign-in is on. */
type Cls = { class_id: string; class_name: string; label: string };
function server(opts: { signedIn?: boolean; off?: boolean; signOutFails?: boolean; classes?: Cls[] }) {
  const calls: string[] = [];
  let signedIn = opts.signedIn ?? false;
  const classes = [...(opts.classes ?? [])];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (opts.off) return json({ error: 'pupil sign-in is switched off', code: 'pupils_off' }, 403);
    if (url === '/api/pupil/providers') return json({ providers: [{ id: 'google', label: 'Google', kind: 'oidc' }, { id: 'microsoft', label: 'Microsoft', kind: 'oidc' }] });
    if (url === '/api/pupil/me') return signedIn ? json({ pupil: { provider: 'google' }, classes }) : json({ error: 'pupil sign-in required' }, 401);
    if (url === '/api/pupil/join') {
      const { code } = JSON.parse(String(init?.body)) as { code: string };
      if (code !== 'ABCD-EFGH') return json({ error: 'no', code: 'code_unknown' }, 404);
      const joined = { class_id: 'c1', class_name: '8B', label: 'Pupil 3' };
      classes.push(joined);
      return json({ class: joined });
    }
    if (url === '/api/pupil/readings') return json({ readings: [] });
    if (url === '/api/pupil/sign-out') {
      if (opts.signOutFails) return json({ error: 'sign-out must come from this site' }, 403);
      signedIn = false;
      return json(null, 204);
    }
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(f as unknown as typeof fetch);
  return calls;
}

/** Where a redirect lands, with its query. */
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const where = () => screen.getByTestId('where').textContent;

const show = async (at = '/r') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/r" element={<PupilScreen />} />
          <Route
            path="/r/login"
            element={
              <>
                <Where />
                <PupilLoginScreen />
              </>
            }
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

afterEach(() => {
  cleanup();
  setFetch(null);
});

describe('PupilScreen', () => {
  it('signed out, with no error: on to /r/login', async () => {
    server({});
    await show();
    expect(where()).toBe('/r/login');
  });

  it('signed out, with an error: code trouble goes to /r/join, anything else to /r/login, with the reason', async () => {
    server({});
    await show('/r?error=code_unknown');
    expect(where()).toBe('/r/join?error=code_unknown');
    cleanup();
    await show('/r?error=cancelled');
    expect(where()).toBe('/r/login?error=cancelled');
  });

  it('signed in to a class: "You are Pupil 3 in 8B", and nothing else to do yet', async () => {
    server({ signedIn: true, classes: [{ class_id: 'c1', class_name: '8B', label: 'Pupil 3' }] });
    await show();
    expect(screen.getByRole('heading', { name: 'You are Pupil 3 in 8B' })).toBeTruthy();
    expect(screen.getByText(/nothing to do yet/)).toBeTruthy();
    expect(screen.queryByLabelText('Class code')).toBeNull();
  });

  it('signed in with no class: types a code and joins', async () => {
    const calls = server({ signedIn: true });
    await show();
    expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Class code'), { target: { value: 'ZZZZ-ZZZZ' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join class' }));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/does not work/);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Class code'), { target: { value: 'abcd-efgh' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join class' }));
    });
    expect(calls.filter((c) => c === 'POST /api/pupil/join')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'You are Pupil 3 in 8B' })).toBeTruthy();
  });

  it('signed in: signs out', async () => {
    const calls = server({ signedIn: true });
    await show();
    expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(calls).toContain('POST /api/pupil/sign-out');
    expect(where()).toBe('/r/login?signed_out=1');
    expect(screen.getByRole('status').textContent).toBe('You have signed out.');
  });

  it('says so when signing out fails, and stays signed in', async () => {
    server({ signedIn: true, signOutFails: true });
    await show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(screen.getByRole('alert').textContent).toBe('Signing out did not work. Please try again.');
    expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeTruthy();
  });
});

describe('pupilErrorPage', () => {
  it('sends each code reason to /r/join and the rest to /r/login', () => {
    for (const r of ['code_needed', 'code_unknown', 'class_archived', 'too_many_codes', 'feature_off']) expect(pupilErrorPage(r)).toBe(`/r/join?error=${r}`);
    for (const r of ['cancelled', 'provider_error', 'teacher_account', 'pupils_off', 'failed', 'test_pupil', 'other']) expect(pupilErrorPage(r)).toBe(`/r/login?error=${r}`);
    expect(pupilErrorPage(null)).toBe('/r/login');
  });
});
