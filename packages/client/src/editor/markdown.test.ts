import { describe, expect, it } from "vitest";
import { canvasSchema } from "./extensions/index.js";
import { blockToNode, blockTypeOf, displayContent, docFromBlocks, nodeToContent } from "./markdown.js";
import type { PublicBlock } from "./types.js";

const schema = canvasSchema();
const now = "2026-10-28T12:00:00.000Z";
const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";
export function block(over: Partial<PublicBlock> & { id: string }): PublicBlock {
  return {
    session_id: "s",
    doc_id: DOC,
    type: "paragraph",
    content: "",
    status: "live",
    version: 1,
    derived_from: null,
    order: 0,
    pending: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const toNode = (b: PublicBlock) => blockToNode(schema, b);
const rt = (b: PublicBlock) => nodeToContent(toNode(b)).content;

describe("block <-> node", () => {
  it("round-trips paragraphs with inline marks and carries the block attrs", () => {
    expect(rt(block({ id: ID, content: "Hello **world**" }))).toBe("Hello **world**");
    const node = toNode(block({ id: ID, content: "plain" }));
    expect(node.attrs).toMatchObject({ id: ID, status: "live" });
    expect(nodeToContent(node)).toEqual({ content: "plain" });
  });

  it("keeps line breaks in a paragraph as hard breaks, and reads them as spaces elsewhere", () => {
    const starters = "Write your own:\nThe thunder was as loud as ...\nMy bedroom is ...";
    const p = toNode(block({ id: ID, content: starters }));
    expect(p.childCount).toBe(5);
    expect(p.child(1).type.name).toBe("hardBreak");
    expect(nodeToContent(p).content).toBe(starters);
    expect(rt(block({ id: ID, content: "**bold\nstill bold**" }))).toBe("**bold\nstill bold**");
    expect(rt(block({ id: ID, type: "heading", content: "## Two\nlines" }))).toBe("## Two lines");
    expect(rt(block({ id: ID, type: "table", content: "| a | b |" }))).toBe("| a | b |");
  });

  it("keeps a list item's second line inside the item, as the model writes answer lines", () => {
    const numbered = "1. The crowded school was a …\n   ________\n2. After the rain, the playground was …\n   ________";
    const n = toNode(block({ id: ID, type: "numbered_list", content: numbered }));
    expect(n.childCount).toBe(2);
    expect(n.child(0).firstChild!.child(1).type.name).toBe("hardBreak");
    expect(nodeToContent(n).content).toBe(numbered);
    // Lines without indentation continue the item too, and come back indented.
    expect(rt(block({ id: ID, type: "numbered_list", content: "1. Sentence\n____" }))).toBe("1. Sentence\n   ____");
    expect(rt(block({ id: ID, type: "bullet_list", content: "- one\n  more\n- two" }))).toBe("- one\n  more\n- two");
    expect(rt(block({ id: ID, type: "checklist", content: "- [x] done\n      note\n- [ ] next" }))).toBe("- [x] done\n      note\n- [ ] next");
  });

  it("keeps the number a numbered list starts at", () => {
    const n = toNode(block({ id: ID, type: "numbered_list", content: "3. On Monday\n4. The storm" }));
    expect(n.attrs.start).toBe(3);
    expect(nodeToContent(n).content).toBe("3. On Monday\n4. The storm");
    expect(toNode(block({ id: ID, type: "numbered_list", content: "1. a" })).attrs.start).toBe(1);
  });

  it("round-trips heading levels and defaults to level 2 without a marker", () => {
    expect(toNode(block({ id: ID, type: "heading", content: "# Title" })).attrs.level).toBe(1);
    expect(rt(block({ id: ID, type: "heading", content: "### Small" }))).toBe("### Small");
    const n = toNode(block({ id: ID, type: "heading", content: "Metaphors and Similes" }));
    expect(n.attrs.level).toBe(2);
    expect(nodeToContent(n).content).toBe("## Metaphors and Similes");
  });

  it("round-trips lists as list items wrapping paragraphs, re-numbering and tolerating * bullets", () => {
    const bl = block({ id: ID, type: "bullet_list", content: "- one\n* two\n-   **three**" });
    const n = toNode(bl);
    expect(n.type.name).toBe("bulletList");
    expect(n.childCount).toBe(3);
    expect(n.child(0).type.name).toBe("listItem");
    expect(n.child(0).child(0).type.name).toBe("paragraph");
    expect(rt(bl)).toBe("- one\n- two\n- **three**");
    expect(rt(block({ id: ID, type: "numbered_list", content: "1. a\n7) b" }))).toBe("1. a\n2. b");
  });

  it("round-trips checklists with checked state", () => {
    const n = toNode(block({ id: ID, type: "checklist", content: "- [ ] read\n- [x] write" }));
    expect(n.type.name).toBe("taskList");
    expect(n.child(0).attrs.checked).toBe(false);
    expect(n.child(1).attrs.checked).toBe(true);
    expect(nodeToContent(n).content).toBe("- [ ] read\n- [x] write");
  });

  it("round-trips quotes line by line, code blocks, dividers and images", () => {
    const q = toNode(block({ id: ID, type: "quote", content: "> A simile\n> compares." }));
    expect(q.childCount).toBe(2);
    expect(nodeToContent(q).content).toBe("> A simile\n> compares.");
    const code = block({ id: ID, type: "code_block", content: "```\nline 1\nline 2\n```" });
    expect(toNode(code).textContent).toBe("line 1\nline 2");
    expect(rt(code)).toBe("```\nline 1\nline 2\n```");
    expect(rt(block({ id: ID, type: "divider", content: "---" }))).toBe("---");
    expect(rt(block({ id: ID, type: "page_break", content: "" }))).toBe("");
    const img = toNode(block({ id: ID, type: "image", content: "![cat](asset:ast_1)" }));
    expect(img.attrs).toMatchObject({ alt: "cat", src: "asset:ast_1" });
    expect(nodeToContent(img).content).toBe("![cat](asset:ast_1)");
  });

  it("shows a drawing the assistant is still writing as a picture, cleaned", () => {
    const svg = '<svg viewBox="0 0 20 10"><title>A sun (smiling)</title><circle r="4" onload="x()"/></svg>';
    const img = toNode(block({ id: ID, type: "image", content: svg }));
    expect(img.attrs.alt).toBe("A sun smiling");
    const src = String(img.attrs.src);
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).not.toMatch(/[()]/);
    expect(decodeURIComponent(src.split(",")[1]!)).not.toContain("onload");
    // Half-written, it is no picture yet.
    expect(toNode(block({ id: ID, type: "image", content: '<svg viewBox="0 0 20 10"><circle' })).attrs.src).toBe("");
  });

  it("round-trips tables, marking a header row with a separator line", () => {
    const plain = block({ id: ID, type: "table", content: "| a | b |\n| 1 | 2 |" });
    const pn = toNode(plain);
    expect(pn.childCount).toBe(2);
    expect(pn.child(0).child(0).type.name).toBe("tableCell");
    expect(rt(plain)).toBe("| a | b |\n| 1 | 2 |");
    const headed = block({ id: ID, type: "table", content: "| Word | Type |\n| --- | --- |\n| silk | simile |" });
    const hn = toNode(headed);
    expect(hn.childCount).toBe(2);
    expect(hn.child(0).child(0).type.name).toBe("tableHeader");
    expect(rt(headed)).toBe("| Word | Type |\n| --- | --- |\n| silk | simile |");
    // Ragged rows are padded to the widest.
    expect(rt(block({ id: ID, type: "table", content: "| a | b | c |\n| 1 |" }))).toBe("| a | b | c |\n| 1 |  |  |");
  });

  it("keeps resized column widths in a trailing comment line, and none when nothing was resized", () => {
    const t = block({ id: ID, type: "table", content: "| Word | Type |\n| --- | --- |\n| silk | simile |\n<!-- colwidths: 180 0 -->" });
    const n = toNode(t);
    expect(n.childCount).toBe(2);
    expect(n.child(0).child(0).attrs.colwidth).toEqual([180]);
    expect(n.child(1).child(0).attrs.colwidth).toEqual([180]);
    expect(n.child(0).child(1).attrs.colwidth).toBeNull();
    expect(rt(t)).toBe("| Word | Type |\n| --- | --- |\n| silk | simile |\n<!-- colwidths: 180 0 -->");
    expect(rt(block({ id: ID, type: "table", content: "| a | b |" }))).toBe("| a | b |");
  });

  it("keeps a header row colour in a trailing comment line, after the widths, and drops it without a header row", () => {
    const t = block({ id: ID, type: "table", content: "| Word | Type |\n| --- | --- |\n| silk | simile |\n<!-- colwidths: 180 0 -->\n<!-- header: blue -->" });
    const n = toNode(t);
    expect(n.attrs.headerColor).toBe("blue");
    expect(n.child(0).child(0).attrs.colwidth).toEqual([180]);
    expect(rt(t)).toBe("| Word | Type |\n| --- | --- |\n| silk | simile |\n<!-- colwidths: 180 0 -->\n<!-- header: blue -->");
    // Either order is read; an unknown colour is ignored.
    expect(toNode(block({ id: ID, type: "table", content: "| a |\n| --- |\n| 1 |\n<!-- header: teal -->\n<!-- colwidths: 90 -->" })).attrs.headerColor).toBe("teal");
    expect(rt(block({ id: ID, type: "table", content: "| a |\n| --- |\n| 1 |\n<!-- header: pink -->" }))).toBe("| a |\n| --- |\n| 1 |");
    // Nothing to colour without a header row.
    expect(rt(block({ id: ID, type: "table", content: "| a |\n| 1 |\n<!-- header: red -->" }))).toBe("| a |\n| 1 |");
  });

  it("keeps an empty block editable", () => {
    expect(toNode(block({ id: ID, type: "bullet_list", content: "" })).childCount).toBe(1);
    expect(rt(block({ id: ID, type: "bullet_list", content: "" }))).toBe("- ");
    expect(rt(block({ id: ID, content: "" }))).toBe("");
  });

  it("shows the pending replacement and keeps the original in attrs", () => {
    const b = block({ id: ID, content: "old", pending: { op: "replace", turn_id: "t", content: "new" } });
    expect(displayContent(b).content).toBe("new");
    const n = toNode(b);
    expect(n.textContent).toBe("new");
    expect(n.attrs.original).toBe("old");
    expect(n.attrs.pending).toEqual(b.pending);
  });

  it("maps every node name back to a block type", () => {
    for (const t of ["paragraph", "heading", "bullet_list", "numbered_list", "checklist", "quote", "code_block", "divider", "page_break", "image", "table"] as const) {
      expect(blockTypeOf(toNode(block({ id: ID, type: t, content: t === "image" ? "![a](asset:x)" : "x" })))).toBe(t);
    }
  });
});

describe("docFromBlocks", () => {
  it("orders visible blocks of the doc and skips other docs and rejected blocks", () => {
    const blocks = [
      block({ id: "01ARZ3NDEKTSV4RRFFQ69G5FA2", content: "B", order: 1 }),
      block({ id: "01ARZ3NDEKTSV4RRFFQ69G5FA1", content: "A", order: 0 }),
      block({ id: "01ARZ3NDEKTSV4RRFFQ69G5FA3", content: "X", order: 2, status: "rejected" }),
      block({ id: "01ARZ3NDEKTSV4RRFFQ69G5FA4", content: "V", order: 0, doc_id: "01ARZ3NDEKTSV4RRFFQ69G5D02" }),
      block({ id: "01ARZ3NDEKTSV4RRFFQ69G5FA5", content: "P", order: 3, status: "proposed" }),
    ];
    const texts: string[] = [];
    docFromBlocks(schema, blocks, DOC).forEach((n) => texts.push(n.textContent));
    expect(texts).toEqual(["A", "B", "P"]);
  });

  it("gives an empty doc one unnamed paragraph", () => {
    const doc = docFromBlocks(schema, [], DOC);
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild?.type.name).toBe("paragraph");
    expect(doc.firstChild?.attrs.id).toBeNull();
  });

  it("uses an override node for a block the editor is still editing", () => {
    const b = block({ id: ID, content: "server" });
    const local = toNode(block({ id: ID, content: "local typing" }));
    expect(docFromBlocks(schema, [b], DOC, new Map([[ID, local]])).firstChild?.textContent).toBe("local typing");
  });
});
