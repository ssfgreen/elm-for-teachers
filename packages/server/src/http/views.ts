/**
 * What the routes send back: blocks without their provenance, and a workspace with whether
 * interaction logging is on now. Pure, so any route module can use them.
 */
import type { Block, Changes } from '@edw/shared';
import type { SessionRow } from '../deps.js';

/** Provenance stays server-side: participants see a block's status, not who first wrote it. */
export type PublicBlock = Omit<Block, 'origin' | 'origin_turn'>;
export function publicBlock(b: Block): PublicBlock {
  const copy: Partial<Block> = { ...b };
  delete copy.origin;
  delete copy.origin_turn;
  return copy as PublicBlock;
}
export function publicChanges(c: Changes) {
  return { blocks: c.blocks.map(publicBlock), docs: c.docs, revisions: c.revisions.map((r) => ({ block_id: r.block_id, version: r.version })) };
}

/** Interaction logging is on and not past its end (sessions/interactions.ts turns it on and off). */
export function interactionsActive(s: Pick<SessionRow, 'interactions_on' | 'interactions_until'>, now: Date = new Date()): boolean {
  return s.interactions_on && (s.interactions_until === null || Date.parse(s.interactions_until) > now.getTime());
}

/** A workspace as the admin routes send it: its row plus `interactions_active`. */
export function sessionView<S extends SessionRow>(s: S): S & { interactions_active: boolean } {
  return { ...s, interactions_active: interactionsActive(s) };
}
