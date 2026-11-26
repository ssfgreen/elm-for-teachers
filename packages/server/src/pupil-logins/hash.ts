/**
 * Pupil login passwords, hashed with scrypt from `node:crypto` (issue #223): a random salt per
 * login, compared in constant time. Stored as `scrypt$N$r$p$<salt>$<hash>` (base64url), so the
 * cost can be raised later without breaking stored logins.
 *
 * `dummyVerify` runs the same work against a fixed hash no password matches, so sign-in (B) takes
 * as long for an unknown username as for a known one with a wrong password, from the first call.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const COST = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, KEY_LENGTH, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Whether `password` is the one `stored` was made from. False for a stored value it cannot read, or a cost scrypt refuses. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  if (want.length !== KEY_LENGTH) return false;
  try {
    const got = await scrypt(password, Buffer.from(salt, 'base64url'), { N: Number(n), r: Number(r), p: Number(p) });
    return timingSafeEqual(got, want);
  } catch {
    // ERR_OUT_OF_RANGE and the like: a stored value this code did not write.
    return false;
  }
}

/** Made once from a random password nobody kept, at the cost above. Fixed, so the first call costs the same as the rest. */
const DUMMY_HASH = 'scrypt$16384$8$1$6YMMGgcVGlc4ubehpgz5NQ$s1hcT9oAAe2Hb-uRr0Giu_dF5zEHkrYSYIyJ5aT_Hgc';

/** The same work as `verifyPassword`, for a username no login has: one scrypt call. Always false. */
export async function dummyVerify(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
