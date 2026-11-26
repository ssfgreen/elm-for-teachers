import { describe, expect, it } from "vitest";
import { layBlocks } from "./blocks.js";
import { faceFor, lineHeight, textWidth } from "./fonts.js";
import { paginate } from "./pages.js";
import { columnWidths, layTable, parseTable } from "./tables.js";
import { inlineRuns, wrap } from "./text.js";
import { PAGE } from "./word.js";

const calibri = faceFor("calibri");
let n = 0;
const block = (type: string, content: string) => ({ id: `b${(n += 1)}`, type, content });

describe("measuring text", () => {
  it("uses the font's own letter widths (Carlito for Calibri)", () => {
    expect(textWidth("a", calibri, 12)).toBeCloseTo(5.748, 2);
    expect(textWidth("_".repeat(10), calibri, 12)).toBeCloseTo(59.76, 1);
    expect(textWidth("a", calibri, 12, true)).toBeGreaterThan(textWidth("a", calibri, 12));
  });

  it("gives symbols Word draws from another font a fixed width, and unknown letters an average", () => {
    expect(textWidth("☐", calibri, 10)).toBeCloseTo(8, 5);
    expect(textWidth("ж", calibri, 12)).toBeGreaterThan(4);
  });

  it("measures a doc with no font in Calibri, the default, exactly; Comic Sans is an estimate", () => {
    expect(faceFor(null)).toBe(calibri);
    expect(calibri.estimated).toBe(false);
    expect(faceFor("comic_sans").estimated).toBe(true);
  });

  it("works out a line's height from the font and Word's spacing", () => {
    expect(lineHeight(calibri, 12, 1.15)).toBeCloseTo(16.86, 1);
  });
});

describe("inline markdown", () => {
  it("takes the markup off and keeps bold and sizes", () => {
    const runs = inlineRuns('**Name:** <u>x</u> [link](https://a.b) <span data-size="large">big</span> *it*');
    expect(runs.map((r) => r.text).join("")).toBe("Name: x link big it");
    expect(runs[0]).toEqual({ text: "Name:", bold: true, size: null });
    expect(runs.find((r) => r.text === "big")?.size).toBe(14);
  });
});

describe("wrapping", () => {
  it("wraps at spaces, and a blank that does not fit drops to its own line", () => {
    const text = `${"word ".repeat(12)}${"_".repeat(40)}`;
    const lines = wrap(inlineRuns(text), PAGE.width, calibri, 12);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ blankChars: 40, wrapped: true });
    expect(lines[0]!.blankChars).toBe(0);
  });

  it("breaks a word longer than the line where it runs out", () => {
    const lines = wrap(inlineRuns("_".repeat(80)), PAGE.width, calibri, 12);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.blankChars + lines[1]!.blankChars).toBe(80);
    expect(lines[0]!.width).toBeLessThanOrEqual(PAGE.width);
  });

  it("starts a new line at a line break, not counted as wrapped", () => {
    const lines = wrap(inlineRuns("Q1\n____"), PAGE.width, calibri, 12);
    expect(lines.map((l) => [l.text, l.wrapped])).toEqual([["Q1", false], ["____", false]]);
  });
});

describe("writing lines (<line/>)", () => {
  const lay = (md: string) => wrap(inlineRuns(md), PAGE.width, calibri, 12);

  it("fills the rest of the line after text, and the whole line on its own", () => {
    const [after] = lay("The door creaked like <line/>");
    expect(after).toMatchObject({ fill: true, width: PAGE.width, blankChars: 0, text: "The door creaked like " });
    const lines = lay("Why?\n<line/>\n<line/>");
    expect(lines.map((l) => [l.fill, l.width])).toEqual([[false, expect.any(Number)], [true, PAGE.width], [true, PAGE.width]]);
  });

  it("goes to a line of its own when too little of the line is left", () => {
    // 72 underscores fill 95% of the line: too little is left for a writing line.
    const lines = lay(`${"_".repeat(72)}<line/>`);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ fill: true, wrapped: true, text: "" });
  });

  it("ends its line: text after it starts the next", () => {
    expect(lay("Name: <line/> Class").map((l) => l.text)).toEqual(["Name: ", "Class"]);
  });
});

describe("tables", () => {
  it("reads rows, the header and the set widths", () => {
    const t = parseTable("| a | b |\n| --- | --- |\n| 1 | 2 |\n<!-- colwidths: 40 0 -->\n<!-- header: blue -->");
    expect(t).toEqual({ rows: [["a", "b"], ["1", "2"]], header: true, widths: [40, 0] });
  });

  it("gives set columns their width and shares what is left", () => {
    const w = columnWidths([40, 0, 0], 3);
    expect(w[0]).toBe(30);
    expect(w[1]).toBeCloseTo((PAGE.width - 30) / 2, 5);
    // All set: stretched to the page, as Word does with a 100% wide table.
    expect(columnWidths([100, 100], 2)).toEqual([PAGE.width / 2, PAGE.width / 2]);
  });

  it("measures what each column's content needs", () => {
    const t = layTable("| # | Sentence | Simile |\n| --- | --- | --- |\n| 1 | The cat sat | ☐ |\n| 2 | A dog | ☐ |", calibri);
    expect(t.columns.map((c) => c.name)).toEqual(['"#"', '"Sentence"', '"Simile"']);
    expect(t.columns[2]!.sameShort).toBe("☐");
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0]!.header).toBe(true);
  });
});

describe("pages", () => {
  const paras = (k: number) => Array.from({ length: k }, (_, i) => block("paragraph", `Line ${i}`));

  it("fits 28 one-line paragraphs on a page and runs the 29th over", () => {
    expect(paginate(layBlocks(paras(28), calibri)).pages).toHaveLength(1);
    expect(paginate(layBlocks(paras(29), calibri)).pages).toHaveLength(2);
  });

  it("starts a new page at a page break", () => {
    const { pages, places } = paginate(layBlocks([block("paragraph", "a"), block("page_break", ""), block("paragraph", "b")], calibri));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.endsAtBreak).toBe(true);
    expect(places.map((p) => p.first)).toEqual([1, 2, 2]);
  });

  it("keeps a heading on the page of what follows it", () => {
    const { places } = paginate(layBlocks([...paras(27), block("heading", "## Task 2"), block("paragraph", "Do this")], calibri));
    expect(places[27]!.first).toBe(2);
  });

  it("splits a table between rows", () => {
    const rows = Array.from({ length: 40 }, (_, i) => `| ${i} | x |`).join("\n");
    const { places } = paginate(layBlocks([...paras(10), block("table", `| a | b |\n| --- | --- |\n${rows}`)], calibri));
    expect(places[10]!.first).toBe(1);
    expect(places[10]!.last).toBe(2);
    expect(places[10]!.onFirst).toBeGreaterThan(0);
    expect(places[10]!.total).toBe(40);
  });
});
