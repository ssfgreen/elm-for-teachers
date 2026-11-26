import { describe, expect, it } from "vitest";
import { changeIndexes, diffWords } from "./wordDiff.js";

const show = (before: string, after: string) =>
  diffWords(before, after)
    .map((p) => (p.kind === "same" ? p.text : p.kind === "ins" ? `{+${p.text}+}` : `[-${p.text}-]`))
    .join("");

describe("diffWords", () => {
  it("marks one changed word, the new word before the old", () => {
    expect(show("missing or ambigious, i.e.", "missing or ambiguous, i.e.")).toBe("missing or {+ambiguous+}[-ambigious-], i.e.");
  });

  it("joins words changed side by side into one change", () => {
    expect(show("It either continues now.", "It keeps going now.")).toBe("It {+keeps going+}[-either continues-] now.");
  });

  it("shows added and removed text on their own", () => {
    expect(show("A cat sat.", "A black cat sat.")).toBe("A {+black +}cat sat.");
    expect(show("A black cat sat.", "A cat sat.")).toBe("A [-black -]cat sat.");
  });

  it("returns the text unmarked when nothing changed, and nothing for two empty strings", () => {
    expect(diffWords("same", "same")).toEqual([{ kind: "same", text: "same" }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("keeps every character: the old text and the new can be read back from the parts", () => {
    const before = "The quick brown fox jumps over the lazy dog.";
    const after = "A quick red fox leapt over the dog, lazily.";
    const parts = diffWords(before, after);
    expect(parts.filter((p) => p.kind !== "ins").map((p) => p.text).join("")).toBe(before);
    expect(parts.filter((p) => p.kind !== "del").map((p) => p.text).join("")).toBe(after);
  });
});

describe("changeIndexes", () => {
  it("numbers each change, an insertion and the deletion after it sharing a number", () => {
    const parts = diffWords("a big dog", "a small dog and cat");
    expect(parts.map((p) => p.kind)).toEqual(["same", "ins", "del", "same", "ins"]);
    expect(changeIndexes(parts)).toEqual([-1, 0, 0, -1, 1]);
  });
});
