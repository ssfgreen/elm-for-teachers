import { describe, expect, it } from "vitest";
import type { Node } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import type { BlockType } from "@edw/shared";
import { canvasSchema } from "../extensions/index.js";
import { nodeToContent } from "../markdown.js";
import { acceptChange, carryEdit, changesOf, rejectChange } from "./merge.js";
import { flatText, nodeOf } from "./text.js";

const node = (content: string, type: BlockType = "paragraph") => nodeOf(canvasSchema(), type, content);
const md = (n: Node | null) => (n ? nodeToContent(n).content : null);

/** The suggested text after typing `text` at character `offset` of its plain text (or replacing `len` characters there). */
function typed(suggested: string, offset: number, text: string, len = 0, type: BlockType = "paragraph") {
  const before = node(suggested, type);
  const t = flatText(before, -1);
  const from = offset < t.text.length ? t.pos[offset]! : t.end;
  const to = len ? t.pos[offset + len - 1]! + 1 : from;
  const tr = new Transform(before);
  if (text) tr.replaceWith(from, to, canvasSchema().text(text));
  else tr.delete(from, to);
  return { before, after: tr.doc };
}

describe("changesOf", () => {
  it("lists each change with its text", () => {
    expect(changesOf(node("a big dog"), node("a small dog and cat")).map((c) => [c.index, c.ins, c.del])).toEqual([
      [0, "small", "big"],
      [1, " and cat", ""],
    ]);
  });
});

describe("acceptChange and rejectChange", () => {
  it("take one change in, or back, and keep the other", () => {
    const live = node("a big dog");
    const sugg = node("a small dog and cat");
    expect(md(acceptChange(live, sugg, 0))).toBe("a small dog");
    expect(md(acceptChange(live, sugg, 1))).toBe("a big dog and cat");
    expect(md(rejectChange(live, sugg, 0))).toBe("a big dog and cat");
    expect(md(rejectChange(live, sugg, 1))).toBe("a small dog");
  });

  it("keeps the suggested formatting of the words taken in", () => {
    expect(md(acceptChange(node("a big dog"), node("a **small** dog"), 0))).toBe("a **small** dog");
  });

  it("works across the items of a list", () => {
    const live = node("- one\n- two", "bullet_list");
    const sugg = node("- one\n- three\n- four", "bullet_list");
    const n = changesOf(live, sugg).length;
    let out = live;
    for (let i = n - 1; i >= 0; i--) out = acceptChange(out, sugg, 0) ?? out;
    expect(md(out)).toBe("- one\n- three\n- four");
  });
});

describe("carryEdit", () => {
  const live = node("a big dog");
  const sugg = "a small dog";

  it("puts text typed in the block's own words into the live text too", () => {
    const { before, after } = typed(sugg, 11, "!");
    expect(md(carryEdit(live, before, after))).toBe("a big dog!");
  });

  it("keeps text typed straight after suggested words in the suggestion only", () => {
    const { before, after } = typed(sugg, 7, "er");
    expect(md(after)).toBe("a smaller dog");
    expect(md(carryEdit(live, before, after))).toBe("a big dog");
  });

  it("deletes the block's own words from both, and suggested words from the suggestion only", () => {
    const own = typed(sugg, 7, "", 4);
    expect(md(own.after)).toBe("a small");
    expect(md(carryEdit(live, own.before, own.after))).toBe("a big");
    const suggested = typed(sugg, 2, "", 5);
    expect(md(suggested.after)).toBe("a  dog");
    expect(md(carryEdit(live, suggested.before, suggested.after))).toBe("a big dog");
  });

  it("carries bold put on the block's own words", () => {
    const before = node(sugg);
    const tr = new Transform(before);
    const t = flatText(before, -1);
    tr.addMark(t.pos[8]!, t.pos[10]! + 1, canvasSchema().marks.bold!.create());
    expect(md(tr.doc)).toBe("a small **dog**");
    expect(md(carryEdit(live, before, tr.doc))).toBe("a big **dog**");
  });

  it("gives up when the block changed type", () => {
    expect(carryEdit(live, node(sugg), node(sugg, "heading"))).toBeNull();
  });
});
