import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatHead } from './ChatHead';
import { poundsLeft, useBudgetLeft } from './useBudgetLeft';

afterEach(cleanup);

const head = (budgetLeft: number | null, usage = null) => render(<ChatHead lead={null} thread={undefined} onRename={vi.fn()} naming={false} usage={usage} budgetLeft={budgetLeft} />);

describe('"£N left" in the chat head', () => {
  it('shows what is left in whole pounds, even with no usage yet', () => {
    head(47);
    expect(screen.getByText('£47 left')).toBeTruthy();
  });

  it('shows £0 left once the budget is spent', () => {
    head(0);
    expect(screen.getByText('£0 left')).toBeTruthy();
  });

  it('shows nothing before the figure arrives', () => {
    const { container } = head(null);
    expect(container.textContent).toBe('');
  });
});

describe('poundsLeft', () => {
  it('rounds down to whole pounds, and never goes below 0', () => {
    expect(poundsLeft(12.4, 60)).toBe(47);
    expect(poundsLeft(0, 70)).toBe(70);
    expect(poundsLeft(59.99, 60)).toBe(0);
    expect(poundsLeft(64, 60)).toBe(0);
    // 0.1 + 0.2 is not quite 0.3: still £10 left, not £9.
    expect(poundsLeft(0.1 + 0.2, 10.3)).toBe(10);
  });
});

describe('useBudgetLeft', () => {
  it('fetches on show and again when the chat usage changes (after each turn), keeping the last figure on a failure', async () => {
    const get = vi.fn().mockResolvedValueOnce({ spent_gbp: 12.4, budget_gbp: 60 }).mockResolvedValueOnce({ spent_gbp: 12.4, budget_gbp: 70 }).mockRejectedValueOnce(new Error('down'));
    const hook = renderHook(({ after }) => useBudgetLeft(get, after), { initialProps: { after: {} as unknown } });
    await waitFor(() => expect(hook.result.current).toBe(47));
    hook.rerender({ after: {} });
    await waitFor(() => expect(hook.result.current).toBe(57));
    await act(async () => hook.rerender({ after: {} }));
    expect(get).toHaveBeenCalledTimes(3);
    expect(hook.result.current).toBe(57);
  });
});
