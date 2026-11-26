import { useCallback, useEffect, useState } from 'react';
import type { AdminApi, AdminBudget } from '../../api/admin';

/**
 * Every workspace's spend and budget (GET /api/admin/budgets), for the Budget column. Loaded
 * again when the list of workspaces changes (a new one starts at the config's budget). `topUp`
 * adds £10 and puts the server's figures in place; it throws for the cell to show.
 */
export function useAdminBudgets(api: Pick<AdminApi, 'listBudgets' | 'topUp'>, sessionIds: readonly string[]) {
  const [budgets, setBudgets] = useState<ReadonlyMap<string, AdminBudget>>(new Map());
  const { listBudgets, topUp: postTopUp } = api;
  const key = sessionIds.join(',');

  useEffect(() => {
    let cancelled = false;
    listBudgets().then(
      (list) => {
        if (!cancelled) setBudgets(new Map(list.map((b) => [b.session_id, b])));
      },
      // The column is not worth an error: it shows nothing for a workspace it has no figures for.
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [listBudgets, key]);

  const topUp = useCallback(
    async (sessionId: string) => {
      const b = await postTopUp(sessionId);
      setBudgets((m) => new Map(m).set(b.session_id, b));
    },
    [postTopUp],
  );

  return { get: (sessionId: string) => budgets.get(sessionId), topUp };
}
export type AdminBudgets = ReturnType<typeof useAdminBudgets>;
