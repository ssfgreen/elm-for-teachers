/**
 * What a signed-in workspace (`/w`, screens/AccountApp.tsx) gives the parts inside it: who is
 * signed in, "Sign out", and for an admin the way to the dashboard. A workspace opened by link
 * (`/s/:token`) has none, so the account menu shows no "Sign out" there, and there is no Dashboard.
 *
 * It also runs the other way: the workspace tells the account how to save pending work
 * (`useSaveBeforeSignOut`), so signing out, or going to the dashboard, can wait for it without
 * the screen being involved.
 */
import { createContext, useContext, useEffect, useRef } from 'react';

export type SaveWork = () => Promise<void>;

export interface AccountContextValue {
  /** For the menu. Never put these in an event or a model call. */
  email: string | null;
  displayName: string | null;
  /** From the account (`is_admin`). Only shows the Dashboard link: /api/admin/* checks for itself. */
  isAdmin: boolean;
  /** Saves pending work (at most 5 s), ends the sign-in and leaves. Rejects when the server could not be told. */
  signOut: () => Promise<void>;
  /** Saves pending work (at most 5 s), then leaves for /admin by a full page load. Stays signed in. */
  openDashboard: () => Promise<void>;
  /** The workspace's way to save pending work; the answer takes it back. One at a time. */
  registerSave: (save: SaveWork) => () => void;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

/** The signed-in account, or null in a workspace opened by link. */
export const useSignedIn = (): AccountContextValue | null => useContext(AccountContext);

/** Tells a signed-in workspace how to save pending work before leaving it ("Sign out", Dashboard). Does nothing elsewhere. */
export function useSaveBeforeSignOut(save: SaveWork): void {
  const register = useContext(AccountContext)?.registerSave;
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => register?.(() => latest.current()), [register]);
}
