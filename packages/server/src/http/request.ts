/**
 * Request parsing shared by the route modules: a body checked against its schema (400 when it
 * does not fit), and the envelope every logged write carries.
 */
import { z } from 'zod';
import { FocusPane, Ulid } from '@edw/shared';
import { HttpError } from '../http-error.js';

/** Where the teacher was when they did it: sent with every write the server logs. */
export const Envelope = z.object({
  client_ts: z.string().datetime({ offset: true }),
  focus_pane: FocusPane,
  doc_id: Ulid.nullable(),
  thread_id: Ulid.nullable(),
});

export function parseOr400<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw Object.assign(new HttpError(400, 'invalid request', 'invalid_request'), { issues: r.error.issues });
  return r.data;
}
