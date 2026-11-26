import { describe, expect, it } from "vitest";
import { HighlightFields } from "./reader.js";
import { inlineParts, readerBlock, readingAssetIds } from "./readerText.js";

const b = (type: string, content: string) => ({ id: "b1", type, content });

describe("inlineParts", () => {
  it("keeps bold, italic, underline, code and links, and drops the markup", () => {
    expect(inlineParts("A **big** *idea* <u>here</u> `x*y` [site](https://e.org) end")).toEqual([
      { text: "A " },
      { text: "big", bold: true },
      { text: " " },
      { text: "idea", italic: true },
      { text: " " },
      { text: "here", underline: true },
      { text: " " },
      { text: "x*y", code: true },
      { text: " " },
      { text: "site", href: "https://e.org" },
      { text: " end" },
    ]);
  });

  it("drops colour, font, size and the editor's highlight, and reads escapes as text", () => {
    const text = inlineParts('<span data-color="red">red</span> <mark>m</mark> \\*star\\* [2 marks]<line/>').map((p) => p.text).join("");
    expect(text).toBe("red m *star* [2 marks]");
  });

  it("keeps a line break only when asked", () => {
    expect(inlineParts("a\nb", true)).toEqual([{ text: "a\nb" }]);
    expect(inlineParts("a\nb")).toEqual([{ text: "a b" }]);
  });
});

describe("readerBlock", () => {
  it("reads a heading's level and text", () => {
    const r = readerBlock(b("heading", "## The **water** cycle"));
    expect(r.text).toBe("The water cycle");
    expect(r.view).toMatchObject({ kind: "heading", level: 2 });
  });

  it("gives each run where it starts, joined with a line break in the text", () => {
    const r = readerBlock(b("table", "| Name | Age |\n| --- | --- |\n| Ann | 9 |\n<!-- colwidths: 0 0 -->"));
    expect(r.text).toBe("Name\nAge\nAnn\n9");
    if (r.view.kind !== "table") throw new Error("not a table");
    expect(r.view.header).toBe(true);
    expect(r.view.rows.map((row) => row.map((c) => c.from))).toEqual([
      [0, 5],
      [9, 13],
    ]);
  });

  it("reads list items with their number and tick", () => {
    expect(readerBlock(b("numbered_item", "3. Third")).view).toMatchObject({ kind: "item", list: "numbered", number: 3 });
    expect(readerBlock(b("checklist_item", "- [x] Done")).view).toMatchObject({ kind: "item", list: "check", checked: true });
    const old = readerBlock(b("bullet_list", "- one\n- two"));
    expect(old.text).toBe("one\ntwo");
  });

  it("reads quotes by line and code as written", () => {
    expect(readerBlock(b("quote", "> one\n> two")).text).toBe("one\ntwo");
    expect(readerBlock(b("code_block", "```\nlet **x**\n```")).text).toBe("let **x**");
  });

  it("gives a picture its asset and no text", () => {
    const r = readerBlock(b("image", "![A sun](asset:ast_01ABC)"));
    expect(r).toMatchObject({ text: "", view: { kind: "picture", alt: "A sun", asset_id: "ast_01ABC", svg: null } });
    expect(readerBlock(b("image", "![x](https://e.org/a.png)")).view).toMatchObject({ asset_id: null });
  });

  it("lists the assets a reading names, once each", () => {
    const blocks = [b("image", "![](asset:ast_1)"), b("paragraph", "asset:ast_2"), b("image", "![](asset:ast_1)"), b("image", "![](asset:ast_3)")];
    expect(readingAssetIds(blocks)).toEqual(["ast_1", "ast_3"]);
  });
});

describe("HighlightFields", () => {
  it("takes a range and a category or none, and refuses an empty range or an unknown category", () => {
    expect(HighlightFields.safeParse({ block_id: "b", start: 0, end: 3, category: "dont_understand" }).success).toBe(true);
    expect(HighlightFields.safeParse({ block_id: "b", start: 0, end: 3, category: null }).success).toBe(true);
    expect(HighlightFields.safeParse({ block_id: "b", start: 3, end: 3, category: null }).success).toBe(false);
    expect(HighlightFields.safeParse({ block_id: "b", start: 0, end: 3, category: "rude" }).success).toBe(false);
  });
});
