import type { AdminSessionRow } from '../../api/types';
import { cn } from '../../lib/utils';
import type { AdminColumn, CellContext } from './columns';
import { adminColumns } from './columns';
import { tableCardClass, tdClass, thClass } from './styles';
import { useAdminBudgets } from './useAdminBudgets';

export interface WorkspaceListProps {
  sessions: AdminSessionRow[];
  ctx: CellContext;
  columns?: AdminColumn[];
}

/** The table of workspaces, one row each, drawn from the column registry. It loads the budgets for the Budget column. */
export function WorkspaceList({ sessions, ctx: given, columns = adminColumns }: WorkspaceListProps) {
  const budgets = useAdminBudgets(given.api, sessions.map((s) => s.session_id));
  const ctx: CellContext = { ...given, budgets: given.budgets ?? budgets };
  return (
    <section className={tableCardClass}>
      <table className="w-full border-collapse text-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={thClass} title={c.title}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.session_id} className="group/row hover:bg-hover">
              {columns.map((c) => (
                <td key={c.key} className={cn(tdClass, c.className)}>
                  {c.cell(s, ctx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
