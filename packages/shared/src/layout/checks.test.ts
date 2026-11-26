import { describe, expect, it } from "vitest";
import { checkLayout } from "./report.js";

let n = 0;
const b = (type: string, content: string) => ({ id: `b${(n += 1)}`, type, content });
const check = (blocks: ReturnType<typeof b>[]) => checkLayout(blocks, "calibri");
const texts = (blocks: ReturnType<typeof b>[], area: string) => check(blocks).findings.filter((f) => f.area === area).map((f) => f.text);
const u = (k: number) => "_".repeat(k);

describe("writing lines", () => {
  it("says where a line stops part way, and to write it as <line/>", () => {
    const [t] = texts([b("paragraph", u(40))], "lines");
    expect(t).toBe("A writing line ends at 53% of the width. Write its blank as <line/>, which reaches the right margin.");
  });

  it("leaves a line that reaches the margin, and a short gap in a sentence, alone", () => {
    expect(texts([b("paragraph", u(72)), b("paragraph", "The cat ____ on the mat.")], "lines")).toEqual([]);
  });

  it("measures from the list indent for a list item", () => {
    const [t] = texts([b("numbered_item", `1. Why?\n   ${u(40)}`)], "lines");
    expect(t).toMatch(/A writing line ends at 58% of the width/);
  });

  it("says when a line is too long and runs onto the next", () => {
    const [t] = texts([b("paragraph", u(85))], "lines");
    expect(t).toMatch(/longer than the page is wide: it runs onto the next line as 10 more underscores\. Write it as <line\/>, which runs exactly to the right margin/);
  });

  it("says when a blank drops to a line of its own", () => {
    const [t] = texts([b("paragraph", `${"word ".repeat(14)}${u(30)}`)], "lines");
    expect(t).toMatch(/The blank after "word word.*" does not fit on that line/);
    expect(t).toMatch(/Write it as <line\/>: it fills the rest of the line/);
  });

  it("says once for lines that end alike", () => {
    const [t, ...rest] = texts([b("paragraph", `${u(60)}\n${u(60)}`)], "lines");
    expect(rest).toEqual([]);
    expect(t).toBe("2 writing lines end at 79% of the width. Write their blanks as <line/>, which reaches the right margin.");
  });
});

describe("writing lines made with <line/>", () => {
  it("are never short or too long: they reach the margin", () => {
    expect(texts([b("paragraph", "Like <line/>"), b("numbered_item", "1. Why?\n   <line/>\n   <line/>")], "lines")).toEqual([]);
  });

  it("count as writing lines when the page parts them from their question", () => {
    const paras = Array.from({ length: 26 }, (_, i) => b("paragraph", `Line ${i}`));
    expect(texts([...paras, b("numbered_item", "1. Why?\n   <line/>\n   <line/>\n   <line/>")], "pages")).toContain("The question is on page 1 but its writing lines go over to page 2.");
  });
});

