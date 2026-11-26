import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminAccount, AdminApi } from '../../api/admin';

/**
 * The signed-in accounts (GET /api/admin/accounts), for the Admins panel and the list's
 * Access cell. `bySession` finds the account behind an account workspace.
 */
export function useAdminAccounts(api: Pick<AdminApi, 'listAccounts'>) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { listAccounts } = api;

  const reload = useCallback(() => {
    listAccounts().then(
      (a) => {
        setAccounts(a);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [listAccounts]);
  useEffect(() => reload(), [reload]);

  const bySession = useMemo(() => new Map(accounts.map((a) => [a.workspace.session_id, a])), [accounts]);
  return { accounts, bySession, error, reload };
}
export type AdminAccounts = ReturnType<typeof useAdminAccounts>;
