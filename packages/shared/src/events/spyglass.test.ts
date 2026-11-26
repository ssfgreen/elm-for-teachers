import { describe, expect, it } from "vitest";
import { ClientEvent, EVENT_KINDS } from "../events.js";

describe("Spyglass events", () => {
  it("records the teacher's copy choice: the doc, the choice, how many suggestions waited, and the turn that asked", () => {
    expect(EVENT_KINDS).toContain("copy_choice");
    const event = {
      event_id: "01JC0000000000000000000001",
      client_ts: "2026-11-11T12:00:00.000Z",
      focus_pane: "chat",
      doc_id: "01JC0000000000000000000002",
      thread_id: "01JC0000000000000000000003",
      kind: "copy_choice",
      payload: { doc_id: "01JC0000000000000000000002", choice: "all_and_leave", waiting: 3, turn_id: "t1" },
    };
    expect(ClientEvent.safeParse(event).success).toBe(true);
    expect(ClientEvent.safeParse({ ...event, payload: { ...event.payload, choice: "some" } }).success).toBe(false);
  });
});

describe("Spyglass flags and toggle", () => {
  const envelope = { event_id: "01JC0000000000000000000001", client_ts: "2026-11-11T12:00:00.000Z", focus_pane: "chat", doc_id: "01JC0000000000000000000002", thread_id: "01JC0000000000000000000003" };

  it("records the toggle as on or off", () => {
    expect(ClientEvent.safeParse({ ...envelope, kind: "spyglass_toggle", payload: { on: false } }).success).toBe(true);
    expect(ClientEvent.safeParse({ ...envelope, kind: "spyglass_toggle", payload: {} }).success).toBe(false);
  });

  it("records a turn's flags by check, label and blocks, and why they were hidden", () => {
    const payload = { turn_id: "t1", flags: [{ check: "scope", label: "removed", block_ids: ["b1"] }], others: 0, by: "judge", gateway_call_id: "g1", hidden: "teacher_off" };
    expect(ClientEvent.safeParse({ ...envelope, kind: "spyglass_shown", payload }).success).toBe(true);
    expect(ClientEvent.safeParse({ ...envelope, kind: "spyglass_shown", payload: { ...payload, hidden: "bored" } }).success).toBe(false);
  });

  it("records what the teacher did with a flag", () => {
    const payload = { turn_id: "t1", flag: 0, label: "changed", block_ids: ["b1"], action: "dismiss" };
    expect(ClientEvent.safeParse({ ...envelope, kind: "spyglass_action", payload }).success).toBe(true);
    expect(ClientEvent.safeParse({ ...envelope, kind: "spyglass_action", payload: { ...payload, action: "ignore" } }).success).toBe(false);
  });
});
