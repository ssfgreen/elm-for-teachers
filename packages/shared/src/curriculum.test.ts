import { describe, expect, it } from "vitest";
import { levelDigit, parseOutcomeLine, stageFacets } from "./curriculum.js";

describe("parseOutcomeLine", () => {
  it("reads one code or two, and the statement", () => {
    expect(parseOutcomeLine("LIT 2-16a: To show my understanding, I can identify the purpose.")).toEqual({ codes: ["LIT 2-16a"], text: "To show my understanding, I can identify the purpose." });
    expect(parseOutcomeLine("LIT 2-10a / LIT 3-10a: I am developing confidence.")?.codes).toEqual(["LIT 2-10a", "LIT 3-10a"]);
  });
  it("is null for any other line", () => {
    expect(parseOutcomeLine("# Literacy")).toBeNull();
    expect(parseOutcomeLine("Through my learning:")).toBeNull();
  });
});

describe("stageFacets", () => {
  it("reads the stage and the level the teacher typed", () => {
    expect(stageFacets("Primary 7, Second level")).toEqual({ stage: "p7", level: "second" });
    expect(stageFacets("S1 history")).toEqual({ stage: "s1", level: "third" });
  });
  it("works the level out from the stage, and falls back to the year group's name", () => {
    expect(stageFacets(null, "P3")).toEqual({ stage: "p3", level: "first" });
    expect(stageFacets("S5")).toEqual({ stage: "s5", level: "senior" });
    expect(stageFacets("Mixed group")).toEqual({ stage: null, level: null });
  });
  it("gives a level's digit for code filters", () => {
    expect(levelDigit("second")).toBe(2);
    expect(levelDigit("senior")).toBeNull();
  });
});
