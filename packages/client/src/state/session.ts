/** Participant session bootstrap: resolves the session id from the link token, then loads the session. */
import { useEffect, useState } from 'react';
import { fetchSession, resolveSessionId } from '../api/participant';
import type { SessionInfo } from '../api/types';

export interface SessionState {
  sessionId: string | null;
  session: SessionInfo | null;
  error: string | null;
}

/**
 * Resolving the link records an open on the server, so do it once per page load and token:
 * React's StrictMode (in development) runs effects twice, which logged every open twice.
 */
const resolved = new Map<string, Promise<string>>();
export function resolveOnce(token: string): Promise<string> {
  let p = resolved.get(token);
  if (!p) {
    p = resolveSessionId(token);
    resolved.set(token, p);
    // A failed lookup may be retried on the next mount.
    p.catch(() => resolved.delete(token));
  }
  return p;
}

export function useSession(token: string): SessionState {
  const [state, setState] = useState<SessionState>({ sessionId: null, session: null, error: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await resolveOnce(token);
        if (cancelled) return;
        setState((s) => ({ ...s, sessionId: id }));
        const session = await fetchSession(token, id);
        if (!cancelled) setState({ sessionId: id, session, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
