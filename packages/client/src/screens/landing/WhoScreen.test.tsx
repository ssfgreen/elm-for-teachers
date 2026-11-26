import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { WhoScreen } from './WhoScreen';

afterEach(cleanup);

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

describe('/signup and /login (teacher-only)', () => {
  it('/signup sends teachers to /start and never offers a pupil choice', async () => {
    await renderAt('/signup');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign up');
    expect(screen.queryByRole('link', { name: 'I am a pupil' })).toBeNull();
    expect(await choose('I am a teacher')).toBe('/start');
  });

  it('/login sends teachers to /signin and never offers a pupil choice', async () => {
    await renderAt('/login');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Log in');
    expect(screen.queryByRole('link', { name: 'I am a pupil' })).toBeNull();
    expect(await choose('I am a teacher')).toBe('/signin');
  });

  it('the teacher choice is a keyboard-reachable link with a hidden icon', async () => {
    await renderAt('/signup');
    const link = screen.getByRole('link', { name: 'I am a teacher' });
    expect(link.getAttribute('href')).toBe('/start');
    expect(link.getAttribute('tabindex')).toBeNull();
    const svg = screen.getByTestId('teacher-icon');
    expect(link.contains(svg)).toBe(true);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
