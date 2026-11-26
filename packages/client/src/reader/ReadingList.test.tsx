import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { ReadingList } from './ReadingList';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

async function show(readings: object[]) {
  setFetch(vi.fn(async () => json({ readings })) as unknown as typeof fetch);
  await act(async () => {
    render(
      <MemoryRouter>
        <ReadingList />
      </MemoryRouter>,
    );
  });
}

afterEach(() => {
  cleanup();
  setFetch(null);
});

describe('ReadingList', () => {
  it('links each reading to the reader, with its class and day', async () => {
    await show([{ id: 'r1', name: 'Rain', class_id: 'c1', class_name: '8B', set_on: '2026-11-20' }]);
    expect(screen.getByRole('link', { name: 'Rain' }).getAttribute('href')).toBe('/r/readings/r1');
    expect(screen.getByText('8B, set on 20 November')).toBeTruthy();
  });

  it('says there is nothing to do without readings', async () => {
    await show([]);
    expect(screen.getByText(/nothing to do yet/)).toBeTruthy();
  });
});
