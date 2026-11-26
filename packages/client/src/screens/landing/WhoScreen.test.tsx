import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { WhoScreen } from './WhoScreen';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let pupilsOn: boolean;
let providers: { id: string; label: string; kind: string }[];

beforeEach(() => {
  pupilsOn = true;
  providers = [{ id: 'google', label: 'Google', kind: 'oidc' }];
  setFetch(
    vi.fn(async (url: string) => {
      if (url === '/api/pupil/providers') return pupilsOn ? json({ providers }) : json({ error: 'pupil sign-in is switched off', code: 'pupils_off' }, 403);
      return json({ error: 'unexpected' }, 500);
    }) as unknown as typeof fetch,
  );
});

afterEach(() => {
  cleanup();
  setFetch(null);
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

const renderAt = async (path: string) => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/signup" element={<WhoScreen mode="signup" />} />
          <Route path="/login" element={<WhoScreen mode="login" />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

const choose = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name }));
  });
  return screen.getByTestId('where').textContent;
};

describe('/signup and /login (#224)', () => {
  it('/signup: a teacher goes on to /start, a pupil to /r/join', async () => {
    await renderAt('/signup');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign up');
    expect(await choose('I am a teacher')).toBe('/start');
    cleanup();
    await renderAt('/signup');
    expect(await choose('I am a pupil')).toBe('/r/join');
  });

  it('/login: a teacher goes on to /signin, a pupil to /r/login', async () => {
    await renderAt('/login');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Log in');
    expect(await choose('I am a teacher')).toBe('/signin');
    cleanup();
    await renderAt('/login');
    expect(await choose('I am a pupil')).toBe('/r/login');
  });

  it('each choice is one link named by its text, with its picture hidden from screen readers', async () => {
    await renderAt('/signup');
    for (const [name, icon] of [
      ['I am a teacher', 'teacher-icon'],
      ['I am a pupil', 'pupil-icon'],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link.textContent).toBe(name);
      const svg = screen.getByTestId(icon);
      expect(link.contains(svg)).toBe(true);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    }
  });

  it('both choices are reachable by keyboard: links with an href, not taken out of the tab order', async () => {
    await renderAt('/login');
    for (const name of ['I am a teacher', 'I am a pupil']) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBeTruthy();
      expect(link.getAttribute('tabindex')).toBeNull();
      link.focus();
      expect(document.activeElement).toBe(link);
      expect(link.className).toContain('focus-visible:ring-3');
    }
  });

  it('with pupil sign-in off, shows only the teacher choice and no question, as the old nav link (#179)', async () => {
    pupilsOn = false;
    for (const path of ['/signup', '/login']) {
      await renderAt(path);
      expect(screen.getByRole('link', { name: 'I am a teacher' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'I am a pupil' })).toBeNull();
      expect(screen.queryByText('Are you a teacher or a pupil?')).toBeNull();
      cleanup();
    }
  });

  it('with pupil sign-in on but no provider set up, still offers I am a pupil: a teacher’s login needs none (#245)', async () => {
    providers = [];
    await renderAt('/login');
    expect(screen.getByRole('link', { name: 'I am a pupil' }).getAttribute('href')).toBe('/r/login');
  });
});
