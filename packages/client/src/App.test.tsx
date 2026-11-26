import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes } from './App';

afterEach(cleanup);

describe('AppRoutes', () => {
  it('has no make kit any more: /make/:token is an unknown page', () => {
    render(
      <MemoryRouter initialEntries={['/make/tok123']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('Please use the link you were given.')).toBeTruthy();
  });
});
