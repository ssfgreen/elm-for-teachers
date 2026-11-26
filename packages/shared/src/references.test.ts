import { describe, expect, it } from "vitest";
import { estimateTokens, REFERENCE_PAGE_MAX, splitIntoPages } from "./references.js";

describe("splitIntoPages", () => {
  it("keeps short text as one page and gives none for blank text", () => {
    expect(splitIntoPages("  Forces act in pairs.\r\n")).toEqual(["Forces act in pairs."]);
    expect(splitIntoPages(" \n\n ")).toEqual([]);
  });

  it("cuts long text at paragraph breaks near the page size, losing nothing but the break", () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(60).trim());
    const text = paras.join("\n\n");
    const pages = splitIntoPages(text, 1000);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(1250);
    expect(pages.every((p) => p.startsWith("Paragraph"))).toBe(true);
    expect(pages.join("\n\n")).toBe(text);
  });

  it("falls back to spaces, then a hard cut, and never passes the maximum", () => {
    const words = "abc ".repeat(3000).trim();
    for (const p of splitIntoPages(words, 1000)) expect(p.length).toBeLessThanOrEqual(1000);
    const solid = "x".repeat(REFERENCE_PAGE_MAX * 2 + 5);
    const pages = splitIntoPages(solid, REFERENCE_PAGE_MAX);
    expect(pages.map((p) => p.length)).toEqual([REFERENCE_PAGE_MAX, REFERENCE_PAGE_MAX, 5]);
  });

  it("estimates tokens at four characters each", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(9)).toBe(3);
  });
});
