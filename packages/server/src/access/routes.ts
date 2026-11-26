/**
 * The front door for a link workspace without its link:
 *   POST /api/access {code} -> { session_id, token }; the client then opens /s/<token>.
 *   404 `code_unknown` for a code that is not a link workspace's (an account workspace never
 *   answers to one); 429 `too_many_codes` after WRONG_LIMIT wrong codes in a minute from one
 *   address (http/wrong-codes.ts, shared with the class code).
 * The code is never logged or written to an event: the request log carries only the address.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps.js';
import { HttpError, tooManyRequests } from '../http-error.js';
import { parseOr400 } from '../http/request.js';
import { clientAddress, createWrongCodeCounter, type WrongCodeCounter } from '../http/wrong-codes.js';
import { normaliseCode } from './codes.js';

const AccessBody = z.object({ code: z.string().max(64) });

export interface AccessRouteOptions {
  counter?: WrongCodeCounter;
  /** Whether X-Forwarded-For can be trusted; default the TRUST_PROXY setting. */
  trustProxy?: boolean;
}

export function registerAccessRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'sessions' | 'env'>, opts: AccessRouteOptions = {}): void {
  const counter = opts.counter ?? createWrongCodeCounter();
  const trustProxy = opts.trustProxy ?? deps.env.TRUST_PROXY === true;

  app.post('/api/access', async (req: FastifyRequest, reply) => {
    reply.header('cache-control', 'no-store');
    const ip = clientAddress(req, trustProxy);
    if (counter.blocked(ip)) throw tooManyRequests('Too many wrong codes. Wait a minute and try again.', 'too_many_codes');
    const { code } = parseOr400(AccessBody, req.body);
    const canonical = normaliseCode(code);
    const session = canonical ? await deps.sessions.byAccessCode(canonical) : null;
    if (!session) {
      counter.record(ip);
      throw new HttpError(404, 'No workspace has that code. Check it and try again.', 'code_unknown');
    }
    return { session_id: session.session_id, token: session.participant_token };
  });
}
