import { useState } from 'react';

/**
 * The same value back while its key is unchanged, so what is built from it (an editor doc, a
 * pane) is only built again when it changed. The replay makes new objects every frame.
 */
export function useSame<T>(value: T, key: string): T {
  const [kept, setKept] = useState({ key, value });
  if (kept.key !== key) {
    setKept({ key, value });
    return value;
  }
  return kept.value;
}
