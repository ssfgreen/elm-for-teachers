import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDoc, createState, insertBlock, proposeReplace, splitBlock, type CanvasState, type Ctx } from "./canvas.js";
import { copyTempId } from "./canvas/copies.js";
import type { BlockType } from "./enums.js";
import type { Operation } from "./operations.js";
import { contentChanged, normalise, turnEffect, type EffectItem } from "./turn-effect.js";

let tick = 0;
const ctx: Ctx = { now: () => new Date(Date.UTC(2026, 10, 11, 12, 0, 0, tick++)).toISOString(), newId: () => ulid() };
const ev = () => ulid();
const thread = ulid();
let state: CanvasState;
let doc: string;
let last: string;

beforeEach(() => {
  state = createState("s");
  doc = createDoc(state, ctx, { thread_id: thread, name: "Similes and Metaphors", created_by: "teacher" }).doc.id;
  last = "start";
});

const live = (content: string, type: BlockType = "paragraph", d = doc) => {
  const b = insertBlock(state, ctx, { doc_id: d, after: d === doc ? last : "start", type, content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: ev() }).block;
  if (d === doc) last = b.id;
  return b;
};

/** The effect of one turn on the state as it is now (the docs at commit). */
const effect = (operations: Operation[], extra: Partial<Parameters<typeof turnEffect>[0]> = {}) =>
  turnEffect({ blocks: [...state.blocks.values()], docs: [...state.docs.values()], operations, turn_id: "t2", thread_id: thread, default_doc_id: doc, ...extra });
const kinds = (items: EffectItem[]) => items.map((i) => i.kind);

describe("turnEffect: each kind", () => {
  it("removed: a block deleted in place, with its text", () => {
    const a = live("Learning intention: I can tell a simile from a metaphor.");
    live("About 20 minutes");
    const e = effect([{ op: "delete", id: a.id }]);
    expect(e.items).toEqual([{ kind: "removed", block_id: a.id, doc_id: doc, text: a.content }]);
  });

  it("changed: a block rewritten, with the text before and after", () => {
    const a = live("It took something like an hour to walk home.");
    const e = effect([{ op: "replace", id: a.id, content: "It took an hour to walk home, like a snail." }]);
    expect(e.items).toEqual([{ kind: "changed", block_id: a.id, to: a.id, doc_id: doc, before: a.content, after: "It took an hour to walk home, like a snail." }]);
    expect(contentChanged(e)).toBe(true);
  });

  it("added: a new block with no lineage", () => {
    const a = live("Task 1");
    const e = effect([{ op: "insert", after: a.id, type: "paragraph", content: "Extension: write your own metaphor." }]);
    expect(e.items).toEqual([expect.objectContaining({ kind: "added", doc_id: doc, text: "Extension: write your own metaphor." })]);
  });

  it("duplicated: two added blocks with the same text, and an added block equal to one already there", () => {
    const a = live("Task 1");
    const b = live("Name: ________");
    const e = effect([
      { op: "insert", after: a.id, type: "heading", content: "## Task 1 (continued)" },
      { op: "insert", after: b.id, type: "heading", content: "## Task 1 (continued)" },
      { op: "insert", after: b.id, type: "paragraph", content: "Name: ________" },
    ]);
    const dups = e.items.filter((i) => i.kind === "duplicated");
    expect(dups).toHaveLength(2);
    expect(dups[0]).toMatchObject({ text: "## Task 1 (continued)" });
    expect(dups[0]!.kind === "duplicated" && dups[0]!.block_ids).toHaveLength(2);
    expect(dups[1]).toMatchObject({ text: "Name: ________" });
    expect(dups[1]!.kind === "duplicated" && dups[1]!.block_ids).toContain(b.id);
  });

  it("built on a suggestion: an added block typing out a suggestion still waiting in a doc the turn copied or read", () => {
    const a = live("Task 2");
    const ext = insertBlock(state, ctx, { doc_id: doc, after: a.id, type: "paragraph", content: "Extension: compare two sources.", origin: "model", origin_turn: "t1", status: "proposed", actor: "model", cause_event_id: ev() }).block;
    const ops: Operation[] = [
      { op: "create_doc", temp_id: "c", name: "Copy", copy_of: doc },
      { op: "insert", doc: "c", after: copyTempId("c", a.id), type: "paragraph", content: "Extension: compare **two** sources." },
    ];
    // Suggestions wait in the source: the teacher chose to copy the approved text only.
    const e = effect(ops, { copy_choices: { [doc]: "approved_only" } });
    expect(e.items.find((i) => i.kind === "built_on_suggestion")).toMatchObject({ suggestion_id: ext.id });
    // Not when the doc was neither copied nor read.
    const other = effect([{ op: "insert", after: a.id, type: "paragraph", content: "Extension: compare two sources." }]);
    expect(kinds(other.items)).not.toContain("built_on_suggestion");
    expect(kinds(effect([{ op: "insert", after: a.id, type: "paragraph", content: "Extension: compare two sources." }], { read_doc_ids: [doc] }).items)).toContain("built_on_suggestion");
  });

  it("formatting: a change only to emphasis, quotes, spacing or column widths, which is not a content change", () => {
    const a = live("A simile uses 'like' or 'as'.");
    const t = live("| Sentence | Answer |\n| --- | --- |\n| 1 | Simile |", "table");
    const e = effect([
      { op: "replace", id: a.id, content: "A simile uses **‘like’**  or *‘as’*." },
      { op: "replace", id: t.id, content: "| Sentence |   Answer |\n| --- | --- |\n| 1 | Simile |\n<!-- colwidths: 60 0 -->" },
    ]);
    expect(kinds(e.items)).toEqual(["formatting", "formatting"]);
    expect(contentChanged(e)).toBe(false);
  });
});

