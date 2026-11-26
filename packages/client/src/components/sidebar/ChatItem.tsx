/** A chat in the sidebar, and its documents under it. Taken out of ThreadSidebar unchanged. */
import { useCallback, useRef, useState } from 'react';
import { FileText, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Doc, Thread } from '@edw/shared';
import { useDismiss } from '../useDismiss';
import { MakeSlot, useInMakeKit } from '../slots/slots';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { docPopClass, itemClass, menuItem } from './styles';

export interface ChatDocs {
  list: Doc[];
  activeDocId: string | null;
  onOpen: (threadId: string, docId: string) => void;
  onDelete?: (threadId: string, docId: string) => Promise<void>;
}

const DOC_ICON = { size: 14, 'aria-hidden': true, className: 'flex-none text-foreground-2' } as const;

/**
 * A chat in the sidebar. Open, its documents are listed under it (a click opens one, and a
 * click on the chat folds them away); otherwise a doc icon at its end names them on hover.
 */
export function ChatItem({
  thread,
  active,
  expanded,
  onToggle,
  depth = 0,
  docs,
  onSelect,
}: {
  thread: Thread;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  depth?: number;
  docs?: ChatDocs;
  onSelect: (id: string) => void;
}) {
  const names = docs?.list.map((d) => d.name) ?? [];
  const listed = active && expanded && !!docs && docs.list.length > 0;
  const peek = !listed && names.length > 0;
  return (
    <li className="relative">
      <button
        type="button"
        className={cn(itemClass(active), peek && 'pr-8', depth && 'pl-6.5')}
        aria-current={active ? 'true' : undefined}
        aria-expanded={active && names.length > 0 ? expanded : undefined}
        title={thread.title}
        onClick={() => (active ? onToggle() : onSelect(thread.id))}
      >
        {thread.title}
      </button>
      {peek && (
        <span
          className={cn(
            'absolute top-1/2 right-2 flex -translate-y-1/2 items-center rounded-sm p-0.75 text-foreground-2 outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring',
            'after:pointer-events-none after:absolute after:top-full after:right-0 after:z-30 after:mt-1 after:w-max after:max-w-56 after:rounded-sm after:bg-foreground after:px-2 after:py-0.75 after:text-left after:text-xs after:leading-snug after:whitespace-pre-line after:text-background after:opacity-0 after:transition-opacity after:duration-75 after:content-[attr(data-tip)] hover:after:opacity-100 hover:after:delay-150 focus-visible:after:opacity-100',
          )}
          role="img"
          tabIndex={0}
          aria-label={`Documents: ${names.join(', ')}`}
          data-tip={names.join('\n')}
        >
          <FileText {...DOC_ICON} />
        </span>
      )}
      {listed && docs && (
        <ul className="m-0 list-none p-0" aria-label={`Documents in ${thread.title}`}>
          {docs.list.map((d) => (
            <DocRow key={d.id} doc={d} open={d.id === docs.activeDocId} depth={depth} onOpen={docs.onOpen} onDelete={docs.onDelete} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A doc under its chat: a click opens it; "…" (shown on hover or focus) has Delete, which asks first. */
function DocRow({
  doc,
  open,
  depth,
  onOpen,
  onDelete,
}: {
  doc: Doc;
  open: boolean;
  depth: number;
  onOpen: (threadId: string, docId: string) => void;
  onDelete?: (threadId: string, docId: string) => Promise<void>;
}) {
  const inKit = useInMakeKit();
  const [mode, setMode] = useState<'closed' | 'menu' | 'confirm' | 'busy'>('closed');
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const close = useCallback(() => setMode((m) => (m === 'busy' ? m : 'closed')), []);
  useDismiss(mode === 'menu' || mode === 'confirm', ref, close);
  const remove = async () => {
    setMode('busy');
    setFailed(false);
    try {
      await onDelete!(doc.thread_id, doc.id);
    } catch {
      setFailed(true);
      setMode('confirm');
    }
  };
  return (
    <li ref={ref}>
      <div className="group/doc relative">
      <button
        type="button"
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-sm border-0 bg-transparent py-1.25 text-left text-md',
          depth ? 'pl-11' : 'pl-6.5',
          onDelete ? 'pr-8' : 'pr-2.5',
          open ? 'font-medium text-foreground' : 'text-foreground-2 hover:bg-hover hover:text-foreground',
        )}
        aria-current={open ? 'true' : undefined}
        title={doc.name}
        onClick={() => onOpen(doc.thread_id, doc.id)}
      >
        <FileText {...DOC_ICON} />
        <span className="min-w-0 truncate">{doc.name}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          className={cn(
            'absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm border-0 bg-transparent text-foreground-2 outline-none hover:bg-pressed hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring',
            mode === 'closed' && 'opacity-0 group-hover/doc:opacity-100 focus-visible:opacity-100',
          )}
          aria-label={`Options for ${doc.name}`}
          aria-haspopup="menu"
          aria-expanded={mode !== 'closed'}
          onClick={() => setMode((m) => (m === 'closed' ? 'menu' : 'closed'))}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      )}
      {mode === 'menu' && (
        <div className={docPopClass} role="menu" aria-label={`Options for ${doc.name}`}>
          <button type="button" role="menuitem" className={cn(menuItem, 'text-destructive')} onClick={() => setMode('confirm')}>
            <Trash2 size={14} aria-hidden="true" />
            <span className="min-w-0 truncate">Delete</span>
          </button>
        </div>
      )}
      {(mode === 'confirm' || mode === 'busy') && (
        <div className={docPopClass} role="dialog" aria-label="Delete document">
          <p className="mx-1.5 mt-1 mb-2 text-md">
            Delete <strong className="font-semibold">{doc.name}</strong>? Are you sure?
          </p>
          {failed && (
            <p className="mx-1.5 mb-2 text-sm text-destructive" role="alert">
              It could not be deleted. Please try again.
            </p>
          )}
          <div className="flex justify-end gap-2 px-1.5 pb-1">
            <Button size="sm" disabled={mode === 'busy'} onClick={() => setMode('closed')}>
              No
            </Button>
            <Button size="sm" variant="primary" disabled={mode === 'busy'} onClick={() => void remove()}>
              Yes
            </Button>
          </div>
        </div>
      )}
      </div>
      {/* The make kit's "On a document" place. */}
      {open && inKit && (
        <div className={depth ? 'pl-11' : 'pl-6.5'}>
          <MakeSlot zone="docitem" />
        </div>
      )}
    </li>
  );
}
