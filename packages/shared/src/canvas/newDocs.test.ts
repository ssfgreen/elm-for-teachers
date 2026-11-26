import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDoc, createState, deleteBlock, editBlock, getBlock, insertBlock, setDocStyle, visibleBlocks, type CanvasState, type Ctx } from "../canvas.js";
import type { BlockType } from "../enums.js";
import { applyOperations } from "./apply.js";
import { blankDocIds, isBlankDoc, takeNewDocsIn } from "./newDocs.js";
import type { Operation } from "../operations.js";

let tick = 0;
const ctx: Ctx = { now: () => new Date(Date.UTC(2026, 10, 12, 12, 0, 0, tick++)).toISOString(), newId: () => ulid() };
const ev = () => ulid();
const thread = ulid();
let state: CanvasState;
let doc: string;

beforeEach(() => {
  state = createState("s");
  doc = createDoc(state, ctx, { thread_id: thread, name: "Lesson", created_by: "teacher" }).doc.id;
});

const live = (content: string) =>
  insertBlock(state, ctx, { doc_id: doc, after: "start", type: "paragraph", content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;

/** One Suggesting-mode turn, as the server applies it. */
const suggestTurn = (operations: Operation[]) => {
  const cause = ev();
  const r = applyOperations(state, ctx, { operations, turn_id: "t1", cause_event_id: cause, thread_id: thread, default_doc_id: doc });
  return { r, made: takeNewDocsIn(state, ctx, r, cause) };
};

/** The same turn with the rule for blank docs: which docs are blank is read before the turn changes anything. */
const turn = (operations: Operation[]) => {
  const cause = ev();
  const blank = blankDocIds(state, thread);
  const r = applyOperations(state, ctx, { operations, turn_id: "t1", cause_event_id: cause, thread_id: thread, default_doc_id: doc });
  return { r, made: takeNewDocsIn(state, ctx, r, cause, blank) };
};
const blank = () => isBlankDoc(state.docs.get(doc), state.blocks.values());
const put = (type: BlockType, content: string) =>
  insertBlock(state, ctx, { doc_id: doc, after: "start", type, content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;

describe("a doc the assistant makes goes straight in, in Suggesting mode (Sam, 12 Nov 2026)", () => {
  it("takes in a new doc's blocks and its page colour", () => {
    const { r, made } = suggestTurn([
      { op: "create_doc", temp_id: "d1", name: "Fractions" },
      { op: "insert", doc: "d1", after: "start", type: "heading", content: "Fractions" },
      { op: "set_style", doc: "d1", background: "cream" },
    ]);
    const id = r.created_doc_ids[0]!;
    expect(made.block_ids).toHaveLength(1);
    expect(visibleBlocks(state, id).map((b) => [b.content, b.status])).toEqual([["Fractions", "live"]]);
    expect(state.docs.get(id)).toMatchObject({ style: { background: "cream" } });
    expect(state.docs.get(id)?.proposed_style).toBeUndefined();
  });

  it("takes in a copy, with the changes made to it, and leaves the original alone", () => {
    const a = live("Task 1");
    const { r } = suggestTurn([
      { op: "create_doc", temp_id: "d1", name: "Lesson (easier)", copy_of: doc },
      { op: "replace", id: `d1/${a.id}`, content: "Task 1, easier" },
    ]);
    const id = r.created_doc_ids[0]!;
    expect(visibleBlocks(state, id).map((b) => [b.content, b.status, b.pending])).toEqual([["Task 1, easier", "live", null]]);
    expect(getBlock(state, a.id)).toMatchObject({ content: "Task 1", status: "live", pending: null });
  });

  it("leaves changes to the teacher's own docs as suggestions", () => {
    const a = live("Task 1");
    const { made } = suggestTurn([
      { op: "replace", id: a.id, content: "Task 1, changed" },
      { op: "create_doc", temp_id: "d1", name: "Other" },
      { op: "insert", doc: "d1", after: "start", type: "paragraph", content: "New" },
    ]);
    expect(made.block_ids).toHaveLength(1);
    expect(getBlock(state, a.id)).toMatchObject({ content: "Task 1", pending: { op: "replace" } });
  });
});

describe("a blank doc (Sam, 13 Nov 2026)", () => {
  it("is blank with no blocks, with only empty text, and whatever its name and font", () => {
    expect(blank()).toBe(true);
    put("paragraph", "");
    put("heading", "  ");
    put("bullet_item", "");
    expect(blank()).toBe(true);
    setDocStyle(state, ctx, { doc_id: doc, style: { font: "lexend" } });
    expect(blank()).toBe(true);
    expect(isBlankDoc(undefined, [])).toBe(false);
  });

  it("is not blank with any text in it, and is blank again once emptied", () => {
    const a = put("paragraph", "Task 1");
    expect(blank()).toBe(false);
    editBlock(state, ctx, { block_id: a.id, after: { content: "" }, cause_event_id: ev() });
    expect(blank()).toBe(true);
    const b = put("paragraph", "Task 2");
    deleteBlock(state, ctx, { block_id: b.id });
    expect(blank()).toBe(true);
  });

  it.each(["image", "table", "divider", "page_break"] as const)("is not blank with a %s in it", (type) => {
    put(type, "");
    expect(blank()).toBe(false);
  });

  it("is not blank with a suggestion or a suggested style waiting", () => {
    suggestTurn([{ op: "insert", after: "start", type: "paragraph", content: "" }]);
    expect(blank()).toBe(false);
    const other = createDoc(state, ctx, { thread_id: thread, name: "Other", created_by: "teacher" }).doc.id;
    expect(isBlankDoc(state.docs.get(other), state.blocks.values())).toBe(true);
    applyOperations(state, ctx, { operations: [{ op: "set_style", doc: other, background: "cream" }], turn_id: "t0", cause_event_id: ev(), thread_id: thread, default_doc_id: doc });
    expect(isBlankDoc(state.docs.get(other), state.blocks.values())).toBe(false);
  });

  it("lists the chat's blank docs only", () => {
    const elsewhere = createDoc(state, ctx, { thread_id: ulid(), name: "Other chat", created_by: "teacher" }).doc.id;
    const second = createDoc(state, ctx, { thread_id: thread, name: "Second", created_by: "teacher" }).doc.id;
    live("Task 1");
    expect(blankDocIds(state, thread)).toEqual([second]);
    expect(blankDocIds(state, thread)).not.toContain(elsewhere);
  });
});

describe("what the turn puts in a blank doc goes straight in (Sam, 13 Nov 2026)", () => {
  it("takes in the blocks and a page colour, and replaces the empty paragraph", () => {
    const empty = put("paragraph", "");
    const { made } = turn([
      { op: "replace", id: empty.id, content: "Fractions" },
      { op: "insert", after: empty.id, type: "paragraph", content: "Halves and quarters." },
      { op: "set_style", background: "cream" },
    ]);
    expect(made.block_ids).toHaveLength(2);
    expect(visibleBlocks(state, doc).map((b) => [b.content, b.status, b.pending])).toEqual([["Fractions", "live", null], ["Halves and quarters.", "live", null]]);
    expect(state.docs.get(doc)).toMatchObject({ style: { background: "cream" } });
    expect(state.docs.get(doc)?.proposed_style).toBeUndefined();
  });

  it("any blank doc of the chat counts, and a doc with text in it still gets suggestions", () => {
    const a = live("Task 1");
    const second = createDoc(state, ctx, { thread_id: thread, name: "Blank", created_by: "teacher" }).doc.id;
    const { made } = turn([
      { op: "replace", id: a.id, content: "Task 1, changed" },
      { op: "insert", doc: second, after: "start", type: "paragraph", content: "Into the blank doc" },
    ]);
    expect(made.block_ids).toHaveLength(1);
    expect(getBlock(state, a.id)).toMatchObject({ content: "Task 1", pending: { op: "replace" } });
    expect(visibleBlocks(state, second).map((b) => b.status)).toEqual(["live"]);
  });

  it("a doc the teacher has typed in by the time of the commit gets suggestions", () => {
    live("I typed this while the assistant worked");
    const { made } = turn([{ op: "insert", after: "start", type: "heading", content: "Fractions" }]);
    expect(made.block_ids).toEqual([]);
    expect(visibleBlocks(state, doc).map((b) => b.status).sort()).toEqual(["live", "proposed"]);
  });

  it("a doc with a suggestion waiting gets suggestions", () => {
    suggestTurn([{ op: "insert", after: "start", type: "paragraph", content: "Earlier suggestion" }]);
    const { made } = turn([{ op: "insert", after: "start", type: "heading", content: "Fractions" }]);
    expect(made.block_ids).toEqual([]);
    expect(visibleBlocks(state, doc).every((b) => b.status === "proposed")).toBe(true);
  });
});