describe("contentChanged", () => {
  it("is false for a copy with nothing changed, and for moves alone: they need no judge", () => {
    live("Learning intention");
    const b = live("About 20 minutes");
    expect(contentChanged(effect([{ op: "create_doc", temp_id: "c", name: "Copy", copy_of: doc }]))).toBe(false);
    expect(contentChanged(effect([{ op: "move", id: b.id, after: "start" }]))).toBe(false);
    expect(contentChanged(effect([{ op: "create_doc", temp_id: "c", name: "Copy", copy_of: doc }, { op: "delete", id: copyTempId("c", b.id) }]))).toBe(true);
  });
});

describe("turnEffect: lineage", () => {
  it("a reworded copy is changed, not removed; a block left out of a copy is removed from it", () => {
    const li = live("Learning intention: I can tell a simile from a metaphor.");
    const time = live("About 20 minutes");
    const q = live("1. The snow was a white blanket.");
    const e = effect([
      { op: "create_doc", temp_id: "c", name: "Shorter", copy_of: doc },
      { op: "delete", id: copyTempId("c", li.id) },
      { op: "replace", id: copyTempId("c", q.id), content: "1. The snow was a blanket." },
    ]);
    const copyDoc = e.created_doc_ids[0]!;
    expect(e.items.filter((i) => i.kind !== "moved")).toEqual([
      { kind: "removed", block_id: li.id, doc_id: copyDoc, text: li.content, from_copy: true },
      expect.objectContaining({ kind: "changed", block_id: q.id, doc_id: copyDoc, before: q.content, after: "1. The snow was a blanket." }),
    ]);
    // Every copied block that stayed is a descendant in another doc.
    expect(e.items.filter((i) => i.kind === "moved").map((i) => i.kind === "moved" && [i.block_id, i.copy])).toEqual([
      [time.id, true],
      [q.id, true],
    ]);
  });

  it("a definition moved into a block of its own with from is moved, not changed", () => {
    const a = live("Simile: compares using like or as. Metaphor: says one thing is another.");
    live("Task 1");
    const e = effect([
      { op: "replace", id: a.id, content: "Simile: compares using like or as." },
      { op: "insert", after: a.id, type: "paragraph", content: "Metaphor: says one thing is another.", from: a.id },
    ]);
    expect(e.items).toEqual([expect.objectContaining({ kind: "moved", block_id: a.id, doc_id: doc, copy: false })]);
  });

  it("a block deleted in one place and written again elsewhere with from is moved", () => {
    const a = live("Metaphor: says one thing is another.");
    const b = live("Task 1");
    const e = effect([
      { op: "delete", id: a.id },
      { op: "insert", after: b.id, type: "paragraph", content: "Metaphor: says one thing is another.", from: a.id },
    ]);
    expect(kinds(e.items)).toEqual(["moved"]);
  });

  it("a teacher's split during the turn is not the turn's: lineage goes only through the turn's blocks", () => {
    const a = live("First half. Second half.");
    // The teacher pressed Enter mid-turn: already in the docs at commit.
    const s = splitBlock(state, ctx, { block_id: a.id, first: { content: "First half." }, second: { content: "Second half." }, cause_event_id: ev() });
    expect(effect([]).items).toEqual([]);
    const e = effect([{ op: "delete", id: s.second.id }]);
    expect(e.items).toEqual([{ kind: "removed", block_id: s.second.id, doc_id: doc, text: "Second half." }]);
  });

  it("does not count earlier turns' suggestions, and counts the turn's change to one", () => {
    const a = live("Edward I");
    const b = live("Answer: Primary");
    proposeReplace(state, ctx, { block_id: a.id, turn_id: "t1", content: "Edward II" });
    insertBlock(state, ctx, { doc_id: doc, after: b.id, type: "paragraph", content: "Extension task", origin: "model", origin_turn: "t1", status: "proposed", actor: "model", cause_event_id: ev() });
    expect(effect([]).items).toEqual([]);
    const e = effect([{ op: "replace", id: b.id, content: "Answer: Secondary" }]);
    expect(e.items).toEqual([expect.objectContaining({ kind: "changed", block_id: b.id, before: "Answer: Primary", after: "Answer: Secondary" })]);
    // A change to a block with an earlier suggestion waiting stays waiting in Editing mode, but it is still this turn's.
    const held = effect([{ op: "replace", id: a.id, content: "Edward III" }]);
    expect(held.items).toEqual([expect.objectContaining({ kind: "changed", block_id: a.id, before: "Edward II", after: "Edward III" })]);
  });

  it("leaves out docs opened from a reference file during the turn", () => {
    const opened = createDoc(state, ctx, { thread_id: thread, name: "Forces.docx", created_by: "teacher" }).doc.id;
    const r = live("Gravity pulls things down.", "paragraph", opened);
    const e = effect([{ op: "delete", id: r.id }], { exclude_doc_ids: [opened] });
    expect(e.items).toEqual([]);
  });
});

