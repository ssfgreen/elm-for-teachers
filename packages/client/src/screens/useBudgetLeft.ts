import { useEffect, useState } from 'react';

/** Whole pounds left of the budget, rounded down, never below 0 (to the penny first, so float error cannot take a pound off). */
export function poundsLeft(spent: number, budget: number): number {
  return Math.max(0, Math.floor(Math.round((budget - spent) * 100) / 100));
}

/**
 * What the workspace has left of its budget (config plus top-ups), in whole pounds, for the chat
 * head. Fetched when the chat column shows and again each time `after` changes: ChatColumn passes
 * the chat's usage, which is fetched again when each turn ends. A failed fetch keeps the last
 * figure, as the usage counter does.
 */
export function useBudgetLeft(get: (() => Promise<{ spent_gbp: number; budget_gbp: number }>) | undefined, after: unknown): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!get) return;
    let cancelled = false;
    get()
      .then((b) => {
        if (!cancelled && Number.isFinite(b?.spent_gbp) && Number.isFinite(b?.budget_gbp)) setLeft(poundsLeft(b.spent_gbp, b.budget_gbp));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [get, after]);
  return left;
}
