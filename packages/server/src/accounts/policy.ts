/**
 * Who gets in. An identity that already has an account gets it back. Otherwise the invite link
 * is the way in: the code in the link, never an email address, ties the person to the new
 * workspace. Optional settings open the door without an invite to listed Microsoft tenants
 * (the token's `tid`) or Google Workspace domains (the token's `hd`, never the email's domain).
 *
 * Someone already known as a pupil (pupils/, issue #179) is refused: a pupil pressing the
 * teachers' Sign in must not get a teacher workspace.
 *
 * Refusals are reason codes for the sign-in page; none carries the identity.
 */
import { HttpError } from '../http-error.js';
import type { SignedInIdentity } from './oidc.js';
import type { ProviderSettings } from './providers.js';
import type { Account, AccountStore } from './store.js';

export type Refusal = 'not_allowed' | 'invite_unknown' | 'invite_used' | 'invite_expired';

export interface OpenDoors {
  microsoftTenants: readonly string[];
  googleDomains: readonly string[];
}

export type Admission = { ok: true; account: Account; created: boolean } | { ok: false; reason: Refusal };

/** Whether the settings let this identity in without an invite. */
export function opensDoor(family: ProviderSettings['family'], who: Pick<SignedInIdentity, 'tenant' | 'domain'>, doors: OpenDoors): boolean {
  if (family === 'microsoft') return who.tenant !== null && doors.microsoftTenants.includes(who.tenant);
  if (family === 'google') return who.domain !== null && doors.googleDomains.includes(who.domain);
  return false;
}

const REFUSALS: Record<number, Refusal> = { 404: 'invite_unknown', 409: 'invite_used', 410: 'invite_expired' };

export async function admit(
  store: Pick<AccountStore, 'findAccount' | 'claimInvite' | 'openAccount'>,
  provider: Pick<ProviderSettings, 'family' | 'label'>,
  who: SignedInIdentity,
  invite: string | null,
  doors: OpenDoors,
): Promise<Admission> {
  const identity = { provider: who.provider, subject: who.subject, email: who.email, displayName: who.displayName };
  // First: claimInvite hands back an existing account without looking at the code, so its 404
  // would not mean "bad code" for someone who already has one.
  const existing = await store.findAccount(identity.provider, identity.subject);
  if (existing) return { ok: true, account: existing, created: false };
  if (invite) {
    try {
      return { ok: true, ...(await store.claimInvite(invite, identity)) };
    } catch (err) {
      const reason = err instanceof HttpError ? REFUSALS[err.statusCode] : undefined;
      if (reason) return { ok: false, reason };
      throw err;
    }
  }
  if (opensDoor(provider.family, who, doors)) {
    // The workspace's name reaches the admin list and the export: never the person's name or email.
    return { ok: true, ...(await store.openAccount(identity, `${provider.label} sign-in`)) };
  }
  return { ok: false, reason: 'not_allowed' };
}
