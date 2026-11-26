import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { CanvasError, createDoc, createState, decidePart, editInSuggestion, getBlock, insertBlock, proposeDelete, proposeMove, proposeReplace, type CanvasState, type Ctx } from "../canvas.js";

let tick = 0;
const ctx: Ctx = { now: () => new Date(Date.UTC(2026, 10, 7, 12, 0, 0, tick++)).toISOString(), newId: () => ulid() };
const ev = () => ulid();
let state: CanvasState;
let doc: string;

beforeEach(() => {
  state = createState("s");
  doc = createDoc(state, ctx, { thread_id: ulid(), name: "Untitled", created_by: "teacher" }).doc.id;
});

const para = (content: string, status: "live" | "proposed" = "live") =>
  insertBlock(state, ctx, { doc_id: doc, after: "start", type: "paragraph", content, origin: status === "live" ? "teacher" : "model", status, actor: status === "live" ? "teacher" : "model", cause_event_id: ev() }).block;

describe("editInSuggestion", () => {
  it("keeps a new block from the assistant a suggestion, with the teacher's text", () => {
    const b = para("Suggested", "proposed");
    const r = editInSuggestion(state, ctx, { block_id: b.id, after: { content: "Suggested here" }, cause_event_id: ev() });
    expect(r.implicit_accept).toBe(false);
    expect(getBlock(state, b.id)).toMatchObject({ status: "proposed", content: "Suggested here" });
    expect(r.changes.revisions.map((x) => [x.actor, x.after.content])).toEqual([["teacher", "Suggested here"]]);
  });

  it("updates both texts of a suggested change and leaves it waiting", () => {
    const b = para("The old word");
    proposeReplace(state, ctx, { block_id: b.id, turn_id: "t", content: "The new word" });
    editInSuggestion(state, ctx, { block_id: b.id, after: { content: "The newer word!" }, live: { content: "The old word!" }, cause_event_id: ev() });
    expect(getBlock(state, b.id)).toMatchObject({ status: "live", content: "The old word!", pending: { op: "replace", turn_id: "t", content: "The newer word!" } });
  });

  it("leaves nothing to decide once the teacher's edit makes the two texts the same", () => {
    const b = para("A cat");
    proposeReplace(state, ctx, { block_id: b.id, turn_id: "t", content: "A black cat" });
    editInSuggestion(state, ctx, { block_id: b.id, after: { content: "A cat" }, live: { content: "A cat" }, cause_event_id: ev() });
    expect(getBlock(state, b.id).pending).toBeNull();
  });

  it("keeps a suggested move, and treats a block suggested for deletion as an ordinary edit", () => {
    const a = para("First");
    const b = para("Second");
    proposeMove(state, ctx, { block_id: b.id, turn_id: "t", after: a.id });
    editInSuggestion(state, ctx, { block_id: b.id, after: { content: "Second!" }, cause_event_id: ev() });
    expect(getBlock(state, b.id)).toMatchObject({ content: "Second!", pending: { op: "move" } });
    proposeDelete(state, ctx, { block_id: a.id, turn_id: "t" });
    editInSuggestion(state, ctx, { block_id: a.id, after: { content: "First!" }, cause_event_id: ev() });
    expect(getBlock(state, a.id)).toMatchObject({ content: "First!", pending: null, status: "live" });
  });
});

describe("decidePart", () => {
  it("accepting one change records the new live text as the assistant's and keeps the rest", () => {
    const b = para("a big dog");
    proposeReplace(state, ctx, { block_id: b.id, turn_id: "t", content: "a small dog and cat" });
    const r = decidePart(state, ctx, { block_id: b.id, accept: true, live: { content: "a small dog" }, suggested: { content: "a small dog and cat" }, cause_event_id: ev() });
    expect(r.changes.revisions.map((x) => [x.actor, x.after.content])).toEqual([["model", "a small dog"]]);
    expect(getBlock(state, b.id)).toMatchObject({ content: "a small dog", pending: { op: "replace", content: "a small dog and cat" } });
  });

  it("rejecting the last change leaves nothing to decide and the live text as it was", () => {
    const b = para("a big dog");
    proposeReplace(state, ctx, { block_id: b.id, turn_id: "t", content: "a small dog" });
    const r = decidePart(state, ctx, { block_id: b.id, accept: false, live: { content: "a big dog" }, suggested: { content: "a big dog" }, cause_event_id: ev() });
    expect(r.changes.revisions).toEqual([]);
    expect(getBlock(state, b.id)).toMatchObject({ content: "a big dog", pending: null });
  });

  it("refuses a block with no suggested change", () => {
    const b = para("x");
    expect(() => decidePart(state, ctx, { block_id: b.id, accept: true, live: { content: "y" }, suggested: { content: "y" }, cause_event_id: ev() })).toThrow(CanvasError);
  });
});
