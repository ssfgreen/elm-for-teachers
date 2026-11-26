/**
 * The bar at the foot of the reader (#213): with text selected, the five categories and plain
 * "Highlight"; with a highlight picked, Remove. Either way `asks` (AskButtons, #236) follows.
 * Buttons keep the selection on a mouse press, so the pupil's selection is still there when the
 * click lands; every button works from the keyboard. ReaderScreen places it at the foot.
 */
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { HIGHLIGHT_CATEGORIES, type Highlight, type HighlightCategory } from '@edw/shared';
import { Button } from '../components/ui/button';
import { categoryClass, categoryLabel } from './marks';

interface Props {
  /** Text is selected: offer the categories. */
  selecting: boolean;
  picked: Highlight | null;
  onHighlight: (category: HighlightCategory | null) => void;
  onRemove: (h: Highlight) => void;
  onCancel: () => void;
  /** "Ask about this", for the selection or the picked highlight. */
  asks?: ReactNode;
}

const keep = (e: MouseEvent) => e.preventDefault();

export function HighlightBar({ selecting, picked, onHighlight, onRemove, onCancel, asks }: Props) {
  const remove = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (picked) remove.current?.focus();
  }, [picked]);
  if (!picked && !selecting) return null;
  return (
    <div role="toolbar" aria-label={picked ? 'Highlight' : 'Highlight the selected text'} data-reader-bar onKeyDown={(e) => e.key === 'Escape' && onCancel()} className="border-t border-border bg-card p-3 shadow-card">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
        {picked ? (
          <>
            <span className="mr-2">
              <span className={`${categoryClass(picked.category)} rounded-sm px-1`}>{categoryLabel(picked.category)}</span>
            </span>
            <Button ref={remove} variant="primary" onClick={() => onRemove(picked)}>
              Remove
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {HIGHLIGHT_CATEGORIES.map((c) => (
              <Button key={c.id} variant="default" onMouseDown={keep} onClick={() => onHighlight(c.id)}>
                <span aria-hidden className={`${categoryClass(c.id)} inline-block size-3 rounded-sm`} />
                {c.label}
              </Button>
            ))}
            <Button variant="default" onMouseDown={keep} onClick={() => onHighlight(null)}>
              <span aria-hidden className={`${categoryClass(null)} inline-block size-3 rounded-sm`} />
              Highlight
            </Button>
          </>
        )}
        {asks}
      </div>
    </div>
  );
}
