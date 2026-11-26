/**
 * Holds back a block's events while a command carrying that block's content is on its way to the
 * server. The server must apply the command (creating the block, or its new content) before events
 * that name the block arrive, or the event log would refer to a block the canvas does not have yet.
 */
import type { EventKind, PayloadOfKind } from "@edw/shared";
import type { EventLogger } from "./logger.js";

/** Counts commands in flight per block: a block is unsynced until every command naming it is applied. */
class InFlight {
  private readonly n = new Map<string, number>();
  add(id: string) {
    this.n.set(id, (this.n.get(id) ?? 0) + 1);
  }
  delete(id: string) {
    const left = (this.n.get(id) ?? 0) - 1;
    if (left > 0) this.n.set(id, left);
    else this.n.delete(id);
  }
  has(id: string) {
    return this.n.has(id);
  }
  clear() {
    this.n.clear();
  }
}

type Held = { blockId: string; kind: EventKind; payload: unknown };

export interface GatedLogger extends Pick<EventLogger, "log"> {
  /** A command carrying these blocks' content was queued. */
  begin(blockIds: Iterable<string>): void;
  /** The server applied that command: log, in order, every held event whose block is no longer waiting. */
  end(blockIds: Iterable<string>): void;
  /** A command was refused and the canvas reloads: drop everything held. */
  reset(): void;
  /** Events waiting (for tests). */
  held(): number;
}

export function createGatedLogger(inner: Pick<EventLogger, "log">): GatedLogger {
  const inFlight = new InFlight();
  let held: Held[] = [];
  return {
    log: ((kind: EventKind, payload: PayloadOfKind<EventKind>) => {
      const blockId = (payload as { target?: { block_id?: string } }).target?.block_id;
      if (blockId && inFlight.has(blockId)) {
        held.push({ blockId, kind, payload });
        return "";
      }
      return inner.log(kind as never, payload as never);
    }) as EventLogger["log"],
    begin(blockIds) {
      for (const id of blockIds) inFlight.add(id);
    },
    end(blockIds) {
      for (const id of blockIds) inFlight.delete(id);
      const keep: Held[] = [];
      for (const h of held) {
        if (inFlight.has(h.blockId)) keep.push(h);
        else inner.log(h.kind as never, h.payload as never);
      }
      held = keep;
    },
    reset() {
      inFlight.clear();
      held = [];
    },
    held: () => held.length,
  };
}
