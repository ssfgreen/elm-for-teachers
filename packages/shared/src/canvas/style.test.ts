import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { CanvasError, createDoc, createState, decideStyle, duplicateDoc, setDocStyle, type CanvasState, type Ctx } from "../canvas.js";
import { applyOperations } from "./apply.js";
import { Doc } from "../blocks.js";
import { Operation } from "../operations.js";

const ctx: Ctx = { now: () => new Date().toISOString(), newId: () => ulid() };
const THREAD = ulid();
let state: CanvasState;
let doc: string;

beforeEach(() => {
  state = createState("s");
  doc = createDoc(state, ctx, { thread_id: THREAD, name: "Untitled", created_by: "teacher" }).doc.id;
});

const apply = (operations: Operation[], turn_id = "t1") => applyOperations(state, ctx, { operations, turn_id, cause_event_id: ulid(), thread_id: THREAD, default_doc_id: doc });

describe("the model's suggested style", () => {
  it("is a suggestion on the open doc, not its style, until the teacher accepts it", () => {
    setDocStyle(state, ctx, { doc_id: doc, style: { font: "arial" } });
    const r = apply([{ op: "set_style", background: "green" }]);
    expect(r.styled_doc_ids).toEqual([doc]);
    expect(r.changes.docs.map((d) => d.id)).toEqual([doc]);
    const d = state.docs.get(doc)!;
    expect(Doc.parse(d).proposed_style).toEqual({ style: { background: "green" }, turn_id: "t1" });
    expect(d.style).toEqual({ font: "arial" });

    const out = decideStyle(state, ctx, { doc_id: doc, accept: true });
    expect(out.proposed.style).toEqual({ background: "green" });
    expect(d.style).toEqual({ font: "arial", background: "green" });
    expect(d.proposed_style).toBeUndefined();
  });

  it("a reject leaves the style as it was; deciding twice is an error", () => {
    apply([{ op: "set_style", font: "comic_sans" }]);
    decideStyle(state, ctx, { doc_id: doc, accept: false });
    expect(state.docs.get(doc)?.style).toBeUndefined();
    expect(state.docs.get(doc)?.proposed_style).toBeUndefined();
    expect(() => decideStyle(state, ctx, { doc_id: doc, accept: true })).toThrow(CanvasError);
  });

  it("a later suggestion adds to the one waiting, and a new doc can be styled in the same turn", () => {
    apply([{ op: "set_style", font: "lexend" }]);
    const r = apply(
      [
        { op: "set_style", background: "yellow" },
        { op: "create_doc", temp_id: "d1", name: "Copy" },
        { op: "set_style", doc: "d1", background: "blue" },
      ],
      "t2",
    );
    expect(state.docs.get(doc)?.proposed_style).toEqual({ style: { font: "lexend", background: "yellow" }, turn_id: "t2" });
    const created = r.doc_ids.d1!;
    expect(r.styled_doc_ids).toEqual([doc, created]);
    expect(state.docs.get(created)?.proposed_style?.style).toEqual({ background: "blue" });
  });

  it("a copy of the doc does not carry the suggestion", () => {
    apply([{ op: "set_style", background: "pink" }]);
    expect(duplicateDoc(state, ctx, { doc_id: doc, name: "Copy", cause_event_id: ulid() }).doc.proposed_style).toBeUndefined();
  });

  it("only takes the colours and fonts the toolbar has", () => {
    expect(Operation.safeParse({ op: "set_style", background: "light_green" }).success).toBe(false);
    expect(Operation.safeParse({ op: "set_style", background: "green", font: "lexend" }).success).toBe(true);
  });
});