describe("turnEffect: lists", () => {
  it("reads a list edit, as expandListOps gives it, item by item: not as the list removed and added", () => {
    const one = live("1. Guided practice (10 minutes)", "numbered_item");
    live("2. Share and improve (10 minutes)", "numbered_item");
    const e = effect([
      { op: "replace", id: one.id, content: "1. Guided practice (15 minutes)" },
      { op: "insert", after: one.id, type: "numbered_item", content: "2. Exit ticket (5 minutes)" },
    ]);
    expect(kinds(e.items)).toEqual(["changed", "added"]);
  });
});

describe("turnEffect: empty blocks", () => {
  it("an empty block taken out, in place or left out of a copy, is formatting, not removed", () => {
    const a = live("Write your answer here.");
    const gap = live("");
    const e = effect([{ op: "delete", id: gap.id }]);
    expect(e.items).toEqual([{ kind: "formatting", block_id: gap.id, to: gap.id, doc_id: doc }]);
    expect(contentChanged(e)).toBe(false);
    const copy = effect([
      { op: "create_doc", temp_id: "c", name: "Copy", copy_of: doc },
      { op: "delete", id: copyTempId("c", gap.id) },
    ]);
    expect(kinds(copy.items).filter((k) => k !== "moved")).toEqual(["formatting"]);
    expect(copy.items.find((i) => i.kind === "moved" && i.block_id === a.id)).toBeDefined();
  });
});

describe("turnEffect: tables by row", () => {
  const TABLE = ["| # | Sentence | Answer |", "| --- | --- | --- |", "| 1 | The snow was a blanket. | Metaphor |", "| 2 | He ran like the wind. | Simile |", "| 3 | Her smile was sunshine. | Metaphor |", "| 4 | As brave as a lion. | Simile |"].join("\n");

  it("matches rows across tables split with from, by their number cell then by text, and reports only the rows that changed", () => {
    const t = live(TABLE, "table");
    const e = effect([
      { op: "replace", id: t.id, content: ["| # | Sentence | Answer |", "| --- | --- | --- |", "| 1 | The snow was a blanket. | Metaphor |", "| 2 | He ran like the wind. | Simile |"].join("\n") },
      { op: "insert", after: t.id, type: "page_break", content: "" },
      // Row 4 rewritten, row 3 answer changed.
      { op: "insert", after: t.id, type: "table", content: ["| # | Sentence | Answer |", "| --- | --- | --- |", "| 3 | Her smile was sunshine. | Simile |", "| 4 | As brave as a bear. | Simile |"].join("\n"), from: t.id },
    ]);
    const changed = e.items.filter((i) => i.kind === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.kind === "changed" && changed[0]!.rows).toEqual([
      { change: "changed", number: "3", before: "| 3 | Her smile was sunshine. | Metaphor |", after: "| 3 | Her smile was sunshine. | Simile |" },
      { change: "changed", number: "4", before: "| 4 | As brave as a lion. | Simile |", after: "| 4 | As brave as a bear. | Simile |" },
    ]);
    expect(kinds(e.items)).not.toContain("removed");
  });

  it("a table split across pages with nothing changed is only moved rows", () => {
    const t = live(TABLE, "table");
    const e = effect([
      { op: "replace", id: t.id, content: TABLE.split("\n").slice(0, 4).join("\n") },
      { op: "insert", after: t.id, type: "table", content: [...TABLE.split("\n").slice(0, 2), ...TABLE.split("\n").slice(4)].join("\n"), from: t.id },
    ]);
    expect(kinds(e.items)).toEqual(["moved"]);
  });

  it("a row taken out is a removed row", () => {
    const t = live(TABLE, "table");
    const e = effect([{ op: "replace", id: t.id, content: TABLE.split("\n").slice(0, 5).join("\n") }]);
    expect(e.items).toEqual([expect.objectContaining({ kind: "changed", rows: [{ change: "removed", number: "4", before: "| 4 | As brave as a lion. | Simile |" }] })]);
  });
});

describe("normalise", () => {
  it("strips what does not change content and keeps answer blanks", () => {
    expect(normalise("A **simile** uses _like_ or <u>as</u>:  “so”\n\n")).toBe('A simile uses like or as: "so"');
    expect(normalise("Name: ________")).toBe("Name: ________");
    expect(normalise('<span data-color="red">Red</span> <mark>text</mark>')).toBe("Red text");
    expect(normalise("| a |  b |\n| :--- | --- |\n<!-- colwidths: 60 0 -->\n<!-- header: blue -->")).toBe("|a|b|\n|---|---|");
  });
});
