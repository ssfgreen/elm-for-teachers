/**
 * Wrong codes per address, shared by every door that takes a typed code: a workspace's access
 * code (access/routes.ts) and a class code (pupils/routes.ts, through class-joins/join.ts). One counter for both, so
 * guessing at one door counts at the other. The count lives in this function instance, so several
 * instances each keep their own.
 */
import type { FastifyRequest } from 'fastify';

export const WRONG_LIMIT = 10;
export const WINDOW_MS = 60_000;
/** Addresses kept at most; past it, the oldest are forgotten. */
const MAX_ADDRESSES = 10_000;

export type WrongCodeCounter = ReturnType<typeof createWrongCodeCounter>;

/** Wrong codes per address in a sliding minute. `now` is for tests. */
export function createWrongCodeCounter(now: () => number = Date.now) {
  const wrong = new Map<string, number[]>();
  const recent = (ip: string): number[] => {
    const cutoff = now() - WINDOW_MS;
    const times = (wrong.get(ip) ?? []).filter((t) => t > cutoff);
    if (times.length) wrong.set(ip, times);
    else wrong.delete(ip);
    return times;
  };
  return {
    blocked: (ip: string): boolean => recent(ip).length >= WRONG_LIMIT,
    record(ip: string): void {
      const times = recent(ip);
      wrong.delete(ip);
      wrong.set(ip, [...times, now()]);
      if (wrong.size > MAX_ADDRESSES) wrong.delete(wrong.keys().next().value as string);
    },
  };
}

/**
 * Who is asking. Behind a proxy that replaces any X-Forwarded-For the visitor sent
 * (TRUST_PROXY: on Vercel by default) its first entry is the visitor; otherwise the socket's address, since anyone can send the header.
 */
export function clientAddress(req: FastifyRequest, trustProxy: boolean): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return trustProxy && first ? first : req.ip;
}
