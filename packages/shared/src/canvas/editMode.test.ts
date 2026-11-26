import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDoc, createState, getBlock, insertBlock, proposeReplace, type CanvasState, type Ctx } from "../canvas.js";
import { applyOperations, takeTurnIn } from "./apply.js";
import type { Operation } from "../operations.js";

let tick = 0;
const ctx: Ctx = { now: () => new Date(Date.UTC(2026, 10, 7, 12, 0, 0, tick++)).toISOString(), newId: () => ulid() };
const ev = () => ulid();
let state: CanvasState;
let doc: string;

beforeEach(() => {
  state = createState("s");
  doc = createDoc(state, ctx, { thread_id: ulid(), name: "Lesson", created_by: "teacher" }).doc.id;
});

const list = (content: string) =>
  insertBlock(state, ctx, { doc_id: doc, after: "start", type: "numbered_list", content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;

/** One Editing-mode turn, as the commit runs it. */
const editTurn = (operations: Operation[]) => {
  const cause = ev();
  const r = applyOperations(state, ctx, { operations, turn_id: "t2", cause_event_id: cause, thread_id: "th", default_doc_id: doc });
  takeTurnIn(state, ctx, r, cause);
};

// The workshop export of 7 Nov 2026: removing the exit ticket was suggested (Suggesting mode),
// then a request about another part of the same list was made in Editing mode.
const LIVE = "1. Guided practice (10 minutes)\n2. Share and improve (10 minutes)\n3. Exit ticket (5 minutes)";
const SUGGESTED = "1. Guided practice (10 minutes)\n2. Share and improve (15 minutes)";

describe("Editing mode and an earlier suggestion", () => {
  it("leaves a change to a block with an earlier turn's suggestion waiting for the teacher", () => {
    const b = list(LIVE);
    proposeReplace(state, ctx, { block_id: b.id, turn_id: "t1", content: SUGGESTED });
    editTurn([{ op: "replace", id: b.id, content: "1. Guided practice in bullets (10 minutes)\n2. Share and improve (10 minutes)\n3. Exit ticket (5 minutes)" }]);
    // The live text is untouched: the exit ticket is not taken out behind the teacher's back.
    expect(getBlock(state, b.id)).toMatchObject({ status: "live", content: LIVE, pending: { op: "replace" } });
  });

  it("takes the change in when the assistant says the teacher asked to revise the suggestion", () => {
    const b = list(LIVE);
    proposeReplace(state, ctx, { block_id: b.id, turn_id: "t1", content: SUGGESTED });
    editTurn([{ op: "replace", id: b.id, content: SUGGESTED, revises_suggestion: true }]);
    expect(getBlock(state, b.id)).toMatchObject({ status: "live", content: SUGGESTED, pending: null });
  });

  it("leaves an earlier turn's suggested new block a suggestion unless the teacher asked about it", () => {
    const b = insertBlock(state, ctx, { doc_id: doc, after: "start", type: "paragraph", content: "Earlier idea", origin: "model", origin_turn: "t1", status: "proposed", actor: "model", cause_event_id: ev() }).block;
    editTurn([{ op: "replace", id: b.id, content: "Earlier idea, reworded" }]);
    expect(getBlock(state, b.id)).toMatchObject({ status: "proposed", content: "Earlier idea, reworded" });
    editTurn([{ op: "replace", id: b.id, content: "Earlier idea, as asked", revises_suggestion: true }]);
    expect(getBlock(state, b.id)).toMatchObject({ status: "live", content: "Earlier idea, as asked" });
  });

  it("still takes in the turn's own changes, and a change to a block with nothing waiting", () => {
    const a = list("1. One");
    editTurn([
      { op: "replace", id: a.id, content: "1. One, changed" },
      { op: "insert", after: a.id, type: "paragraph", content: "New" },
    ]);
    expect(getBlock(state, a.id)).toMatchObject({ content: "1. One, changed", pending: null });
    expect([...state.blocks.values()].find((x) => x.content === "New")?.status).toBe("live");
  });
});
