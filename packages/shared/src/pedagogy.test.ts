import { describe, expect, it } from "vitest";
import { citedClaims, keepKnownCitations, needHints } from "./pedagogy.js";

describe("citations", () => {
  it("lists the claims a text cites, each once", () => {
    expect(citedClaims("Bold [[clm-ACC-bold]], spacing [[clm-ACC-spacing-zorzi]] and bold [[clm-ACC-bold]].")).toEqual(["clm-ACC-bold", "clm-ACC-spacing-zorzi"]);
  });
  it("takes out citations of claims not retrieved, and says which", () => {
    const r = keepKnownCitations("Bold [[clm-a]] and made up [[clm-zz]][[clm-zz]].", new Set(["clm-a"]));
    expect(r).toEqual({ text: "Bold [[clm-a]] and made up.", dropped: ["clm-zz"] });
  });
});

describe("needHints", () => {
  it("turns typed needs into hints for where to look, ignoring the rest", () => {
    expect(needHints(["Dyslexia", "Working memory", "Autism", "ADHD", "Speech and language"])).toEqual(["dyslexia", "autism", "ADHD", "developmental language disorder"]);
    expect(needHints(["High achiever"])).toEqual([]);
  });
});
