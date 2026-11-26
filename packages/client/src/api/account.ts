/**
 * Calls for a signed-in person. They carry the sign-in cookie (HttpOnly, sent by the browser
 * to this site), never a token: the workspace token comes back from `fetchAccountWorkspace`.
 */
import { endpoints } from './endpoints';
import { api } from './http';

export interface AccountInfo {
  provider: string;
  email: string | null;
  display_name: string | null;
  /** The version of the "Before you start" notice this person ticked, if any. */
  notice_version: string | null;
  is_admin?: boolean;
}

export interface AccountWorkspace {
  session_id: string;
  /** The workspace token, used exactly as the one in `/s/:token`. Keep it in memory only. */
  token: string;
  account: AccountInfo;
}

/** The signed-in person's workspace. 401 (an ApiError) when not signed in. */
export const fetchAccountWorkspace = () => api<AccountWorkspace>('GET', endpoints.accountWorkspace());

/** Records that the person ticked this version of the notice. */
export const acceptNotice = (version: string) => api<void>('POST', endpoints.accountNotice(), { version });

/** Ends the sign-in on the server and clears its cookie. The workspace token outlives it: drop it. */
export const signOut = () => api<void>('POST', endpoints.signOut());
