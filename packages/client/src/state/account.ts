/**
 * The signed-in workspace's state: the workspace token (in memory only, never in storage or
 * the address), the account, the "Before you start" notice, and the order of signing out.
 * The pure parts are tested without React.
 */
import { useCallback, useEffect, useState } from 'react';
import noticeConfig from '../../../../config/sign-in-notice.json';
import { acceptNotice, fetchAccountWorkspace, signOut, type AccountInfo, type AccountWorkspace } from '../api/account';
import { ApiError } from '../api/http';
import { settleWithin } from '../lib/settle';

/* ----------------------------------------------------------------- the notice */

/** A piece of a paragraph: plain text, or a link (opened in a new tab). */
export type NoticePart = string | { text: string; href: string };

export interface SignInNotice {
  /** Change it when the text changes: everyone is then shown the notice again. */
  version: string;
  title: string;
  paragraphs: NoticePart[][];
  accept_label: string;
  continue_label: string;
}

/** The notice in config/sign-in-notice.json. The wording is Sam's: change it there, with the version. */
export const signInNotice: SignInNotice = noticeConfig;

/** Whether this person has still to tick the notice as it now stands. */
export function needsNotice(account: Pick<AccountInfo, 'notice_version'>, notice: Pick<SignInNotice, 'version'> = signInNotice): boolean {
  return account.notice_version !== notice.version;
}

/* ------------------------------------------------------------------ signing out */

/** Where the Dashboard link goes (admins only). */
export const DASHBOARD_PATH = '/admin';

/** The longest leaving (signing out, or going to the dashboard) waits for pending work: the same limit as before a chat turn. */
export const SIGN_OUT_SAVE_LIMIT_MS = 5000;

/**
 * Saves pending work before leaving /w, given up on after `limitMs`, or if it fails: the
 * logger's flush never resolves while the server refuses a batch. Never rejects.
 */
export async function saveBeforeLeaving(save: (() => Promise<void>) | null, limitMs = SIGN_OUT_SAVE_LIMIT_MS): Promise<void> {
  if (save) await settleWithin(save(), limitMs);
}

/**
 * Signing out, in order: save pending work (given up on after `limitMs`, or if it fails: the
 * logger's flush never resolves while the server refuses a batch), then end the sign-in.
 * Rejects when the server could not be told, so the person is not shown "signed out" falsely.
 */
export async function saveThenSignOut(steps: { save: (() => Promise<void>) | null; end: () => Promise<void>; limitMs?: number }): Promise<void> {
  await saveBeforeLeaving(steps.save, steps.limitMs);
  await steps.end();
}

/* --------------------------------------------------------------------- the hook */

export type AccountState =
  | { status: 'loading' }
  /** Signed in: the token lives here and nowhere else. */
  | { status: 'ready'; workspace: AccountWorkspace }
  /** The server said 401: not signed in, or the sign-in has ended. */
  | { status: 'signed_out' }
  /** Signed out by choice: the token is dropped. */
  | { status: 'left' }
  | { status: 'error' };

export interface AccountHook {
  state: AccountState;
  /** Records the tick for the notice's version; rejects when it could not be saved. */
  accept: (version: string) => Promise<void>;
  /** Saves pending work, ends the sign-in, then drops the token. Rejects (and keeps the token) when the server could not be told. */
  leave: (save: (() => Promise<void>) | null) => Promise<void>;
  retry: () => void;
}

/** Asks the server whose workspace this is, once per mount (and per `retry`). */
export function useAccountWorkspace(): AccountHook {
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAccountWorkspace().then(
      (workspace) => {
        if (!cancelled) setState({ status: 'ready', workspace });
      },
      (err: unknown) => {
        if (!cancelled) setState({ status: err instanceof ApiError && err.status === 401 ? 'signed_out' : 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const accept = useCallback(async (version: string) => {
    await acceptNotice(version);
    setState((s) => (s.status === 'ready' ? { status: 'ready', workspace: { ...s.workspace, account: { ...s.workspace.account, notice_version: version } } } : s));
  }, []);

  const leave = useCallback(async (save: (() => Promise<void>) | null) => {
    await saveThenSignOut({ save, end: signOut });
    setState({ status: 'left' });
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, accept, leave, retry };
}
