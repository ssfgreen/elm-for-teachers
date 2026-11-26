/**
 * Interaction logging, per workspace (shared/src/events/interactions.ts). Off by default; the
 * admin turns it on, for some hours or until turned off. While it is off the server drops the
 * interaction events a client sends, and tells the client, so it stops sending them.
 */
import { INTERACTION_KINDS, type ClientEvent } from '@edw/shared';

const KINDS: ReadonlySet<string> = new Set(INTERACTION_KINDS);

/** The longest the admin can turn it on for at a time: 30 days. */
export const MAX_HOURS = 720;

/** When logging turned on now for `hours` stops (null: it does not stop by itself). */
export function untilAfter(hours: number | null, now: Date = new Date()): string | null {
  return hours === null ? null : new Date(now.getTime() + hours * 3600_000).toISOString();
}

/** The batch without its interaction events, when logging is off. */
export function keepAllowed(events: ClientEvent[], active: boolean): ClientEvent[] {
  return active ? events : events.filter((e) => !KINDS.has(e.kind));
}
