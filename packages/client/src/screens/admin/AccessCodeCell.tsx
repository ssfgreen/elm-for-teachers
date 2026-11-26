import { useState } from 'react';
import type { AdminSessionRow } from '../../api/types';
import { Eye } from 'lucide-react';
import { CopyIcon, IconButton } from '../../admin/IconButton';
import { Button } from '../../components/ui/button';
import type { CellContext } from './columns';

/**
 * A link workspace's access code, typed at the front door instead of the link: Show and Copy (icons), or
 * Make for a workspace made before codes. An account workspace has none: it is reached by signing in.
 * A closed link has none either: it says so.
 */
export function AccessCodeCell({ row, ctx }: { row: AdminSessionRow; ctx: CellContext }) {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (row.access === 'account') return null;
  // A closed link has no code until the admin makes a new link (the Access column).
  if (row.link_closed_at) return <span className="text-muted-foreground">Link closed</span>;

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      ctx.list.replace(await ctx.api.newAccessCode(row.session_id));
      setShown(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!row.access_code) {
    return (
      <span className="inline-flex items-center gap-2.5">
        <Button variant="link" onClick={() => void make()} disabled={busy} aria-label={`Make an access code for ${row.label}`}>
          {busy ? 'Making…' : 'Make'}
        </Button>
        {error && <span className="text-destructive">{error}</span>}
      </span>
    );
  }
  return (
    // The copy icon may wrap under a shown code, so a tight table can still shrink this column.
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown ? (
        <code className="mr-1.5 whitespace-nowrap">{row.access_code}</code>
      ) : (
        <IconButton icon={Eye} label={`Show the access code for ${row.label}`} title="Show the access code" onClick={() => setShown(true)} />
      )}
      <CopyIcon text={row.access_code} label={`Copy the access code for ${row.label}`} title="Copy the access code" />
    </span>
  );
}
