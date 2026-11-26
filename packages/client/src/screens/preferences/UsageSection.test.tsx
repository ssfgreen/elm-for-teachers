import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsageRange, UsageReport } from '@edw/shared';
import { UsageSection } from './UsageSection';
import { poundsAndPence } from './UsagePounds';
import { dayLabel } from './UsageChart';

const base = { spent_gbp: 12.4, budget_gbp: 60, to: '2026-11-04' };
const REPORTS: Record<UsageRange, UsageReport> = {
  week: {
    ...base,
    range: 'week',
    from: '2026-11-02',
    days: [
      { day: '2026-11-02', gbp: 2 },
      { day: '2026-11-03', gbp: 0 },
      { day: '2026-11-04', gbp: 0.5 },
    ],
    total_gbp: 2.5,
  },
  month: { ...base, range: 'month', from: '2026-11-01', days: [], total_gbp: 0 },
  all: { ...base, range: 'all', from: '2026-10-01', days: [{ day: '2026-10-01', gbp: 12.4 }], total_gbp: 12.4 },
};

function setup(reports: Record<UsageRange, UsageReport> = REPORTS) {
  const api = { getUsage: vi.fn(async (range: UsageRange) => reports[range]) };
  render(<UsageSection api={api} />);
  return api;
}

afterEach(cleanup);

describe('Usage', () => {
  it('shows spend against the budget, and this week by day', async () => {
    const api = setup();
    expect(await screen.findByText('£12.40 of £60 used')).toBeTruthy();
    expect(api.getUsage).toHaveBeenCalledWith('week');
    expect(screen.getByRole('radio', { name: 'This week' })).toHaveProperty('checked', true);
    expect(await screen.findByText('£2.50 this week')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Spend by day, this week' });
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['Mon 2 Nov£2', 'Tue 3 Nov£0', 'Wed 4 Nov£0.50']);
    expect(screen.getByTestId('usage-chart').getAttribute('aria-hidden')).toBe('true');
  });

  it('switches range, and says so when the range has no use', async () => {
    const api = setup();
    await screen.findByText('£2.50 this week');
    fireEvent.click(screen.getByRole('radio', { name: 'This month' }));
    expect(await screen.findByText('Nothing spent this month.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    expect(await screen.findByText('£12.40 in all')).toBeTruthy();
    expect(api.getUsage.mock.calls.map((c) => c[0])).toEqual(['week', 'month', 'all']);
  });

  it('says nothing has been used yet in a new workspace', async () => {
    const none = { ...base, spent_gbp: 0, from: null, days: [], total_gbp: 0 };
    setup({ week: { ...none, range: 'week' }, month: { ...none, range: 'month' }, all: { ...none, range: 'all' } });
    expect(await screen.findByText('£0 of £60 used')).toBeTruthy();
    expect(await screen.findByText('Nothing spent this week.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    expect(await screen.findByText('Nothing spent yet.')).toBeTruthy();
  });

  it('says so quietly when usage cannot be loaded', async () => {
    render(<UsageSection api={{ getUsage: vi.fn(async () => Promise.reject(new Error('offline'))) }} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeTruthy());
  });

  it('formats pounds and days', () => {
    expect([60, 0, 12.4, 0.5, 0.1, 0.0812].map(poundsAndPence)).toEqual(['£60', '£0', '£12.40', '£0.50', '£0.10', '£0.081']);
    expect(dayLabel('2026-10-25')).toBe('Sun 25 Oct');
  });
});
