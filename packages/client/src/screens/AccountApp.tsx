/**
 * The signed-in route `/w`: asks the server whose workspace this is, shows the "Before you
 * start" notice until it is ticked, then draws the same workspace a link does. The workspace
 * token stays in memory (state/account.ts); it is never in the address or in storage.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { AccountContext, type AccountContextValue, type SaveWork } from '../components/sidebar/accountContext';
import { DASHBOARD_PATH, needsNotice, saveBeforeLeaving, signInNotice, useAccountWorkspace, type SignInNotice } from '../state/account';
import { plainScreenClass, WorkspaceApp } from './WorkspaceApp';

/** Where signing out lands; the sign-in page says "You have signed out." for it. */
export const SIGNED_OUT_PATH = '/signin?signed_out=1';

const reloadPage = () => window.location.reload();

interface AccountAppProps {
  notice?: SignInNotice;
  /**
   * Leaves the app after signing out or for the dashboard. A full page load, not a route
   * change, so nothing that held the token (state, caches keyed by it) is left in memory.
   */
  leaveTo?: (path: string) => void;
  /** Loads the page afresh; used when Back brings it out of the back-forward cache. */
  reload?: () => void;
}

export function AccountApp({
  notice = signInNotice,
  leaveTo = (path) => window.location.assign(path),
  reload = reloadPage,
}: AccountAppProps) {
  const { state, accept, leave, retry } = useAccountWorkspace();
  const save = useRef<SaveWork | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  /** The cover's message while pending work is saved before leaving, or null. */
  const [cover, setCover] = useState<string | null>(null);

  /** Set once the page is being left on purpose (Dashboard, Sign out); cleared if that fails. */
  const leaving = useRef(false);

  // Typing after the save began would be lost, so the workspace takes no input from here on:
  // inert stops the keyboard as well as the mouse (the cover alone stops only the mouse). Set
  // on the element at once, not through state, so it holds before the save's first step.
  const holdStill = useCallback((message: string) => {
    leaving.current = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    workspace.current?.setAttribute('inert', '');
    setCover(message);
  }, []);

  const signOut = useCallback(async () => {
    holdStill('Saving your work and signing out…');
    try {
      await leave(save.current);
    } catch (err) {
      workspace.current?.removeAttribute('inert');
      leaving.current = false;
      setCover(null);
      throw err;
    }
  }, [holdStill, leave]);

  // As "Sign out" does, but stays signed in. The cover stays up until the page is gone.
  const openDashboard = useCallback(async () => {
    holdStill('Saving your work…');
    await saveBeforeLeaving(save.current);
    leaveTo(DASHBOARD_PATH);
  }, [holdStill, leaveTo]);

  const registerSave = useCallback((fn: SaveWork) => {
    save.current = fn;
    return () => {
      if (save.current === fn) save.current = null;
    };
  }, []);

  const account = state.status === 'ready' ? state.workspace.account : null;
  const email = account?.email ?? null;
  const displayName = account?.display_name ?? null;
  const isAdmin = account?.is_admin === true;
  const context = useMemo<AccountContextValue>(
    () => ({ email, displayName, isAdmin, signOut, openDashboard, registerSave }),
    [email, displayName, isAdmin, signOut, openDashboard, registerSave],
  );

  // Back after Dashboard or Sign out can bring this page out of the browser's back-forward
  // cache as it was left: covered and inert. Load it afresh instead, which also keeps the
  // rule that nothing that held the token stays in memory after leaving. Only then: a page
  // left another way (an address typed, a link) comes back as it was, and its unsent typing
  // (the editor's batch, the logger's queue) is still sent; a reload would lose it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && leaving.current) reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [reload]);

  const left = state.status === 'left';
  useEffect(() => {
    if (left) leaveTo(SIGNED_OUT_PATH);
  }, [left, leaveTo]);

  if (state.status === 'signed_out') return <Navigate to="/signin" replace />;
  if (state.status === 'left') return <Plain>Signing out…</Plain>;
  if (state.status === 'loading') return <Plain>Loading…</Plain>;
  if (state.status === 'error') {
    return (
      <main className={plainScreenClass}>
        <p className="mt-4" role="alert">
          Your workspace could not be opened. Please check your connection and try again.
        </p>
        <Button className="mt-4" onClick={retry}>
          Try again
        </Button>
      </main>
    );
  }
  if (needsNotice(state.workspace.account, notice)) return <NoticeCard notice={notice} onAccept={() => accept(notice.version)} />;

  return (
    <AccountContext.Provider value={context}>
      {/* `contents`: no box of its own, so the workspace is laid out as at /s/:token. */}
      <div className="contents" ref={workspace}>
        <WorkspaceApp token={state.workspace.token} />
      </div>
      {cover && (
        // Says why the workspace has stopped answering while pending work is saved.
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70" role="status">
          <p className="rounded-lg border border-border bg-card px-6 py-4 text-foreground shadow-card">{cover}</p>
        </div>
      )}
    </AccountContext.Provider>
  );
}

function Plain({ children }: { children: string }) {
  return (
    <main className={plainScreenClass}>
      <p className="mt-4">{children}</p>
    </main>
  );
}

/** "Before you start": the notice's text from config, a tick box, and Continue once it is ticked. */
export function NoticeCard({ notice, onAccept }: { notice: SignInNotice; onAccept: () => Promise<void> }) {
  const [ticked, setTicked] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const titleId = useId();

  const submit = async () => {
    setState('busy');
    try {
      await onAccept();
    } catch {
      setState('failed');
    }
  };

  return (
    <main className={plainScreenClass} aria-labelledby={titleId}>
      <h1 id={titleId} className="text-foreground">
        {notice.title}
      </h1>
      {notice.paragraphs.map((parts, i) => (
        <p key={i} className="mt-4 wrap-anywhere">
          {parts.map((part, j) =>
            typeof part === 'string' ? (
              part
            ) : (
              <a key={j} className="text-primary underline underline-offset-2" href={part.href} target="_blank" rel="noopener noreferrer">
                {part.text}
              </a>
            ),
          )}
        </p>
      ))}
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ticked && state !== 'busy') void submit();
        }}
      >
        <label className="flex items-center gap-2 text-foreground">
          <input className="m-0" type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
          {notice.accept_label}
        </label>
        <Button className="mt-4" variant="primary" type="submit" disabled={!ticked || state === 'busy'}>
          {state === 'busy' ? 'Saving…' : notice.continue_label}
        </Button>
        {state === 'failed' && (
          <p className="mt-3 text-destructive" role="alert">
            That could not be saved. Please try again.
          </p>
        )}
      </form>
    </main>
  );
}
