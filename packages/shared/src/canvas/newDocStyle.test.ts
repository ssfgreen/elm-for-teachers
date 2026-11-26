import { describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDoc, createState, duplicateDoc, importDoc, setDocStyle, type Ctx } from "../canvas.js";
import { applyOperations } from "./apply.js";

const THREAD = ulid();
const plain: Ctx = { now: () => new Date().toISOString(), newId: () => ulid() };
const lexend: Ctx = { ...plain, newDocStyle: { font: "lexend" } };

describe("the font new docs start in (the teacher's preference)", () => {
  it("a new doc, an imported one and the model's new doc start in it; without one they have no style", () => {
    const s = createState("s");
    expect(createDoc(s, plain, { thread_id: THREAD, name: "A", created_by: "teacher" }).doc.style).toBeUndefined();
    expect(createDoc(s, lexend, { thread_id: THREAD, name: "B", created_by: "teacher" }).doc.style).toEqual({ font: "lexend" });
    expect(importDoc(s, lexend, { thread_id: THREAD, name: "C", blocks: [{ type: "paragraph", content: "Hi" }], cause_event_id: ulid() }).doc.style).toEqual({ font: "lexend" });
    const open = createDoc(s, plain, { thread_id: THREAD, name: "Open", created_by: "teacher" }).doc.id;
    const r = applyOperations(s, lexend, { operations: [{ op: "create_doc", temp_id: "d1", name: "Simpler" }], turn_id: "t1", cause_event_id: ulid(), thread_id: THREAD, default_doc_id: open });
    expect(s.docs.get(r.doc_ids.d1!)?.style).toEqual({ font: "lexend" });
  });

  it("each doc has its own copy of the style", () => {
    const s = createState("s");
    const a = createDoc(s, lexend, { thread_id: THREAD, name: "A", created_by: "teacher" }).doc;
    const b = createDoc(s, lexend, { thread_id: THREAD, name: "B", created_by: "teacher" }).doc;
    setDocStyle(s, plain, { doc_id: a.id, style: { font: "arial" } });
    expect(b.style).toEqual({ font: "lexend" });
    expect(lexend.newDocStyle).toEqual({ font: "lexend" });
  });

  it("a copy looks like the doc it copies, not the preference", () => {
    const s = createState("s");
    const source = createDoc(s, plain, { thread_id: THREAD, name: "A", created_by: "teacher" }).doc;
    expect(duplicateDoc(s, lexend, { doc_id: source.id, name: "A (copy)", cause_event_id: ulid() }).doc.style).toBeUndefined();
    setDocStyle(s, plain, { doc_id: source.id, style: { font: "georgia", background: "cream" } });
    expect(duplicateDoc(s, lexend, { doc_id: source.id, name: "A (copy 2)", cause_event_id: ulid() }).doc.style).toEqual({ font: "georgia", background: "cream" });
  });
});
