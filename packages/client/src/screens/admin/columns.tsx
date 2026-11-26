import type { ReactNode } from 'react';
import type { AdminAccount, AdminApi } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';
import { InteractionsSwitch } from '../../admin/InteractionsSwitch';
import { EditableTitle } from '../../components/EditableTitle';
import { AccessCell } from './AccessCell';
import { AccessCodeCell } from './AccessCodeCell';
import { DataCell } from './ActionsCell';
import { BudgetCell } from './BudgetCell';
import { FeaturesCell } from './FeaturesCell';
import type { AdminBudgets } from './useAdminBudgets';
import type { AdminSessions } from './useAdminSessions';

/** What a cell can use besides its row. */
export interface CellContext {
  api: AdminApi;
  list: Pick<AdminSessions, 'rename' | 'replace' | 'deleted' | 'setFeatures'>;
  /** The account behind each account workspace, by session id. */
  accounts?: ReadonlyMap<string, AdminAccount>;
  /** Each workspace's spend and budget, and adding £10 to it (WorkspaceList loads them). */
  budgets?: AdminBudgets;
}

/**
 * One column of the workspace list. A new column is one cell component in its own file
 * and one line in `adminColumns`.
 */
export interface AdminColumn {
  key: string;
  header: ReactNode;
  /** The header's tooltip. */
  title?: string;
  /** Extra classes for the cell. */
  className?: string;
  cell: (row: AdminSessionRow, ctx: CellContext) => ReactNode;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Not yet');

function NameCell({ row, ctx }: { row: AdminSessionRow; ctx: CellContext }) {
  return (
    <span className="inline-flex items-center">
      <EditableTitle
        itemKey={row.session_id}
        value={row.label}
        onRename={(next) => void ctx.list.rename(row.session_id, next)}
        as="span"
        className="focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        inputClassName="rounded-sm border-primary px-1.5 py-0.5 outline-2 outline-ring"
        inputLabel="Workspace name"
        maxLength={120}
      />
    </span>
  );
}

/** The workspace list's columns, in order. */
export const adminColumns: AdminColumn[] = [
  { key: 'name', header: 'Name', cell: (row, ctx) => <NameCell row={row} ctx={ctx} /> },
  { key: 'access', header: 'Access', title: 'How the workspace is reached: by signing in, or by its link', cell: (row, ctx) => <AccessCell row={row} ctx={ctx} /> },
  { key: 'access-code', header: 'Access code', title: 'Typed at the front door instead of the link', cell: (row, ctx) => <AccessCodeCell row={row} ctx={ctx} /> },
  { key: 'budget', header: 'Budget', title: 'Spent of its budget for the assistant: the set budget plus any top-ups', cell: (row, ctx) => <BudgetCell row={row} ctx={ctx} /> },
  { key: 'features', header: 'Features', title: 'What the workspace offers. A change reaches an open tab on its next load', cell: (row, ctx) => <FeaturesCell row={row} ctx={ctx} /> },
  { key: 'created', header: 'Created', cell: (row) => new Date(row.created_at).toLocaleString() },
  { key: 'first-opened', header: 'First opened', cell: (row) => when(row.first_opened_at) },
  { key: 'last-opened', header: 'Last opened', cell: (row) => when(row.last_opened_at) },
  {
    key: 'interactions',
    header: 'Interaction logging',
    title: 'Pointer, clicks and what is on screen, for playing a session back',
    cell: (row, ctx) => <InteractionsSwitch api={ctx.api} session={row} onChanged={ctx.list.replace} />,
  },
  { key: 'data', header: 'Data', title: 'Replay, download or delete the workspace', cell: (row, ctx) => <DataCell row={row} ctx={ctx} /> },
];
