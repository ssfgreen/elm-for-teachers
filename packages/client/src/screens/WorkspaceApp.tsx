import { useEffect, useMemo, useRef, useState } from 'react';
import { createSessionApi } from '../api/participant';
import { featureApi } from '../state/features';
import type { EventContext, EventLogger } from '../events/logger';
import { createEventLogger } from '../events/logger';
import { createFocusPaneState } from '../events/trackers';
import { useSession } from '../state/session';
import { WorkspaceScreen } from './WorkspaceScreen';
import { ClaimsProvider } from '../components/pedagogy/claims';
import { useAppHeight } from '../lib/useAppHeight';

/** A plain message in a card, for a link that does not work or is loading. */
export const plainScreenClass = 'mx-auto my-20 max-w-136 rounded-lg border border-border bg-card p-8 text-foreground-2 shadow-card';

/**
 * The workspace a participant token belongs to: loads it, starts the event logger and shows
 * the screen. `/s/:token` (ParticipantApp) hands it the token from the link.
 */
export function WorkspaceApp({ token }: { token: string }) {
  const { sessionId, session, error } = useSession(token);
  const [focusState] = useState(() => createFocusPaneState());
  const context = useRef<EventContext>({ doc_id: null, thread_id: null });
  const [logger, setLogger] = useState<EventLogger | null>(null);
  const [failing, setFailing] = useState(false);
  // Interaction logging: the session's setting, then whatever the server last said with a batch.
  const [interactions, setInteractions] = useState<boolean | null>(null);
  useAppHeight();
  const batchMs = session?.config.thresholds.event_batch_ms;

  useEffect(() => {
    if (!sessionId || batchMs === undefined) return;
    const l = createEventLogger({
      sessionId,
      participantToken: token,
      batchMs,
      maxBatch: 100,
      getContext: () => context.current,
      getFocusPane: focusState.get,
      onAck: (ack) => setInteractions(ack.interactions),
    });
    setLogger(l);
    const off = l.onError(() => setFailing(true));
    const check = setInterval(() => {
      if (l.pending() === 0) setFailing(false);
    }, 2000);
    return () => {
      off();
      clearInterval(check);
      l.stop();
    };
  }, [sessionId, token, batchMs, focusState]);

  const uploads = session?.config.uploads;
  const features = session?.config.features;
  const api = useMemo(() => (sessionId ? featureApi(createSessionApi(token, sessionId, { uploads }), features) : null), [token, sessionId, uploads, features]);

  if (error && !session) {
    return (
      <main className={plainScreenClass}>
        <p className="mt-4">This link could not be opened. Please check it, or ask for a new one.</p>
      </main>
    );
  }
  if (!session || !logger || !api) {
    return (
      <main className={plainScreenClass}>
        <p className="mt-4">Loading…</p>
      </main>
    );
  }

  // Exactly the visible window (above a phone's keyboard too): it never scrolls as a page;
  // the panes scroll on their own.
  // `relative` keeps absolutely placed content (each chat message's screen-reader label)
  // inside it, so a long chat's labels cannot make the page scroll.
  return (
    <div className="relative flex h-(--app-height,100dvh) flex-col overflow-hidden">
      {failing && (
        <div className="border-b border-destructive-border bg-destructive-soft px-4 py-2.25 text-base text-destructive" role="alert">
          Connection problem: your work is being kept and will be saved when the connection returns.
        </div>
      )}
      <ClaimsProvider fetchClaims={api.pedagogyClaims}>
        <WorkspaceScreen session={session} api={api} logger={logger} focusState={focusState} context={context} interactions={interactions ?? session.config.interactions ?? false} />
      </ClaimsProvider>
    </div>
  );
}
