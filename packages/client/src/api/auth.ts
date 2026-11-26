/** The front door's calls: sign-in providers, opening a workspace by access code, and who is signed in. */
import { fetchAccountWorkspace } from './account';
import { endpoints } from './endpoints';
import { api, ApiError } from './http';

export interface SignInProvider {
  id: string;
  label: string;
  kind: string;
}

export interface SignedInAccount {
  session_id: string;
  is_admin: boolean;
}

export async function listProviders(): Promise<SignInProvider[]> {
  const { providers } = await api<{ providers: SignInProvider[] }>('GET', endpoints.authProviders());
  return providers;
}

/** The participant token for an access code. Throws ApiError (404 code_unknown, 429 too_many_codes). */
export async function openByAccessCode(code: string): Promise<{ session_id: string; token: string }> {
  return api<{ session_id: string; token: string }>('POST', endpoints.access(), { code });
}

/** The signed-in account, or null when nobody is signed in in this browser. */
export async function currentAccount(): Promise<SignedInAccount | null> {
  try {
    const r = await fetchAccountWorkspace();
    return { session_id: r.session_id, is_admin: r.account.is_admin === true };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) return null;
    throw err;
  }
}
