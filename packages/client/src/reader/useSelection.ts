/**
 * The pupil's selection on the reading as a highlight's range (#213), read on `selectionchange`,
 * so a mouse, touch or keyboard selection all count. Focus in the highlight bar keeps the last
 * range, so a button there still has it. `onSelect` runs when a new range is read.
 */
import { useEffect, useState, type RefObject } from 'react';
import { rangeFromSelection, type SelectedRange } from './selection';

export function useSelection(article: RefObject<HTMLElement | null>, onSelect: () => void): [SelectedRange | null, (r: SelectedRange | null) => void] {
  const [selected, setSelected] = useState<SelectedRange | null>(null);
  useEffect(() => {
    const onChange = () => {
      const sel = document.getSelection();
      const inBar = document.activeElement?.closest('[data-reader-bar]');
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (!inBar) setSelected(null);
        return;
      }
      const r = sel.getRangeAt(0);
      if (!article.current?.contains(r.commonAncestorContainer)) return;
      setSelected(rangeFromSelection(r));
      onSelect();
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [article, onSelect]);
  return [selected, setSelected];
}
