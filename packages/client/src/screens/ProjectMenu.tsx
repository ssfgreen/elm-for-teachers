/**
 * The "…" menu on a project's page: Archive (a second click to confirm; its chats are kept) and
 * Delete (the project and its chats, only once the teacher has typed DELETE).
 */
import { useCallback, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useDismiss } from '../components/useDismiss';
import { cn } from '../lib/utils';

const actionsClass = 'flex items-center justify-end gap-4';
const itemClass = 'flex w-full items-center justify-between gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-base hover:bg-hover';
/** The "…" menu's pop-up, under the button at its right edge. */
const popClass = 'absolute top-full mt-1 right-0 left-auto z-40 w-65 rounded-md border border-border bg-card p-1 shadow-float';

/** What the teacher types to delete. */
export const DELETE_WORD = 'DELETE';

type Action = 'archive' | 'delete';

export function ProjectMenu({ onArchive, onDelete }: { onArchive: () => Promise<void>; onDelete?: () => Promise<void> }) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'confirm' | 'busy'>('closed');
  const [action, setAction] = useState<Action>('archive');
  const [typed, setTyped] = useState('');
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMode((m) => (m === 'busy' ? m : 'closed')), []);
  useDismiss(mode === 'menu' || mode === 'confirm', ref, close);
  const confirm = (a: Action) => {
    setAction(a);
    setTyped('');
    setFailed(false);
    setMode('confirm');
  };
  const run = async () => {
    setMode('busy');
    setFailed(false);
    try {
      await (action === 'delete' ? onDelete?.() : onArchive());
    } catch {
      setFailed(true);
      setMode('confirm');
    }
  };
  const deleting = action === 'delete';
  const ready = !deleting || typed === DELETE_WORD;
  return (
    <div className="relative flex-none" ref={ref}>
      <Button variant="toolbar" size="icon" aria-label="Project options" aria-haspopup="menu" aria-expanded={mode !== 'closed'} onClick={() => setMode((m) => (m === 'closed' ? 'menu' : 'closed'))}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </Button>
      {mode === 'menu' && (
        <div className={popClass} role="menu">
          <button type="button" role="menuitem" className={cn(itemClass, 'text-foreground')} onClick={() => confirm('archive')}>
            <span className="min-w-0 truncate">Archive project</span>
          </button>
          {onDelete && (
            <button type="button" role="menuitem" className={cn(itemClass, 'text-destructive')} onClick={() => confirm('delete')}>
              <span className="min-w-0 truncate">Delete project</span>
            </button>
          )}
        </div>
      )}
      {(mode === 'confirm' || mode === 'busy') && (
        <form
          className={popClass}
          role="dialog"
          aria-label={deleting ? 'Delete project' : 'Archive project'}
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && mode === 'confirm') void run();
          }}
        >
          {deleting ? (
            <>
              <p className="mx-2 mt-1.5 mb-2 text-md">Delete this project and all its chats? You cannot get them back.</p>
              <label className="mx-2 mb-2.5 flex flex-col gap-1 text-sm text-foreground-2">
                Type {DELETE_WORD} to confirm
                <Input value={typed} autoFocus autoComplete="off" spellCheck={false} disabled={mode === 'busy'} onChange={(e) => setTyped(e.target.value)} />
              </label>
            </>
          ) : (
            <p className="mx-2 mt-1.5 mb-2.5 text-md">Archive this project? It leaves the sidebar; its chats move back to the chats list.</p>
          )}
          {failed && (
            <p className="error-text" role="alert">
              It could not be {deleting ? 'deleted' : 'archived'}. Please try again.
            </p>
          )}
          <div className={cn(actionsClass, 'px-2 pb-1.5')}>
            <Button type="button" variant="link" disabled={mode === 'busy'} onClick={() => setMode('closed')}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mode === 'busy' || !ready}>
              {deleting ? 'Delete' : 'Archive'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
