import { describe, expect, it } from "vitest";
import { Fragment } from "@tiptap/pm/model";
import { canvasSchema } from "./extensions/index.js";
import { fitWritingLines } from "./extensions/writingLine.js";
import { parseInline, plainText, serializeInline } from "./inline.js";
import { testBlock as block } from "../test-utils.js";
import { blockToNode, nodeToContent } from "./markdown.js";
import { flatText } from "./suggest/text.js";

const schema = canvasSchema();
const parse = (md: string, breaks = false) => parseInline(schema, md, breaks);
const rt = (md: string, breaks = false) => serializeInline(Fragment.from(parse(md, breaks)), breaks);
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("writing lines in block content", () => {
  it("reads <line/> as a writing line and writes it back", () => {
    expect(parse("The door creaked like <line/>").map((n) => n.type.name)).toEqual(["text", "writingLine"]);
    expect(rt("The door creaked like <line/>")).toBe("The door creaked like <line/>");
  });

  it("closes marks around it: a line is never bold or coloured", () => {
    expect(rt("**Name:** <line/>")).toBe("**Name:** <line/>");
    expect(rt("**Name: <line/> here**")).toBe("**Name: **<line/>** here**");
  });

  it("keeps the text <line/> typed by a teacher as text", () => {
    const typed = Fragment.from(schema.text("write <line/> here"));
    expect(serializeInline(typed)).toBe("write \\<line/> here");
    expect(parse("write \\<line/> here").map((n) => n.type.name)).toEqual(["text"]);
  });

  it("keeps a list item's writing lines on their own lines", () => {
    const content = "1. Why was poor hygiene a problem?\n   <line/>\n   <line/>";
    expect(nodeToContent(blockToNode(schema, block({ id: ID, type: "numbered_item", content }))).content).toBe(content);
    expect(rt("Q?\n<line/>\n<line/>", true)).toBe("Q?\n<line/>\n<line/>");
  });

  it("counts as a blank in plain text, and as one character for a diff", () => {
    const nodes = Fragment.from(parse("Like <line/>"));
    expect(plainText(nodes)).toBe("Like ________");
    expect(flatText(blockToNode(schema, block({ id: ID, content: "Like <line/>" }))).text).toBe("Like _");
  });
});

describe("fitting a writing line to the margin", () => {
  /** A block 600px wide at x=100, holding a line that starts at `x`. */
  function setUp(x: number) {
    const root = document.createElement("div");
    const p = document.createElement("p");
    const line = document.createElement("span");
    line.setAttribute("data-writing-line", "");
    p.append("text ", line);
    root.append(p);
    p.getBoundingClientRect = () => ({ left: 100, right: 700, top: 0, bottom: 20, width: 600, height: 20, x: 100, y: 0, toJSON: () => ({}) });
    line.getBoundingClientRect = () => ({ left: x, right: x + 40, top: 0, bottom: 20, width: 40, height: 20, x, y: 0, toJSON: () => ({}) });
    fitWritingLines(root);
    return line.style.width;
  }

  it("reaches from where it starts to the right edge", () => {
    expect(setUp(400)).toBe("299px");
  });

  it("takes the whole width when too little is left (it wraps to a line of its own)", () => {
    expect(setUp(680)).toBe("599px");
  });
});
