import { useState } from 'react';
import type { AdminApi } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';
import { Link2, Link2Off, RefreshCw } from 'lucide-react';
import { IconButton } from '../../admin/IconButton';
import { Button } from '../../components/ui/button';

type Action = 'replace' | 'close';

/** Said in both questions: what happens to a teacher already working on the old link. */
const OPEN_TABS = 'Anyone with the workspace open on the old link stops saving, and loses what they type after that.';

/** What each action asks before it runs, and its button while running. */
const ASK: Record<Action, (label: string, closed: boolean) => { question: string; confirm: string; busy: string }> = {
  replace: (label, closed) =>
    closed
      ? { question: `Give “${label}” a new link and access code?`, confirm: 'Make a new link', busy: 'Making…' }
      : { question: `Replace the link and access code for “${label}”? The old ones stop working at once. ${OPEN_TABS}`, confirm: 'Replace', busy: 'Replacing…' },
  close: (label) => ({ question: `Close the link for “${label}”? The link and access code stop working, and no new one is made. ${OPEN_TABS}`, confirm: 'Close link', busy: 'Closing…' }),
};

export interface LinkActionsProps {
  api: Pick<AdminApi, 'setLink'>;
  row: AdminSessionRow;
  /** The row as the server now has it. */
  onChanged: (row: AdminSessionRow) => void;
}

/** Where the question sits: in the Access cell under the icons, wrapped, so the table keeps its width. */
export const askClass = 'inline-flex max-w-60 flex-wrap items-center gap-x-2.5 gap-y-1 whitespace-normal wrap-anywhere';

/**
 * A link workspace's link, as icons: Replace (a new link and code; the old ones stop working) or Close
 * (both stop, none is made), each confirmed in place. A closed link offers only a new link.
 * An account workspace has no link, so nothing shows.
 */
export function LinkActions({ api, row, onChanged }: LinkActionsProps) {
  const [asking, setAsking] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (row.access === 'account') return null;
  const closed = Boolean(row.link_closed_at);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.setLink(row.session_id, action));
      setAsking(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <>
        <IconButton
          icon={closed ? Link2 : RefreshCw}
          label={closed ? `Make a new link for ${row.label}` : `Replace the link for ${row.label}`}
          title="A new link and access code; the old ones stop working"
          onClick={() => setAsking('replace')}
        />
        {!closed && <IconButton icon={Link2Off} danger label={`Close the link for ${row.label}`} title="The link and access code stop working" onClick={() => setAsking('close')} />}
      </>
    );
  }
  const ask = ASK[asking](row.label, closed);
  return (
    <span className={askClass} role="group" aria-label={ask.confirm}>
      <span>{ask.question}</span>
      <Button variant={asking === 'close' ? 'link-danger' : 'link'} onClick={() => void run(asking)} disabled={busy}>
        {busy ? ask.busy : ask.confirm}
      </Button>
      <Button variant="link" onClick={() => setAsking(null)} disabled={busy}>
        Cancel
      </Button>
      {error && (
        <span className="text-destructive" role="alert">
          That did not work: {error}
        </span>
      )}
    </span>
  );
}
