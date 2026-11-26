import { describe, expect, it } from "vitest";
import { ClientEvent, EVENT_KINDS, INTERACTION_KINDS } from "./events.js";

const base = { event_id: "01JBXYZ0000000000000000000", client_ts: "2026-11-10T10:00:00.000Z", focus_pane: "canvas", doc_id: null, thread_id: null } as const;
const parse = (kind: string, payload: unknown) => ClientEvent.safeParse({ ...base, kind, payload }).success;
const at = { pane: "canvas", block_id: "B1", item: null } as const;

describe("interaction events", () => {
  it("are all event kinds, and the server's own switch is not among them", () => {
    for (const k of INTERACTION_KINDS) expect(EVENT_KINDS).toContain(k);
    expect(INTERACTION_KINDS).not.toContain("interaction_logging_set");
  });

  it("parse pointer samples, and refuse an empty batch", () => {
    expect(parse("pointer", { interval_ms: 100, samples: [{ ...at, t: 1, x: 10, y: 20 }] })).toBe(true);
    expect(parse("pointer", { interval_ms: 100, samples: [] })).toBe(false);
  });

  it("parse a click on a control and on plain text", () => {
    expect(parse("click", { ...at, x: 1, y: 2, button: 0, count: 1, control: { role: "button", label: "Accept" } })).toBe(true);
    expect(parse("click", { ...at, item: "suggestion:B1:all", x: 1, y: 2, button: 0, count: 2, control: null })).toBe(true);
    expect(parse("click", { ...at, x: 1.5, y: 2, button: 0, count: 1, control: null })).toBe(false);
  });

  it("parse the viewport, a menu opening, the page state and a selection", () => {
    expect(parse("viewport", { width: 1200, height: 800, device_pixel_ratio: 2, regions: { chat: { left: 800, top: 0, width: 400, height: 800 } } })).toBe(true);
    expect(parse("ui_state", { role: "menu", label: "Export", open: true })).toBe(true);
    expect(parse("ui_state", { role: "tooltip", label: null, open: true })).toBe(false);
    expect(parse("page_state", { visible: true, focused: false })).toBe(true);
    expect(parse("text_select", { pane: "chat", block_id: null, item: "message:T1-r", length: 3, text: "abc" })).toBe(true);
    expect(parse("text_select", { pane: "chat", block_id: null, item: null, length: 600, text: "x".repeat(501) })).toBe(false);
  });

  it("parse the switch with and without an end time", () => {
    expect(parse("interaction_logging_set", { on: true, until: "2026-11-10T13:00:00.000Z" })).toBe(true);
    expect(parse("interaction_logging_set", { on: false, until: null })).toBe(true);
  });
});
