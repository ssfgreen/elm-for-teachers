import { endpoints } from './endpoints';
import { currentAccount, listProviders } from './auth';
import type { SignInProvider } from './auth';
import { api, apiBlob, ApiError } from './http';

export { errorCode } from './http';
import type { FeaturesPatch } from '@edw/shared';
import type { AdminSessionRow } from './types';

const PASSWORD_KEY = 'edw.admin.password';

export function loadPassword(): string | null {
  try {
    return sessionStorage.getItem(PASSWORD_KEY);
  } catch {
    return null;
  }
}
export function savePassword(pw: string | null): void {
  try {
    if (pw === null) sessionStorage.removeItem(PASSWORD_KEY);
    else sessionStorage.setItem(PASSWORD_KEY, pw);
  } catch {
    /* storage unavailable: the password lives only in memory */
  }
}

/** Who opened /admin: an admin's sign-in, or the password (local and e2e only). */
export type AdminMe =
  | { via: 'password' }
  | { via: 'account'; account: { id: string; name: string | null; email: string | null; provider: string } };

export interface AdminInvite {
  /** The hash of its code: names the invite in the routes. The code itself is shown only once. */
  id: string;
  label: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  session_id: string | null;
  status: 'open' | 'used' | 'expired';
}

/** A workspace's spend and budget (config `limits.budget_gbp` plus its top-ups), in pounds. */
export interface AdminBudget {
  session_id: string;
  spent_gbp: number;
  budget_gbp: number;
}

export interface AdminAccount {
  id: string;
  name: string | null;
  email: string | null;
  provider: string;
  admin: boolean;
  workspace: { session_id: string; label: string };
}

/** The provider's name as people know it ("Microsoft"); the id for any other. Keep in step with the server's labels (providers.ts). */
export function providerName(id: string): string {
  return ({ google: 'Google', microsoft: 'Microsoft', test: 'Test issuer' } as Record<string, string>)[id] ?? id;
}

/**
 * Admin calls. An admin's sign-in cookie goes with every request by itself; `password`
 * (local and e2e only) is sent as well when given.
 */
export function createAdminApi(password: string | null = null) {
  const opts = password ? { token: password } : {};
  return {
    password,
    me: () => api<AdminMe>('GET', endpoints.adminMe(), undefined, opts),
    listSessions: () => api<{ sessions: AdminSessionRow[] }>('GET', endpoints.adminSessions(), undefined, opts).then((r) => r.sessions),
    /** `features`: switches to start with; any left out take their default. */
    createSession: (label: string, extra: { study?: boolean; features?: FeaturesPatch } = {}) =>
      api<{ session: AdminSessionRow; participant_url: string | null }>('POST', endpoints.adminSessions(), { label, ...(extra.study ? { study: true } : {}), ...(extra.features ? { features: extra.features } : {}) }, opts),
    renameSession: (id: string, label: string) => api<{ session: AdminSessionRow; participant_url: string | null }>('PATCH', endpoints.adminSession(id), { label }, opts),
    /** Interaction logging on (for `hours`, or until turned off when null) or off. */
    setInteractions: (id: string, on: boolean, hours: number | null) =>
      api<{ session: AdminSessionRow }>('PUT', endpoints.adminInteractions(id), { on, hours }, opts).then((r) => r.session),
    /** Changes some of the workspace's feature switches; those left out keep their value. */
    setFeatures: (id: string, features: FeaturesPatch) => api<{ session: AdminSessionRow }>('PUT', endpoints.adminFeatures(id), { features }, opts).then((r) => r.session),
    /** Deletes the session and everything in it (docs, chats, logs, images). 409 last_admin for the only admin's. */
    deleteSession: (id: string) => api<void>('DELETE', endpoints.adminSession(id), undefined, opts),
    /** The session bundle zip, fetched with the password in a header (a plain link cannot send one). */
    exportZip: (id: string) => apiBlob(endpoints.adminExport(id), opts),
    /** A new access code for a link workspace; an older one stops working. */
    newAccessCode: (id: string) => api<{ session: AdminSessionRow }>('POST', endpoints.adminAccessCode(id), undefined, opts).then((r) => r.session),
    /** `replace`: a new link and access code (the old ones stop working); `close`: both stop, none is issued. */
    setLink: (id: string, action: 'replace' | 'close') => api<{ session: AdminSessionRow }>('POST', endpoints.adminLink(id, action), undefined, opts).then((r) => r.session),
    listBudgets: () => api<{ budgets: AdminBudget[] }>('GET', endpoints.adminBudgets(), undefined, opts).then((r) => r.budgets),
    /** Adds £10 to the workspace's budget. There is no undo. */
    topUp: (id: string) => api<{ budget: AdminBudget }>('POST', endpoints.adminTopUp(id), undefined, opts).then((r) => r.budget),
    listInvites: () => api<{ invites: AdminInvite[] }>('GET', endpoints.adminInvites(), undefined, opts).then((r) => r.invites),
    /** The code comes back only here. */
    createInvite: (label: string, email: string | null) => api<{ invite: AdminInvite; code: string }>('POST', endpoints.adminInvites(), { label, email }, opts),
    deleteInvite: (id: string) => api<void>('DELETE', endpoints.adminInvite(id), undefined, opts),
    listAccounts: () => api<{ accounts: AdminAccount[] }>('GET', endpoints.adminAccounts(), undefined, opts).then((r) => r.accounts),
    setAdmin: (accountId: string, admin: boolean) => api<void>('PUT', endpoints.adminAccountAdmin(accountId), { admin }, opts),
  };
}
export type AdminApi = ReturnType<typeof createAdminApi>;

/** What /admin shows before the admin screen. */
export type GateState =
  | { kind: 'admin'; me: AdminMe; api: AdminApi }
  /** Signed out, or an admin's sign-in older than 12 hours. `password`: the server takes the password here. */
  | { kind: 'signed-out'; password: boolean; providers: SignInProvider[]; again: boolean }
  /** Signed in, but the account is not an admin. `password`: the server takes the password here. */
  | { kind: 'not-admin'; password: boolean };

/**
 * Asks the server who this is. The stored password, if any, goes along; one the server turns
 * down is forgotten. A 401 is then told apart: signed in but not an admin, or signed out.
 */
export async function checkAdmin(password: string | null): Promise<GateState> {
  const adminApi = createAdminApi(password);
  try {
    return { kind: 'admin', me: await adminApi.me(), api: adminApi };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    if (password) savePassword(null);
    const passwordTaken = readPasswordFlag(e);
    const account = await currentAccount().catch(() => null);
    if (account && !account.is_admin) return { kind: 'not-admin', password: passwordTaken };
    const providers = await listProviders().catch((): SignInProvider[] => []);
    // An admin still signed in whose admin sign-in is too old: the same buttons, with a line saying why.
    return { kind: 'signed-out', password: passwordTaken, providers, again: account !== null };
  }
}

/** Whether a 401 from an admin route says the server takes the password here. */
export function readPasswordFlag(e: ApiError): boolean {
  try {
    return (JSON.parse(e.body) as { password?: unknown }).password === true;
  } catch {
    return false;
  }
}
