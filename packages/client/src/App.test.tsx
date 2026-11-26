import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes } from './App';

afterEach(cleanup);

describe('AppRoutes', () => {
  it('has no make kit or pupil routes: /make/:token and /r/* are unknown pages', () => {
    for (const route of ['/make/tok123', '/r', '/r/join', '/r/login', '/r/readings/abc']) {
      render(
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </MemoryRouter>,
      );
      expect(screen.getByText('Please use the link you were given.')).toBeTruthy();
      cleanup();
    }
  });
});
