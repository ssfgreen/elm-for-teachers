import { useEffect, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface DrawerProps {
  /** Docked (a wide window), the content sits in the layout as it is and this adds nothing. */
  docked: boolean;
  open: boolean;
  side: 'left' | 'right';
  /** The content's width in px; it never takes more than 85% of the window. */
  width: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A side pane that, in a narrow window, slides over the others instead of taking room beside
 * them. A click on the shade behind it, or Escape, closes it.
 */
export function Drawer({ docked, open, side, width, label, onClose, children }: DrawerProps) {
  useEffect(() => {
    if (docked || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [docked, open, onClose]);
  if (docked) return <>{children}</>;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="false" aria-label={label}>
      <button type="button" className="absolute inset-0 cursor-default border-0 bg-overlay" aria-label={`Close ${label.toLowerCase()}`} tabIndex={-1} onClick={onClose} />
      <div
        className={cn('relative flex h-full max-w-[85vw] bg-background shadow-float *:w-full', side === 'right' && 'ml-auto')}
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}
