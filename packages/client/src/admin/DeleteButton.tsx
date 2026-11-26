import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { AdminApi } from '../api/admin';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { IconButton } from './IconButton';

/** What the admin types to unlock the delete. */
export const CONFIRM_WORD = 'DELETE';

export interface DeleteButtonProps {
  api: Pick<AdminApi, 'deleteSession'>;
  sessionId: string;
  /** Named in the confirmation, so the right workspace is deleted. */
  label: string;
  onDeleted: () => void;
}

/**
 * A bin icon, then a confirmation in place: deleting removes the workspace's data for good, so
 * "Delete for good" stays off until the box holds exactly DELETE.
 */
export function DeleteButton({ api, sessionId, label, onDeleted }: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed === CONFIRM_WORD && !busy;
  async function remove() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteSession(sessionId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  function cancel() {
    setConfirming(false);
    setTyped('');
    setError(null);
  }
  if (!confirming) {
    return <IconButton icon={Trash2} danger label={`Delete ${label}`} title="Delete the workspace and all its data" onClick={() => setConfirming(true)} />;
  }
  return (
    <form
      className="inline-flex max-w-60 flex-wrap items-center gap-x-2.5 gap-y-1.5 whitespace-normal wrap-anywhere"
      role="group"
      aria-label={`Delete ${label}`}
      onSubmit={(e) => {
        e.preventDefault();
        void remove();
      }}
    >
      <span>
        Delete “{label}” and all its data? This cannot be undone. Type {CONFIRM_WORD} to confirm.
      </span>
      <Input
        className="w-28 py-0.75 font-mono"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label={`Type ${CONFIRM_WORD} to delete ${label}`}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        disabled={busy}
      />
      <Button type="submit" variant="link-danger" disabled={!ready}>
        {busy ? 'Deleting…' : 'Delete for good'}
      </Button>
      <Button variant="link" onClick={cancel} disabled={busy}>
        Cancel
      </Button>
      {error && (
        <span className="text-destructive" role="alert">
          Delete failed: {error}
        </span>
      )}
    </form>
  );
}
