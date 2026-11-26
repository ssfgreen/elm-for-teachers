import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import {
  acceptAll,
  acceptBlock,
  CanvasError,
  createDoc,
  createState,
  deleteBlock,
  docsOf,
  editBlock,
  insertBlock,
  liveBlocks,
  mergeBlocks,
  moveBlock,
  proposeDelete,
  proposeMove,
  proposeReplace,
  rejectAll,
  rejectBlock,
  renameDoc,
  setDocStyle,
  splitBlock,
  toMarkdown,
  duplicateDoc,
  importDoc,
  acceptAllOrder,
  visibleBlocks,
  type CanvasState,
  type Ctx,
} from "./canvas.js";
import { applyOperations } from "./canvas/apply.js";
import { Block, BlockRevision, Doc } from "./blocks.js";
import type { Operation } from "./operations.js";

let tick = 0;
const ctx: Ctx = {
  now: () => new Date(Date.UTC(2026, 9, 29, 12, 0, 0, tick++)).toISOString(),
  newId: () => ulid(),
};
const ev = () => ulid();
const THREAD = ulid();

let state: CanvasState;
let doc: string;

function para(content: string, after = "start", docId = doc) {
  return insertBlock(state, ctx, { doc_id: docId, after, type: "paragraph", content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;
}
const contents = (docId = doc) => liveBlocks(state, docId).map((b) => b.content);

beforeEach(() => {
  state = createState("s");
  doc = createDoc(state, ctx, { thread_id: THREAD, name: "Untitled", created_by: "teacher" }).doc.id;
});

describe("docs", () => {
  it("creates docs in a thread, lists them oldest first per thread, and renames", () => {
    const other = ulid();
    const b = createDoc(state, ctx, { thread_id: THREAD, name: "Second", created_by: "model" });
    createDoc(state, ctx, { thread_id: other, name: "Elsewhere", created_by: "teacher" });
    expect(docsOf(state, THREAD).map((d) => d.name)).toEqual(["Untitled", "Second"]);
    expect(docsOf(state).map((d) => d.name)).toEqual(["Untitled", "Second", "Elsewhere"]);
    expect(Doc.parse(b.doc)).toEqual(b.doc);
    const r = renameDoc(state, ctx, { doc_id: doc, name: "Metaphors and similes" });
    expect(r.changes.docs).toEqual([r.doc]);
    expect(state.docs.get(doc)?.name).toBe("Metaphors and similes");
  });

  it("sets a doc's font and page colour, a copy keeps them, and an empty style is the default", () => {
    const r = setDocStyle(state, ctx, { doc_id: doc, style: { font: "lexend", background: "cream" } });
    expect(r.changes.docs).toEqual([r.doc]);
    expect(Doc.parse(r.doc).style).toEqual({ font: "lexend", background: "cream" });
    expect(duplicateDoc(state, ctx, { doc_id: doc, name: "Copy", cause_event_id: ev() }).doc.style).toEqual({ font: "lexend", background: "cream" });
    setDocStyle(state, ctx, { doc_id: doc, style: { background: "blue" } });
    expect(state.docs.get(doc)?.style).toEqual({ background: "blue" });
    setDocStyle(state, ctx, { doc_id: doc, style: {} });
    expect(state.docs.get(doc)).not.toHaveProperty("style");
  });

  it("refuses a duplicate doc id and an unknown doc", () => {
    expect(() => createDoc(state, ctx, { thread_id: THREAD, name: "x", created_by: "teacher", id: doc })).toThrow(CanvasError);
    expect(() => renameDoc(state, ctx, { doc_id: ulid(), name: "x" })).toThrow(/unknown doc/);
    expect(() => para("x", "start", ulid())).toThrow(/unknown doc/);
  });

  it("rebuilds from rows and keeps order", () => {
    const a = para("A");
    para("B", a.id);
    const rebuilt = createState("s", [...state.blocks.values()], [...state.docs.values()]);
    expect(liveBlocks(rebuilt, doc).map((b) => b.content)).toEqual(["A", "B"]);
  });
});

describe("insertBlock", () => {
  it("assigns version 1 and a revision with before null", () => {
    const r = insertBlock(state, ctx, { doc_id: doc, after: "start", type: "paragraph", content: "Hi", origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() });
    expect(Block.parse(r.block)).toEqual(r.block);
    expect(r.block.version).toBe(1);
    expect(r.changes.revisions).toHaveLength(1);
    expect(BlockRevision.parse(r.changes.revisions[0])).toMatchObject({ before: null, after: { content: "Hi" }, actor: "teacher" });
  });

  it("places after an anchor and renumbers the rest", () => {
    const a = para("A");
    const c = para("C", a.id);
    para("B", a.id);
    expect(contents()).toEqual(["A", "B", "C"]);
    expect(visibleBlocks(state, doc).map((b) => b.order)).toEqual([0, 1, 2]);
    expect(state.blocks.get(c.id)?.order).toBe(2);
  });

  it("rejects an anchor in another doc, a deleted anchor and a duplicate id", () => {
    const a = para("A");
    const other = createDoc(state, ctx, { thread_id: THREAD, name: "Other", created_by: "teacher" }).doc.id;
    expect(() => para("x", a.id, other)).toThrow(/cannot place/);
    deleteBlock(state, ctx, { block_id: a.id });
    expect(() => para("x", a.id)).toThrow(/cannot place/);
    const b = para("B");
    expect(() => insertBlock(state, ctx, { doc_id: doc, id: b.id, after: "start", type: "paragraph", content: "", origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() })).toThrow(/already exists/);
  });
});

describe("editBlock", () => {
  it("records a teacher revision with before and after and bumps the version", () => {
    const a = para("Hello");
    const r = editBlock(state, ctx, { block_id: a.id, after: { content: "Hello world" }, cause_event_id: ev() });
    expect(r.block.version).toBe(2);
    expect(r.changes.revisions[0]).toMatchObject({ before: { content: "Hello" }, after: { content: "Hello world" }, actor: "teacher" });
  });

  it("does not add a revision when content is unchanged", () => {
    const a = para("Same");
    expect(editBlock(state, ctx, { block_id: a.id, after: { content: "Same" }, cause_event_id: ev() }).changes.revisions).toEqual([]);
  });

  it("typing into a proposed block accepts it; into a pending replace records the model revision first", () => {
    const p = insertBlock(state, ctx, { doc_id: doc, after: "start", type: "paragraph", content: "Model", origin: "model", status: "proposed", actor: "model", cause_event_id: ev() }).block;
    expect(editBlock(state, ctx, { block_id: p.id, after: { content: "Model!" }, cause_event_id: ev() })).toMatchObject({ implicit_accept: true, block: { status: "live" } });
    const a = para("Old", p.id);
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t", content: "New" });
    const r = editBlock(state, ctx, { block_id: a.id, after: { content: "New, edited" }, cause_event_id: ev() });
    expect(r.changes.revisions.map((x) => [x.actor, x.after.content])).toEqual([
      ["model", "New"],
      ["teacher", "New, edited"],
    ]);
    expect(r.block.pending).toBeNull();
  });

  it("refuses to edit a deleted or rejected block", () => {
    const a = para("A");
    deleteBlock(state, ctx, { block_id: a.id });
    expect(() => editBlock(state, ctx, { block_id: a.id, after: { content: "x" }, cause_event_id: ev() })).toThrow(/is deleted/);
  });
});

describe("proposals on existing blocks", () => {
  it("replace: accept records a model revision; reject leaves content and version untouched", () => {
    const a = para("A");
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t", content: "A2" });
    rejectBlock(state, ctx, { block_id: a.id });
    expect(state.blocks.get(a.id)).toMatchObject({ content: "A", version: 1, pending: null });
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t", content: "A3" });
    const r = acceptBlock(state, ctx, { block_id: a.id, cause_event_id: ev() });
    expect(r.block).toMatchObject({ content: "A3", version: 2 });
    expect(r.changes.revisions[0]?.actor).toBe("model");
  });

  it("delete: accept sets status deleted and renumbers; move: accept reorders", () => {
    const a = para("A");
    const b = para("B", a.id);
    const c = para("C", b.id);
    proposeDelete(state, ctx, { block_id: b.id, turn_id: "t" });
    acceptBlock(state, ctx, { block_id: b.id, cause_event_id: ev() });
    expect(contents()).toEqual(["A", "C"]);
    expect(state.blocks.get(b.id)?.status).toBe("deleted");
    proposeMove(state, ctx, { block_id: c.id, turn_id: "t", after: "start" });
    acceptBlock(state, ctx, { block_id: c.id, cause_event_id: ev() });
    expect(contents()).toEqual(["C", "A"]);
  });

  it("accept with nothing pending throws; moves across docs are refused", () => {
    const a = para("A");
    expect(() => acceptBlock(state, ctx, { block_id: a.id, cause_event_id: ev() })).toThrow(/no proposal/);
    const other = createDoc(state, ctx, { thread_id: THREAD, name: "Other", created_by: "teacher" }).doc.id;
    const x = para("X", "start", other);
    expect(() => proposeMove(state, ctx, { block_id: a.id, turn_id: "t", after: x.id })).toThrow(/across docs/);
    expect(() => moveBlock(state, ctx, { block_id: a.id, after: x.id })).toThrow(/across docs/);
  });
});

describe("split and merge", () => {
  it("split keeps the first id, derives the second (with the editor's id), and merge reverses it", () => {
    const a = para("Hello world");
    const id = ulid();
    const s = splitBlock(state, ctx, { block_id: a.id, first: { content: "Hello" }, second: { content: "world" }, second_id: id, cause_event_id: ev() });
    expect(s.second).toMatchObject({ id, derived_from: a.id, doc_id: doc });
    expect(contents()).toEqual(["Hello", "world"]);
    mergeBlocks(state, ctx, { block_id: id, merged_into: a.id, after: { content: "Hello world" }, cause_event_id: ev() });
    expect(contents()).toEqual(["Hello world"]);
    expect(state.blocks.get(id)?.status).toBe("deleted");
  });
});

describe("applyOperations", () => {
  it("inserts default to the open doc and keep list order for a shared anchor", () => {
    const r = applyOperations(state, ctx, {
      operations: [
        { op: "insert", after: "start", type: "heading", content: "# Title" },
        { op: "insert", after: "start", type: "paragraph", content: "One" },
        { op: "insert", after: "start", type: "paragraph", content: "Two" },
      ],
      turn_id: "t",
      cause_event_id: ev(),
      thread_id: THREAD,
      default_doc_id: doc,
    });
    expect(visibleBlocks(state, doc).map((b) => [b.content, b.status, b.origin])).toEqual([
      ["# Title", "proposed", "model"],
      ["One", "proposed", "model"],
      ["Two", "proposed", "model"],
    ]);
    expect(r.proposed_block_ids).toHaveLength(3);
    expect(r.produced.every((p) => p.doc_id === doc)).toBe(true);
  });

  it("changes its own suggestions in place: rewrite, move and withdraw them, and they stay suggestions", () => {
    const go = (operations: Operation[]) => applyOperations(state, ctx, { operations, turn_id: ulid(), cause_event_id: ev(), thread_id: THREAD, default_doc_id: doc });
    const made = go([
      { op: "insert", after: "start", type: "paragraph", content: "Sun ☀️" },
      { op: "insert", after: "start", type: "paragraph", content: "Wind 💨" },
      { op: "insert", after: "start", type: "paragraph", content: "Bear 🐻" },
    ]);
    const [sun, wind, bear] = made.proposed_block_ids as [string, string, string];
    const r = go([
      { op: "replace", id: sun, content: "Sun" },
      { op: "move", id: bear, after: "start" },
      { op: "delete", id: wind },
    ]);
    expect(visibleBlocks(state, doc).map((b) => [b.content, b.status, b.pending])).toEqual([
      ["Bear 🐻", "proposed", null],
      ["Sun", "proposed", null],
    ]);
    expect(state.blocks.get(wind)!.status).toBe("deleted");
    // The rewrite is a revision by the model; the withdrawn one is nothing to decide on.
    expect(r.changes.revisions.map((x) => [x.block_id, x.actor, x.after.content])).toEqual([[sun, "model", "Sun"]]);
    expect(r.proposed_block_ids).toEqual([sun, bear]);
  });

  it("create_doc makes a doc in the thread that later inserts fill through its temp id", () => {
    const r = applyOperations(state, ctx, {
      operations: [
        { op: "create_doc", temp_id: "d1", name: "Simpler version" },
        { op: "insert", doc: "d1", after: "start", type: "paragraph", content: "Short" },
      ],
      turn_id: "t",
      cause_event_id: ev(),
      thread_id: THREAD,
      default_doc_id: doc,
    });
    const newDoc = r.doc_ids.d1!;
    expect(r.created_doc_ids).toEqual([newDoc]);
    expect(state.docs.get(newDoc)).toMatchObject({ thread_id: THREAD, name: "Simpler version", created_by: "model" });
    expect(visibleBlocks(state, newDoc).map((b) => b.content)).toEqual(["Short"]);
    expect(visibleBlocks(state, doc)).toEqual([]);
  });

  it("acceptAll and rejectAll act on one doc only", () => {
    const other = createDoc(state, ctx, { thread_id: THREAD, name: "Other", created_by: "teacher" }).doc.id;
    applyOperations(state, ctx, { operations: [{ op: "insert", after: "start", type: "paragraph", content: "here" }], turn_id: "t", cause_event_id: ev(), thread_id: THREAD, default_doc_id: doc });
    applyOperations(state, ctx, { operations: [{ op: "insert", after: "start", type: "paragraph", content: "there" }], turn_id: "t", cause_event_id: ev(), thread_id: THREAD, default_doc_id: other });
    expect(acceptAll(state, ctx, { doc_id: doc, cause_event_id: ev() }).block_ids).toHaveLength(1);
    expect(contents()).toEqual(["here"]);
    expect(visibleBlocks(state, other)[0]?.status).toBe("proposed");
    expect(rejectAll(state, ctx, { doc_id: other }).block_ids).toHaveLength(1);
    expect(visibleBlocks(state, other)).toEqual([]);
  });
});

describe("toMarkdown", () => {
  it("renders a doc's live blocks and skips proposed ones", () => {
    const h = insertBlock(state, ctx, { doc_id: doc, after: "start", type: "heading", content: "# Similes", origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;
    para("A simile uses like or as.", h.id);
    applyOperations(state, ctx, { operations: [{ op: "insert", after: "start", type: "paragraph", content: "not yet" }], turn_id: "t", cause_event_id: ev(), thread_id: THREAD, default_doc_id: doc });
    expect(toMarkdown(state, doc)).toBe("# Similes\n\nA simile uses like or as.\n");
  });

  it("writes a line break inside a paragraph as a markdown hard break", () => {
    para("Write your own:\nThe thunder was ...", "start");
    expect(toMarkdown(state, doc)).toBe("Write your own:  \nThe thunder was ...\n");
  });

  it("writes a run of list items as one list, numbered as shown", () => {
    const item = (content: string, after: string) => insertBlock(state, ctx, { doc_id: doc, after, type: "numbered_item", content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;
    const a = item("1. One", "start");
    const b = item("1. Two", a.id);
    para("After", b.id);
    expect(toMarkdown(state, doc)).toBe("1. One\n2. Two\n\nAfter\n");
  });
});

describe("importDoc", () => {
  it("brings a whole-list block in as its items", () => {
    const r = importDoc(state, ctx, { thread_id: THREAD, name: "Ref", blocks: [{ type: "heading", content: "# R" }, { type: "bullet_list", content: "- a\n- b" }], cause_event_id: ev() });
    expect(liveBlocks(state, r.doc.id).map((b) => [b.type, b.content])).toEqual([
      ["heading", "# R"],
      ["bullet_item", "- a"],
      ["bullet_item", "- b"],
    ]);
  });
});

describe("duplicateDoc", () => {
  it("copies the live blocks in order into a new teacher doc in the same thread, without suggestions", () => {
    const a = para("First");
    const b = para("Second", a.id);
    applyOperations(state, ctx, {
      operations: [
        { op: "replace", id: a.id, content: "Suggested" },
        { op: "insert", after: b.id, type: "paragraph", content: "Proposed" },
      ],
      turn_id: "t",
      cause_event_id: ev(),
      thread_id: THREAD,
      default_doc_id: doc,
    });
    const r = duplicateDoc(state, ctx, { doc_id: doc, name: "Copy", cause_event_id: ev() });
    expect(r.doc).toMatchObject({ thread_id: THREAD, name: "Copy", created_by: "teacher" });
    const copied = [...state.blocks.values()].filter((x) => x.doc_id === r.doc.id).sort((x, y) => x.order - y.order);
    expect(copied.map((x) => [x.content, x.status, x.origin, x.derived_from, x.pending])).toEqual([
      ["First", "live", "teacher", a.id, null],
      ["Second", "live", "teacher", b.id, null],
    ]);
    expect(r.changes.docs).toEqual([r.doc]);
    expect(r.changes.revisions).toHaveLength(2);
    expect(() => duplicateDoc(state, ctx, { doc_id: "nope", name: "x", cause_event_id: ev() })).toThrow(/unknown doc|nope/);
  });
});

describe("applyOperations order", () => {
  const order = (docId: string) => liveOrProposed(docId).map((b) => b.content);
  const liveOrProposed = (docId: string) =>
    [...state.blocks.values()].filter((b) => b.doc_id === docId && (b.status === "live" || b.status === "proposed")).sort((a, b) => a.order - b.order);
  const run = (operations: Parameters<typeof applyOperations>[2]["operations"]) =>
    applyOperations(state, ctx, { operations, turn_id: "t", cause_event_id: ev(), thread_id: THREAD, default_doc_id: doc });

  it("fills a new doc top to bottom from inserts that all say after start", () => {
    const r = run([
      { op: "create_doc", temp_id: "d1", name: "Similes" },
      { op: "insert", doc: "d1", after: "start", type: "heading", content: "# Similes" },
      { op: "insert", doc: "d1", after: "start", type: "heading", content: "## Part 1" },
      { op: "insert", doc: "d1", after: "start", type: "paragraph", content: "Read each sentence." },
    ]);
    expect(order(r.created_doc_ids[0]!)).toEqual(["# Similes", "## Part 1", "Read each sentence."]);
  });

  it("chains inserts after earlier inserts' temp_ids, and mixes with a shared anchor", () => {
    const a = para("Intro");
    run([
      { op: "insert", after: a.id, type: "heading", content: "## One", temp_id: "h1" },
      { op: "insert", after: "h1", type: "paragraph", content: "one text", temp_id: "p1" },
      { op: "insert", after: "p1", type: "heading", content: "## Two" },
      { op: "insert", after: "start", type: "paragraph", content: "top 1" },
      { op: "insert", after: "start", type: "paragraph", content: "top 2" },
    ]);
    expect(order(doc)).toEqual(["top 1", "top 2", "Intro", "## One", "one text", "## Two"]);
  });
});

describe("acceptAll with a chain of moves", () => {
  it("reverses a back-to-front doc when the model writes the reorder as a chain of moves", () => {
    const c = para("C");
    const b = para("B", c.id);
    const a = para("A", b.id);
    // The doc reads C, B, A; the model asks for A first, then B after A, then C after B.
    applyOperations(state, ctx, {
      operations: [
        { op: "move", id: a.id, after: "start" },
        { op: "move", id: b.id, after: a.id },
        { op: "move", id: c.id, after: b.id },
      ],
      turn_id: "t",
      cause_event_id: ev(),
      thread_id: THREAD,
      default_doc_id: doc,
    });
    acceptAll(state, ctx, { doc_id: doc, cause_event_id: ev() });
    expect(liveBlocks(state, doc).map((x) => x.content)).toEqual(["A", "B", "C"]);
  });

  it("orders accepts: non-moves first, then moves after the moves they follow, and survives a cycle", () => {
    const p = (id: string, pending: { op: string; after?: string } | null) => ({ id, pending });
    const order = acceptAllOrder([p("X", { op: "move", after: "Y" }), p("R", { op: "replace" }), p("Y", { op: "move", after: "start" }), p("N", null)]);
    expect(order.map((b) => b.id)).toEqual(["R", "N", "Y", "X"]);
    expect(acceptAllOrder([p("A", { op: "move", after: "B" }), p("B", { op: "move", after: "A" })]).map((b) => b.id)).toEqual(["A", "B"]);
  });
});
