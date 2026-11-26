import { describe, expect, it } from "vitest";
import type { ClientEvent, Event, EventOfKind, PayloadOfKind } from "./events.js";

/**
 * Compile-time checks that the event discriminated union narrows by `kind`.
 * If these stop compiling, the union construction in events.ts has regressed.
 */
describe("event union typing", () => {
  it("narrows payload by kind", () => {
    const handle = (e: Event): string => {
      switch (e.kind) {
        case "doc_rename":
          return e.payload.name;
        case "keystroke_batch":
          return e.payload.target.kind === "block" ? e.payload.target.block_id : "chat";
        case "chat_response":
          return e.payload.operations.length.toString();
        default:
          return e.kind;
      }
    };
    const payload: PayloadOfKind<"doc_rename"> = { doc_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "Similes" };
    const ev: EventOfKind<"doc_rename"> = {
      event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      session_id: "s",
      seq: 1,
      client_ts: "2026-10-28T12:00:00.000Z",
      server_ts: "2026-10-28T12:00:00.000Z",
      focus_pane: "none",
      doc_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      thread_id: null,
      kind: "doc_rename",
      payload,
    };
    expect(handle(ev)).toBe("Similes");

    const client: ClientEvent = {
      event_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      client_ts: "2026-10-28T12:00:00.000Z",
      focus_pane: "canvas",
      doc_id: null,
      thread_id: null,
      kind: "doc_open",
      payload: { doc_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
    };
    // @ts-expect-error seq is server-assigned and must not exist on a client event
    const bad: ClientEvent = { ...client, seq: 1 };
    expect(bad.kind).toBe("doc_open");
  });
});
