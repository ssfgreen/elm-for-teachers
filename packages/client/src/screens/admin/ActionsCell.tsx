import { History } from 'lucide-react';
import type { AdminApi } from '../../api/admin';
import { errorCode } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';
import { DeleteButton } from '../../admin/DeleteButton';
import { ExportButton } from '../../admin/ExportButton';
import { IconLink } from '../../admin/IconButton';
import type { CellContext } from './columns';

export const LAST_ADMIN_MESSAGE = 'This is the only admin’s workspace. Make another account admin first.';

/** Delete, with the server's 409 last_admin put in plain words. */
export function deleteWithMessages(api: Pick<AdminApi, 'deleteSession'>): Pick<AdminApi, 'deleteSession'> {
  return {
    deleteSession: (id) =>
      api.deleteSession(id).catch((e: unknown) => {
        throw errorCode(e) === 'last_admin' ? new Error(LAST_ADMIN_MESSAGE) : e;
      }),
  };
}

/** The Data column: replay the workspace, download it as a .zip, or delete it, as icons. The link's actions are in the Access column. */
export function DataCell({ row: s, ctx }: { row: AdminSessionRow; ctx: CellContext }) {
  return (
    <span className="inline-flex min-w-21 flex-wrap items-center gap-1">
      <IconLink
        icon={History}
        to={`/admin/replay?session=${encodeURIComponent(s.session_id)}`}
        label={`Replay ${s.label}`}
        title="Play the workspace back: the screen, pointer, typing and chat, session by session"
      />
      <ExportButton api={ctx.api} sessionId={s.session_id} label={s.label} />
      <DeleteButton api={deleteWithMessages(ctx.api)} sessionId={s.session_id} label={s.label} onDeleted={() => ctx.list.deleted(s.session_id)} />
    </span>
  );
}
