/**
 * Class codes: eight characters of the access codes' alphabet (access/codes.ts: Crockford base32,
 * no I, L, O or U), 40 bits, shown as `XXXX-XXXX`. Shorter than an access code because pupils
 * type it; guessing is held back by the shared wrong-code counter (http/wrong-codes.ts).
 * Stored and compared in canonical form: upper case, no hyphen.
 */
import { randomBytes } from 'node:crypto';
import { ALPHABET, formatCode } from '../access/codes.js';

export const CLASS_CODE_LENGTH = 8;

export function newClassCode(): string {
  return [...randomBytes(CLASS_CODE_LENGTH)].map((b) => ALPHABET[b & 31]).join('');
}

/** `ABCDEFGH` -> `ABCD-EFGH`. */
export const formatClassCode = formatCode;

/** What the pupil typed, in canonical form, or null when it cannot be a class code. Forgives case, spaces, hyphens, I and L for 1, O for 0. */
export function normaliseClassCode(typed: string): string | null {
  const s = typed
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (s.length !== CLASS_CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}
