import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';
import { BudgetCell, budgetLabel } from './BudgetCell';
import type { CellContext } from './columns';

const row = { session_id: 'S1', label: 'Year 7' } as AdminSessionRow;
const ctx = (budgets: CellContext['budgets']): CellContext => ({ api: {} as AdminApi, list: { rename: vi.fn(), replace: vi.fn(), deleted: vi.fn(), setFeatures: vi.fn() }, budgets });

afterEach(cleanup);

describe('BudgetCell', () => {
  it('reads as spend of budget, in pounds and pence, the budget plain when whole', () => {
    expect(budgetLabel(12.4, 60)).toBe('£12.40 of £60');
    expect(budgetLabel(0, 70)).toBe('£0.00 of £70');
    expect(budgetLabel(3.456, 62.5)).toBe('£3.46 of £62.50');
  });

  it('says plainly when adding did not work', async () => {
    const topUp = vi.fn(async () => Promise.reject(new Error('boom')));
    render(<BudgetCell row={row} ctx={ctx({ get: () => ({ session_id: 'S1', spent_gbp: 1, budget_gbp: 60 }), topUp })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add £10 to the budget for Year 7' }));
    });
    expect(topUp).toHaveBeenCalledWith('S1');
    expect(screen.getByRole('alert').textContent).toContain('boom');
  });

  it('shows nothing before the figures arrive', () => {
    const { container } = render(<BudgetCell row={row} ctx={ctx({ get: () => undefined, topUp: vi.fn() })} />);
    expect(container.textContent).toBe('');
  });
});
