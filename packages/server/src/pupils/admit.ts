/**
 * Who gets in as a pupil. Anyone the provider vouches for, except someone who already has a
 * teacher account: one identity is a teacher or a pupil, never both (the teachers' side is
 * accounts/policy.ts), and someone new only with a live class code (issue #209). Refusals are reason codes for the pupil page; none carries the identity.
 */
import type { OidcProviderSettings } from '../accounts/providers.js';
import { reduceClaims } from '../accounts/oidc.js';
import type { AccountStore } from '../accounts/store.js';
import type { Pupil, PupilIdentity, PupilStore } from './store.js';

/** `code_needed`: someone new came without a class code (issue #209); only a known pupil signs in without one. */
export type PupilRefusal = 'teacher_account' | 'code_needed';

export type PupilAdmission = { ok: true; pupil: Pupil } | { ok: false; reason: PupilRefusal };

/**
 * The checked ID token's claims reduced to what is kept about a pupil: the provider, the subject
 * and the tenant (Microsoft's `tid`, else Google's `hd`). The teachers' checks run first
 * (reduceClaims: a subject, and a Microsoft token's issuer matching its tenant); whatever else
 * the token carries is dropped here. Throws ClaimsError, with no claim values in it.
 */
export function pupilIdentity(settings: Pick<OidcProviderSettings, 'id' | 'family'>, claims: Record<string, unknown>): PupilIdentity {
  const who = reduceClaims(settings, claims);
  return { provider: who.provider, subject: who.subject, tenant: who.tenant ?? who.domain };
}

/** `withCode`: the sign-in carries a live class code, so someone new may come in. */
export async function admitPupil(accounts: Pick<AccountStore, 'findAccount'>, pupils: Pick<PupilStore, 'signIn' | 'findPupil'>, who: PupilIdentity, withCode: boolean): Promise<PupilAdmission> {
  if (await accounts.findAccount(who.provider, who.subject)) return { ok: false, reason: 'teacher_account' };
  if (!withCode && !(await pupils.findPupil(who.provider, who.subject))) return { ok: false, reason: 'code_needed' };
  return { ok: true, pupil: await pupils.signIn(who) };
}
