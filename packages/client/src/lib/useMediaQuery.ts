import { useEffect, useState } from 'react';

/** Wide enough for the sidebar and comments to sit beside the panes (`dock:` in theme.css). */
export const DOCK_QUERY = '(min-width: 62.5rem)';
/** Wide enough for the document and chat side by side (`split:` in theme.css). */
export const SPLIT_QUERY = '(min-width: 51.25rem)';

const list = (query: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);

/** Whether a media query matches, following changes. Without matchMedia (tests) it matches. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => list(query)?.matches ?? true);
  useEffect(() => {
    const mql = list(query);
    if (!mql) return;
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}
