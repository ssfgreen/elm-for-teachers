import { ExternalLink } from 'lucide-react';
import type { AdminSessionRow } from '../../api/types';
import { providerName } from '../../api/admin';
import { CopyIcon, IconLink } from '../../admin/IconButton';
import type { CellContext } from './columns';
import { LinkActions } from './LinkActions';

/**
 * How a workspace is reached: an account workspace names who signs in to it ("Signed in with
 * Microsoft", name, email); a link workspace has icons to copy, open, replace or close its link.
 * A closed link offers only a new one.
 */
export function AccessCell({ row, ctx }: { row: AdminSessionRow; ctx: CellContext }) {
  if (row.access === 'account') {
    const account = ctx.accounts?.get(row.session_id);
    if (!account) return <span className="text-muted-foreground">Signed in</span>;
    return (
      <span className="flex flex-col">
        <span>Signed in with {providerName(account.provider)}</span>
        {account.name && <span className="text-foreground-2">{account.name}</span>}
        {account.email && <span className="text-md break-all text-muted-foreground">{account.email}</span>}
      </span>
    );
  }
  const url = row.participant_url;
  return (
    <span className="inline-flex min-w-28 flex-wrap items-center gap-1">
      {url && (
        <>
          <CopyIcon text={url} label={`Copy the link for ${row.label}`} title="Copy the workspace’s link" />
          <IconLink icon={ExternalLink} href={url} label={`Open ${row.label} in a new tab`} title="Open the workspace in a new tab" />
        </>
      )}
      <LinkActions api={ctx.api} row={row} onChanged={ctx.list.replace} />
    </span>
  );
}
