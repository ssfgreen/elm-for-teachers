/**
 * The studio's "Open in Elm" link: `<elm>/#add-draft=<draft address>`. The address holds the
 * draft's secret code, so it is taken out of the address bar as soon as the app starts
 * (`takeAddDraftLink`, called in main.tsx), kept in memory only, and handed to the Plugins
 * screen once (`takePendingDraft`), which offers to add it. It is never logged or stored.
 */

const PREFIX = '#add-draft=';

/** The address in an `#add-draft=` hash, or null for any other hash. */
export function parseAddDraftHash(hash: string): string | null {
  if (!hash.startsWith(PREFIX)) return null;
  let address: string;
  try {
    address = decodeURIComponent(hash.slice(PREFIX.length)).trim();
  } catch {
    return null;
  }
  return address || null;
}

let pending: string | null = null;

/**
 * Reads an `#add-draft=` link from the address bar and removes it at once, keeping the rest of
 * the address and the router's state. Any other hash is left alone.
 */
export function takeAddDraftLink(loc: Location = window.location, history: History = window.history): void {
  const hash = loc.hash;
  if (!hash.startsWith(PREFIX)) return;
  history.replaceState(history.state, '', loc.pathname + loc.search);
  pending = parseAddDraftHash(hash) ?? pending;
}

/** Whether a link is waiting for the Plugins screen (the workspace opens that screen). */
export function hasPendingDraft(): boolean {
  return pending !== null;
}

/** The waiting address, once: the next call gives null. */
export function takePendingDraft(): string | null {
  const address = pending;
  pending = null;
  return address;
}
