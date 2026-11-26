import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { IconButton } from '../editor/Toolbar.js';
import type { ExportFormat } from '../state/exportDoc';
import { useDismiss } from './useDismiss';
import { MakeSlot, useMakeZone } from './slots/slots';
import { cn } from '../lib/utils';

/** The doc header's drop-down menus (Documents, Download): a card under the button, flush right. */
export const menuListClass = 'absolute top-full right-0 z-40 mt-1 w-70 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-float';
/** A line in one of those menus (also the comment menu's). */
export const menuItemClass = 'flex w-full items-center justify-between gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-base text-foreground hover:bg-hover';
export const menuNameClass = 'min-w-0 truncate';

const FORMATS: Array<{ format: ExportFormat; label: string }> = [
  { format: 'docx', label: 'Word (.docx)' },
  { format: 'markdown', label: 'Markdown (.md)' },
  { format: 'json', label: 'JSON (.json)' },
];

/** "Download": the open doc as a file. Suggestions not yet accepted are left out. */
export function ExportMenu({ onExport }: { onExport: (format: ExportFormat) => void }) {
  const [chosen, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(chosen, ref, close);
  // On the make kit's board the menu opens while a card is being placed in it or one in it is
  // highlighted, and stays open (so a card put there can be seen) until a click elsewhere; the
  // button counts the cards inside.
  const kit = useMakeZone('export');
  const wanted = !!kit?.wanted;
  useEffect(() => {
    if (wanted) setOpen(true);
  }, [wanted]);
  const open = chosen || wanted;
  return (
    <div className="relative" ref={ref}>
      <IconButton icon={Download} label="Download" tipAlign="end" active={open} onClick={() => setOpen((o) => !o)} />
      {!!kit?.count && !open && (
        <span className="pointer-events-none absolute top-px right-0 h-3.75 min-w-3.75 rounded-md bg-primary px-0.75 text-center text-2xs leading-3.75 text-primary-foreground" aria-hidden="true">
          {kit.count}
        </span>
      )}
      {open && (
        <div className={cn(menuListClass, 'w-55')} role="menu" aria-label="Download">
          {FORMATS.map((f) => (
            <button
              key={f.format}
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                setOpen(false);
                onExport(f.format);
              }}
            >
              {f.label}
            </button>
          ))}
          <MakeSlot zone="export" />
          <div className="mt-1 border-t border-border px-2.5 pt-1.5 pb-1.25 text-xs text-muted-foreground">Suggestions you have not accepted are left out.</div>
        </div>
      )}
    </div>
  );
}
