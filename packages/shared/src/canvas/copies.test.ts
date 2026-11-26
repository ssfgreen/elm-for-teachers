import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDoc, createState, getBlock, insertBlock, proposeDelete, proposeReplace, visibleBlocks, type CanvasState, type Ctx } from "../canvas.js";
import { applyOperations, takeTurnIn } from "./apply.js";
import { copySource, copyTempId, waitingIn } from "./copies.js";
import type { Operation } from "../operations.js";

let tick = 0;
const ctx: Ctx = { now: () => new Date(Date.UTC(2026, 10, 11, 12, 0, 0, tick++)).toISOString(), newId: () => ulid() };
const ev = () => ulid();
let state: CanvasState;
let source: string;
const thread = ulid();

beforeEach(() => {
  state = createState("s");
  const d = createDoc(state, ctx, { thread_id: thread, name: "Bannockburn sources", created_by: "teacher" }).doc;
  d.style = { font: "comic_sans" };
  source = d.id;
});

let last = "start";
const live = (content: string, type: "heading" | "paragraph" = "paragraph") => {
  const b = insertBlock(state, ctx, { doc_id: source, after: last, type, content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;
  last = b.id;
  return b;
};
const suggested = (content: string, after: string) =>
  insertBlock(state, ctx, { doc_id: source, after, type: "paragraph", content, origin: "model", origin_turn: "t1", status: "proposed", actor: "model", cause_event_id: ev() }).block;

const turn = (operations: Operation[], copy_choices?: Record<string, "approve_all" | "approved_only" | "all_and_leave">) =>
  applyOperations(state, ctx, { operations, turn_id: "t2", cause_event_id: ev(), thread_id: thread, default_doc_id: source, ...(copy_choices ? { copy_choices } : {}) });

beforeEach(() => {
  last = "start";
});

describe("copy_of on create_doc", () => {
  it("copies the source's blocks in order as suggestions, each derived from its source, with the source's style", () => {
    const a = live("Task 1", "heading");
    const b = live("Read source A.");
    const r = turn([{ op: "create_doc", temp_id: "copy", name: "Bannockburn (short)", copy_of: source }]);
    const docId = r.doc_ids.copy!;
    const copied = visibleBlocks(state, docId);
    expect(copied.map((x) => [x.type, x.content, x.derived_from, x.status, x.origin, x.origin_turn])).toEqual([
      ["heading", "Task 1", a.id, "proposed", "model", "t2"],
      ["paragraph", "Read source A.", b.id, "proposed", "model", "t2"],
    ]);
    expect(state.docs.get(docId)?.style).toEqual({ font: "comic_sans" });
    expect(r.copies).toEqual([
      { doc_id: docId, from: a.id, block_id: copied[0]!.id },
      { doc_id: docId, from: b.id, block_id: copied[1]!.id },
    ]);
    expect(r.proposed_block_ids).toEqual(copied.map((x) => x.id));
  });

  it("lets later operations in the turn name a copied block by its temp id", () => {
    const a = live("Task 1");
    const b = live("Answer: Primary");
    const r = turn([
      { op: "create_doc", temp_id: "copy", name: "Copy", copy_of: source },
      { op: "replace", id: copyTempId("copy", b.id), content: "Answer: Secondary" },
      { op: "delete", id: copyTempId("copy", a.id) },
      { op: "insert", doc: "copy", after: copyTempId("copy", b.id), type: "paragraph", content: "Extension" },
    ]);
    const copied = visibleBlocks(state, r.doc_ids.copy!);
    expect(copied.map((x) => x.content)).toEqual(["Answer: Secondary", "Extension"]);
    expect(copied[0]!.derived_from).toBe(b.id);
    // The source is untouched.
    expect(getBlock(state, b.id)).toMatchObject({ content: "Answer: Primary", pending: null });
  });

  it("copies live text only when the teacher chose Use only approved", () => {
    const a = live("Edward I");
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t1", content: "Edward II" });
    suggested("Extension task", a.id);
    const r = turn([{ op: "create_doc", temp_id: "copy", name: "Copy", copy_of: source }], { [source]: "approved_only" });
    expect(visibleBlocks(state, r.doc_ids.copy!).map((x) => x.content)).toEqual(["Edward I"]);
  });

  it("copies the source as if every suggestion were accepted with Use all and leave, and leaves them waiting", () => {
    const a = live("Edward I");
    const gone = live("A line to delete");
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t1", content: "Edward II" });
    proposeDelete(state, ctx, { block_id: gone.id, turn_id: "t1" });
    const ext = suggested("Extension task", gone.id);
    const r = turn([{ op: "create_doc", temp_id: "copy", name: "Copy", copy_of: source }], { [source]: "all_and_leave" });
    const copied = visibleBlocks(state, r.doc_ids.copy!);
    expect(copied.map((x) => [x.content, x.derived_from])).toEqual([
      ["Edward II", a.id],
      ["Extension task", ext.id],
    ]);
    expect(getBlock(state, a.id).pending).toMatchObject({ op: "replace" });
    expect(getBlock(state, ext.id).status).toBe("proposed");
  });

  it("does not count this turn's own suggestions on the source in the copy", () => {
    const a = live("Edward I");
    const r = turn([
      { op: "replace", id: a.id, content: "Edward II" },
      { op: "create_doc", temp_id: "copy", name: "Copy", copy_of: source },
    ]);
    expect(visibleBlocks(state, r.doc_ids.copy!).map((x) => x.content)).toEqual(["Edward I"]);
  });
});

describe("a copy in Editing mode", () => {
  it("takes the copy in, with a copied block changed later in the turn, once", () => {
    live("Task 1");
    const b = live("Answer: Primary");
    const cause = ev();
    const r = applyOperations(state, ctx, {
      operations: [
        { op: "create_doc", temp_id: "c", name: "Copy", copy_of: source },
        { op: "replace", id: copyTempId("c", b.id), content: "Answer: Secondary" },
      ],
      turn_id: "t2",
      cause_event_id: cause,
      thread_id: thread,
      default_doc_id: source,
    });
    expect(new Set(r.proposed_block_ids).size).toBe(r.proposed_block_ids.length);
    takeTurnIn(state, ctx, r, cause);
    expect(visibleBlocks(state, r.doc_ids.c!).map((x) => [x.content, x.status])).toEqual([
      ["Task 1", "live"],
      ["Answer: Secondary", "live"],
    ]);
  });
});

describe("copySource and waitingIn", () => {
  it("needs the teacher's choice only when suggestions are waiting", () => {
    const a = live("One");
    expect(copySource(state, source)?.map((b) => b.id)).toEqual([a.id]);
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t1", content: "Two" });
    expect(waitingIn([...state.blocks.values()], source)).toBe(1);
    expect(copySource(state, source)).toBeNull();
    expect(copySource(state, source, "approve_all")?.map((b) => b.content)).toEqual(["One"]);
    expect(copySource(state, source, "all_and_leave")?.map((b) => b.content)).toEqual(["Two"]);
  });
});

describe("from on insert", () => {
  it("sets derived_from on the new block", () => {
    const a = live("Simile: a comparison using like or as. Metaphor: says one thing is another.");
    const r = turn([{ op: "insert", after: a.id, type: "paragraph", content: "Metaphor: says one thing is another.", from: a.id }]);
    expect(getBlock(state, r.proposed_block_ids[0]!).derived_from).toBe(a.id);
  });
});
