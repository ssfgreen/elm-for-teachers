/**
 * Typable codes: access codes for link workspaces and invite codes for accounts. Twelve
 * characters of Crockford base32 (no I, L, O or U), 60 bits, shown as `XXXX-XXXX-XXXX`.
 * Stored and compared in their canonical form: twelve characters, upper case, no hyphens.
 */
import { randomBytes } from 'node:crypto';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 12;

/** A new code in canonical form. 256 is a multiple of 32, so each byte gives an even choice. */
export function newCode(): string {
  return [...randomBytes(CODE_LENGTH)].map((b) => ALPHABET[b & 31]).join('');
}

/** `ABCDEFGHJKMN` -> `ABCD-EFGH-JKMN`. */
export function formatCode(canonical: string): string {
  return canonical.match(/.{1,4}/g)?.join('-') ?? canonical;
}

/**
 * What the person typed, in canonical form, or null when it cannot be a code. Forgives case,
 * spaces, hyphens, I and L for 1, and O for 0.
 */
export function normaliseCode(typed: string): string | null {
  const s = typed
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}
