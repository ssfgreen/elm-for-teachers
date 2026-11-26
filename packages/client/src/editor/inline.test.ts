import { describe, expect, it } from "vitest";
import { Fragment } from "@tiptap/pm/model";
import { canvasSchema } from "./extensions/index.js";
import { parseInline, plainText, serializeInline } from "./inline.js";

const schema = canvasSchema();
const parse = (md: string) => parseInline(schema, md);
const rt = (md: string) => serializeInline(Fragment.from(parse(md)));

describe("inline markdown", () => {
  it("round-trips plain text", () => {
    expect(rt("Her voice was like silk.")).toBe("Her voice was like silk.");
  });

  it("parses and serialises bold, italic, underline and code", () => {
    const nodes = parse("a **b** *c* <u>d</u> `e`");
    const marks = nodes.map((n) => n.marks.map((m) => m.type.name).join(",") || "-");
    expect(marks).toEqual(["-", "bold", "-", "italic", "-", "underline", "-", "code"]);
    expect(rt("a **b** *c* <u>d</u> `e`")).toBe("a **b** *c* <u>d</u> `e`");
  });

  it("handles nested marks in a stable order", () => {
    expect(rt("**bold *and italic* bold**")).toBe("**bold *and italic* bold**");
    const nodes = parse("*<u>x</u>*");
    expect(nodes[0]!.marks.map((m) => m.type.name).sort()).toEqual(["italic", "underline"]);
    expect(serializeInline(Fragment.from(nodes))).toBe("*<u>x</u>*");
  });

  it("reads and writes a size for part of the text, between the font and the colour", () => {
    const nodes = parse('A <span data-size="large">big</span> word');
    expect(nodes[1]!.marks.map((m) => [m.type.name, m.attrs.size])).toEqual([["textSize", "large"]]);
    expect(rt('A <span data-size="x_large">big</span> word')).toBe('A <span data-size="x_large">big</span> word');
    expect(rt('<span data-color="red"><span data-size="huge"><span data-font="arial">x</span></span></span>')).toBe(
      '<span data-font="arial"><span data-size="huge"><span data-color="red">x</span></span></span>',
    );
    expect(rt('<span data-size="small">**a** b</span> c')).toBe('<span data-size="small">**a** b</span> c');
    // An unknown size is text.
    expect(rt('<span data-size="12">x</span>')).toBe('\\<span data-size="12">x\\</span>');
  });

  it("reads and writes a font for part of the text, with a colour inside or around it", () => {
    const nodes = parse('A <span data-font="georgia">serif</span> word');
    expect(nodes[1]!.marks.map((m) => [m.type.name, m.attrs.font])).toEqual([["textFont", "georgia"]]);
    expect(rt('A <span data-font="georgia">serif</span> word')).toBe('A <span data-font="georgia">serif</span> word');
    // The font goes outside the colour, and each </span> closes the innermost.
    expect(rt('<span data-color="red"><span data-font="times_new_roman">x</span></span>')).toBe('<span data-font="times_new_roman"><span data-color="red">x</span></span>');
    expect(rt('<span data-font="cambria"><span data-color="blue">a</span> b</span> c')).toBe('<span data-font="cambria"><span data-color="blue">a</span> b</span> c');
    // An unknown font is text.
    expect(rt('<span data-font="papyrus">x</span>')).toBe('\\<span data-font="papyrus">x\\</span>');
  });

  it("leaves underscores alone so answer blanks survive", () => {
    expect(rt("Fill in ________ the gap_here")).toBe("Fill in ________ the gap_here");
    expect(plainText(Fragment.from(parse("a _b_ c")))).toBe("a _b_ c");
  });

  it("escapes literal asterisks and backticks in plain text", () => {
    const n = schema.text("2 * 3 = `six`");
    expect(serializeInline(Fragment.from(n))).toBe("2 \\* 3 = \\`six\\`");
    expect(plainText(Fragment.from(parse("2 \\* 3 = \\`six\\`")))).toBe("2 * 3 = `six`");
  });

  it("does not parse markers inside code", () => {
    const nodes = parse("`a*b**c`");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.text).toBe("a*b**c");
  });

  it("tolerates unbalanced markers", () => {
    expect(plainText(Fragment.from(parse("**open")))).toBe("open");
    expect(plainText(Fragment.from(parse("</u>stray")))).toBe("stray");
  });

  it("parses and writes text colour, highlight and links", () => {
    const md = 'The <span data-color="red">sun</span> is <mark>hot</mark>, see [the guide](https://example.org/a?b=1).';
    const nodes = parse(md);
    const marks = nodes.map((n) => n.marks.map((m) => (m.type.name === "textColor" ? `color=${m.attrs.color}` : m.type.name === "link" ? `link=${m.attrs.href}` : m.type.name)).join(",") || "-");
    expect(marks).toEqual(["-", "color=red", "-", "highlight", "-", "link=https://example.org/a?b=1", "-"]);
    expect(rt(md)).toBe(md);
  });

  it("nests colour, highlight and links with the other marks in a stable order", () => {
    expect(rt('**<span data-color="blue">bold blue</span>**')).toBe('<span data-color="blue">**bold blue**</span>');
    expect(rt("[**Read** this](mailto:office@school.example)")).toBe("[**Read** this](mailto:office@school.example)");
    expect(rt('<span data-color="teal"><mark>both</mark></span> <span data-color="purple">next</span>')).toBe('<span data-color="teal"><mark>both</mark></span> <span data-color="purple">next</span>');
  });

  it("keeps brackets that are not links as text, and escapes text that would read as markup", () => {
    expect(rt("Answer: [2 marks] (show working)")).toBe("Answer: [2 marks] (show working)");
    expect(rt("[see](notes) and [x](javascript:alert(1))")).toBe("[see](notes) and [x](javascript:alert(1))");
    expect(parse("[x](javascript:alert(1))").every((n) => n.marks.length === 0)).toBe(true);
    // Typed, not formatted: written escaped, read back the same.
    const typed = [schema.text('<mark>a</mark> <span data-color="red">b</span> [c](https://x.org)')];
    const written = serializeInline(Fragment.from(typed));
    expect(plainText(Fragment.from(parse(written)))).toBe('<mark>a</mark> <span data-color="red">b</span> [c](https://x.org)');
    expect(parse(written).every((n) => n.marks.length === 0)).toBe(true);
  });

  it("keeps a bracket inside link text", () => {
    const linked = [schema.text("Task [1]", [schema.marks.link!.create({ href: "https://x.org" })])];
    const written = serializeInline(Fragment.from(linked));
    expect(written).toBe("[Task [1\\]](https://x.org)");
    expect(parse(written).map((n) => [n.text, n.marks[0]?.attrs.href])).toEqual([["Task [1]", "https://x.org"]]);
  });

  it("leaves a colour it does not know as the text it was", () => {
    const nodes = parse('<span data-color="pink">x</span>');
    expect(nodes.every((n) => n.marks.length === 0)).toBe(true);
    expect(plainText(Fragment.from(nodes))).toBe('<span data-color="pink">x</span>');
  });
});
