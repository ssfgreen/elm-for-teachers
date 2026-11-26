/**
 * A studio draft's address, `<studio>/d/<code>`, checked against the PLUGIN_STUDIO_URL allow-list.
 * The code is a secret: nothing here puts the address or the code in an error message.
 */
import { randomBytes } from 'node:crypto';

/** A draft's code: letters, digits, `-` and `_`. */
const DRAFT_PATH = /^\/d\/([A-Za-z0-9_-]{6,200})\/?$/;

export type AddressProblem = 'not_an_address' | 'not_the_studio' | 'not_a_draft';

/**
 * The draft address in one canonical form (origin, `/d/`, code), or why it is refused: not an
 * address, not at an allowed studio origin, or not a draft's address (anything other than
 * `/d/<code>`, or with a query, fragment or user name).
 */
export function checkDraftAddress(input: string, origins: readonly string[]): { address: string } | { problem: AddressProblem } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { problem: 'not_an_address' };
  }
  if (!origins.includes(u.origin)) return { problem: 'not_the_studio' };
  const m = DRAFT_PATH.exec(u.pathname);
  if (!m || u.search || u.hash || u.username || u.password) return { problem: 'not_a_draft' };
  return { address: `${u.origin}/d/${m[1]}` };
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Elm's own id for a draft, shown to the teacher: random, nothing to do with its code. */
export function newDraftId(): string {
  return `d-${[...randomBytes(8)].map((b) => ALPHABET[b & 31]).join('')}`;
}
