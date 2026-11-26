import { useState } from 'react';
import { TOP_UP_GBP } from '@edw/shared';
import type { AdminSessionRow } from '../../api/types';
import { Button } from '../../components/ui/button';
import type { CellContext } from './columns';

/** Whole pounds plain, else pounds and pence. */
const pounds = (gbp: number) => (Number.isInteger(gbp) ? `£${gbp}` : `£${gbp.toFixed(2)}`);

/** "£12.40 of £60": what the workspace has spent of its budget (the config's plus its top-ups). */
export function budgetLabel(spent: number, budget: number): string {
  return `£${spent.toFixed(2)} of ${pounds(budget)}`;
}

/**
 * A workspace's spend against its budget, and "Add £10", which adds to it at once. There is no
 * undo, and the limit stays soft (the overrun in config `limits`).
 */
export function BudgetCell({ row, ctx }: { row: AdminSessionRow; ctx: CellContext }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const budget = ctx.budgets?.get(row.session_id);
  if (!ctx.budgets || !budget) return null;
  const { topUp } = ctx.budgets;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await topUp(row.session_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5">
      <span className="whitespace-nowrap tabular-nums">{budgetLabel(budget.spent_gbp, budget.budget_gbp)}</span>
      <Button variant="link" onClick={() => void add()} disabled={busy} aria-label={`Add £${TOP_UP_GBP} to the budget for ${row.label}`} title="Adds to this workspace’s budget at once. There is no undo.">
        {busy ? 'Adding…' : `Add £${TOP_UP_GBP}`}
      </Button>
      {error && (
        <span className="text-destructive" role="alert">
          That did not work: {error}
        </span>
      )}
    </span>
  );
}
