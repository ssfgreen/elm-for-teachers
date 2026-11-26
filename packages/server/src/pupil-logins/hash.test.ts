/** Pupil login passwords: scrypt, a salt each, constant-time compare (issue #223). */
import { describe, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { dummyVerify, hashPassword, verifyPassword } from './hash.js';

vi.mock('node:crypto', async (orig) => {
  const real = await orig<typeof import('node:crypto')>();
  return { ...real, scrypt: vi.fn(real.scrypt) };
});

describe('hashPassword and verifyPassword', () => {
  it('round-trips, refuses a wrong password, and never stores the password', async () => {
    const stored = await hashPassword('maple-acorn-418');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(stored).not.toContain('maple');
    expect(await verifyPassword('maple-acorn-418', stored)).toBe(true);
    expect(await verifyPassword('maple-acorn-419', stored)).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same-word-111')).not.toBe(await hashPassword('same-word-111'));
  });

  it('is false for a stored value it cannot read, or with a cost scrypt refuses', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$16384$8$1$AAAA$AAAA')).toBe(false);
    const stored = (await hashPassword('x')).split('$');
    for (const n of ['3', '-1', 'big']) expect(await verifyPassword('x', ['scrypt', n, ...stored.slice(2)].join('$'))).toBe(false);
  });
});

describe('dummyVerify', () => {
  it('makes exactly one scrypt call, the very first time too, as a known username with a wrong password does', async () => {
    const scrypt = vi.mocked(crypto.scrypt);
    scrypt.mockClear();
    expect(await dummyVerify('maple-acorn-418')).toBe(false);
    expect(scrypt).toHaveBeenCalledTimes(1);
    expect(scrypt.mock.calls[0]![3]).toEqual({ N: 16384, r: 8, p: 1 });
    expect(await dummyVerify('maple-acorn-418')).toBe(false);
    expect(scrypt).toHaveBeenCalledTimes(2);
  });
});
