/**
 * What a teacher types or pastes into a code field, and the words for each way sign-in can fail.
 * The server forgives case, spaces and look-alike letters (access/codes.ts on the server); here
 * we only take out what is never part of a code.
 */

/**
 * A typed or pasted code, ready to send: no spaces or line breaks anywhere, and a pasted
 * `/join/<code>` link reduced to its code. Case is kept: an older invite code is case-sensitive.
 */
export function cleanCode(typed: string): string {
  const fromLink = /\/join\/([^/?#\s]+)/.exec(typed)?.[1];
  const raw = fromLink ? safeDecode(fromLink) : typed;
  return raw.replace(/\s+/g, '');
}

/** An access code is always letters and digits, so it is shown in capitals. */
export function cleanAccessCode(typed: string): string {
  return cleanCode(typed).toUpperCase();
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The reasons the server sends back to /signin?error= (accounts/routes.ts SignInError). */
const FAILED = 'Sign-in did not complete. Please try again.';
const SIGN_IN_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. You can try again.',
  provider_error: 'Google or Microsoft did not respond. Please try again in a minute.',
  failed: FAILED,
  not_allowed: 'This account has no workspace yet. Ask for an invite code, or use an access code.',
  invite_unknown: 'That invite code was not recognised. Please check it.',
  invite_used: 'That invite code has already been used. If it was you, just sign in.',
  invite_expired: 'That invite code has expired. Please ask for a new one.',
  pupil_account: 'This account signs in as a pupil. Pupils sign in on the pupil page.',
};

/** The message for `?error=`, or null with none. A reason we do not know reads as `failed`. */
export function signInErrorMessage(reason: string | null): string | null {
  if (!reason) return null;
  return SIGN_IN_ERRORS[reason] ?? FAILED;
}

/** The message for a failed `POST /api/access`, from its status. */
export function accessErrorMessage(status: number | null): string {
  if (status === 404) return 'That access code was not recognised. Please check it, or ask the person who gave it to you.';
  if (status === 429) return 'Too many codes were tried. Please wait a minute and try again.';
  if (status === 400) return 'Please type the access code.';
  return 'The workspace could not be opened. Please try again.';
}
