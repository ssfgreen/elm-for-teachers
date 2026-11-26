import { useEffect, type RefObject } from 'react';

/** Closes a popup menu on a click outside `ref` or on Escape. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement>, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onEvent = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onEvent);
    document.addEventListener('keydown', onEvent);
    return () => {
      document.removeEventListener('pointerdown', onEvent);
      document.removeEventListener('keydown', onEvent);
    };
  }, [open, ref, close]);
}
