import { describe, expect, it } from "vitest";
import { cleanSvg, isSvgContent } from "./svg.js";

const SUN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><title>A smiling sun</title><circle cx="100" cy="50" r="40" fill="url(#g)"/><defs><linearGradient id="g"><stop offset="0" stop-color="#fc0"/></linearGradient></defs></svg>';

describe("cleanSvg", () => {
  it("keeps a plain drawing, gives it a size from its viewBox and takes its title as alt text", () => {
    const r = cleanSvg(`Here is a sun:\n${SUN}\nEnjoy`)!;
    expect(r.alt).toBe("A smiling sun");
    expect(r.svg).toMatch(/^<svg width="200" height="100" xmlns=/);
    expect(r.svg).toContain('fill="url(#g)"');
    expect(r.svg.endsWith("</svg>")).toBe(true);
  });

  it("takes out scripts, embedded HTML, handlers, animation and outside references", () => {
    const evil =
      '<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><svg:script>alert(3)</svg:script>' +
      '<foreignObject><iframe src="https://x.example"></iframe></foreignObject>' +
      '<a xlink:href="javascript:alert(4)"><rect width="5" height="5" onclick="alert(5)"/></a>' +
      '<a href="javascript:alert(6)"><set attributeName="href" to="javascript:alert(7)"/></a>' +
      '<image href="https://tracker.example/p.png"/><use href="#ok"/>' +
      '<style>@import url(https://x.example/a.css); rect { fill: url(https://x.example/f.svg) }</style></svg>';
    const { svg } = cleanSvg(evil)!;
    for (const bad of ["alert", "script", "foreignObject", "iframe", "javascript", "onload", "onclick", "<set", "https://", "@import"]) expect(svg, bad).not.toContain(bad);
    expect(svg).toContain('<use href="#ok"/>');
    expect(svg).toMatch(/^<svg width="10" height="10" xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  });

  it("drops entity declarations, and refuses text with no drawing or one that is far too big", () => {
    expect(cleanSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "boom">]><svg width="4" height="3">&x;</svg>')!.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3">&x;</svg>');
    expect(cleanSvg("A picture of a sun")).toBeNull();
    expect(cleanSvg(`<svg>${"x".repeat(200_001)}</svg>`)).toBeNull();
  });

  it("sizes a drawing with no viewBox at 400 by 300, and keeps a width and height it has", () => {
    expect(cleanSvg("<svg><circle r='3'/></svg>")!.svg).toMatch(/^<svg width="400" height="300"/);
    expect(cleanSvg('<svg width="120px" height="60" viewBox="0 0 12 6"></svg>')!.svg).toMatch(/^<svg xmlns="[^"]+" width="120px" height="60"/);
    expect(cleanSvg('<svg height="50" viewBox="0 0 200 100"></svg>')!.svg).toMatch(/^<svg width="100" height="50"/);
  });

  it("tells a drawing from a stored picture", () => {
    expect(isSvgContent(SUN)).toBe(true);
    expect(isSvgContent('<?xml version="1.0"?>\n<svg>')).toBe(true);
    expect(isSvgContent("![A sun](asset:ast_1)")).toBe(false);
  });
});