describe("tables", () => {
  const table = (widths: string, rows = 3) =>
    b("table", `|  | Sentence | Simile | Metaphor |\n| --- | --- | --- | --- |\n${Array.from({ length: rows }, (_, i) => `| ${i + 1} | The snow was a white blanket. | ☐ | ☐ |`).join("\n")}\n${widths}`);

  it("flags columns holding the same thing at different widths, and suggests widths", () => {
    const [t] = texts([table("<!-- colwidths: 45 0 90 110 -->")], "tables");
    expect(t).toMatch(/Columns "Simile" and "Metaphor" hold the same thing \(☐\) but are 90 and 110 px wide/);
    expect(t).toMatch(/Suggested widths: <!-- colwidths: 25 0 85 85 --> \("Sentence" takes the rest\)/);
  });

  it("flags a column that wraps while others have room", () => {
    const long = b("table", `| # | Sentence | Simile |\n| --- | --- | --- |\n| 1 | ${"a long sentence ".repeat(4)} | ☐ |\n| 2 | ${"a long sentence ".repeat(4)} | ☐ |`);
    const [t] = texts([long], "tables");
    expect(t).toMatch(/Column "Sentence" wraps 2 of 2 rows onto more lines, while "#" and "Simile" have about \d+ px they do not use/);
  });

  it("flags a word too long for its column", () => {
    const [t] = texts([b("table", "| a | b |\n| --- | --- |\n| Extraordinarily | x |\n<!-- colwidths: 40 0 -->")], "tables");
    expect(t).toMatch(/Column "a" is 40 px wide in Word but its longest word "Extraordinarily" needs \d+ px/);
  });

  it("flags set widths wider than the page", () => {
    const [t] = texts([b("table", "| a | b |\n| --- | --- |\n| x | y |\n<!-- colwidths: 400 400 -->")], "tables");
    expect(t).toMatch(/add up to 800 px, but the page's text is about 602 px wide in Word/);
  });

  it("leaves a table that fits its content alone, and never shrinks a column left empty for answers", () => {
    expect(texts([table("<!-- colwidths: 25 0 85 85 -->")], "tables")).toEqual([]);
    expect(texts([b("table", "| Question | Your answer |\n| --- | --- |\n| Why? |  |\n| How? |  |")], "tables")).toEqual([]);
  });
});

describe("spacing", () => {
  it("flags runs of empty paragraphs and paragraphs of only spaces", () => {
    const fs = texts([b("paragraph", "a"), b("paragraph", ""), b("paragraph", ""), b("paragraph", ""), b("paragraph", "b"), b("paragraph", " ")], "spacing");
    expect(fs).toContain("3 empty paragraphs in a row make about 3 lines of space. One is usually enough between parts; Word already puts space after every paragraph.");
    expect(fs).toContain("This paragraph holds only spaces, so it shows as an empty line.");
  });

  it("flags uneven gaps before headings of one level", () => {
    const fs = texts([b("heading", "## A"), b("paragraph", "x"), b("heading", "## B"), b("paragraph", "y"), b("paragraph", ""), b("paragraph", ""), b("heading", "## C"), b("paragraph", "z")], "spacing");
    expect(fs.some((t) => /gaps before the level 2 headings are uneven: no empty paragraphs before block 3 and 2 empty paragraphs before block 7/.test(t))).toBe(true);
  });

  it("flags an empty paragraph after a heading or a page break", () => {
    const fs = texts([b("heading", "## A"), b("paragraph", ""), b("paragraph", "x"), b("page_break", ""), b("paragraph", ""), b("paragraph", "y")], "spacing");
    expect(fs).toEqual([expect.stringMatching(/straight after the heading in block 1/), expect.stringMatching(/at the top of the page after the page break/)]);
  });
});

describe("pages", () => {
  const paras = (k: number) => Array.from({ length: k }, (_, i) => b("paragraph", `Line ${i}`));

  it("flags a last page with only a line or two on it", () => {
    const [t] = texts(paras(29), "pages");
    expect(t).toMatch(/The last page, page 2, holds only about 1 line \(\d+%\): the document runs over page 1 by a little/);
  });

  it("flags a mostly empty page before a page break, and a blank page", () => {
    const fs = texts([b("paragraph", "a"), b("page_break", ""), b("page_break", ""), ...paras(5)], "pages");
    expect(fs).toEqual([expect.stringMatching(/Page 1 is only \d+% full before the page break/), expect.stringMatching(/Page 2 is blank/)]);
  });

  it("flags a table split leaving one row alone", () => {
    const rows = Array.from({ length: 4 }, (_, i) => `| ${i} | x |`).join("\n");
    const fs = texts([...paras(25), b("table", `| a | b |\n| --- | --- |\n${rows}`)], "pages");
    expect(fs).toContain("The table splits across pages 1 and 2 with only 1 row on page 2. Move the page end (or the table) so its rows stay together.");
  });

  it("flags writing lines that go over to the next page from their question", () => {
    const fs = texts([...paras(26), b("numbered_item", `1. Why?\n   ${u(66)}\n   ${u(66)}\n   ${u(66)}`)], "pages");
    expect(fs).toContain("The question is on page 1 but its writing lines go over to page 2.");
  });
});

describe("the report", () => {
  it("names the font, the pages and each finding's blocks by number and id", () => {
    const text = check([b("heading", "# Title"), b("paragraph", u(40))]).text;
    expect(text).toMatch(/^As printed or opened in Word: A4, 2.54 cm margins, Calibri 12 pt\. Page ends/);
    expect(text).toMatch(/Pages: 1\. Page 1: blocks 1 to 2, \d+% full\./);
    expect(text).toMatch(/Writing lines and blanks:\n- Block 2 \[id=b\d+\]: A writing line ends at 53%/);
  });

  it("says when it finds nothing, and when the font's widths are estimated", () => {
    expect(check([b("paragraph", "Hello")]).text).toMatch(/No problems found/);
    expect(checkLayout([b("paragraph", "Hello")], null).text).toMatch(/^As printed or opened in Word: A4, 2.54 cm margins, Calibri 12 pt\. Page ends/);
    expect(checkLayout([b("paragraph", "Hello")], "comic_sans").text).toMatch(/Comic Sans MS's letter widths are estimated/);
  });
});
