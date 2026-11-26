import { describe, expect, it } from "vitest";
import { mergeText } from "./textMerge.js";

const base = "Similes compare two things using like or as. They make writing vivid.";

describe("mergeText", () => {
  it("keeps the teacher's typing and the assistant's change when they touch different words", () => {
    const mine = base + " Try one now.";
    const theirs = "Similes compare things using like or as. They make writing vivid.";
    expect(mergeText(base, mine, theirs)).toBe("Similes compare things using like or as. They make writing vivid. Try one now.");
  });

  it("carries a word the teacher fixed into a shortened passage", () => {
    const mine = base.replace("vivid", "lively");
    const theirs = "Similes compare using like or as. They make writing vivid.";
    expect(mergeText(base, mine, theirs)).toBe("Similes compare using like or as. They make writing lively.");
  });

  it("gives up when both changed the same word", () => {
    expect(mergeText(base, base.replace("vivid", "lively"), base.replace("vivid", "clear"))).toBeNull();
  });

  it("gives up when the teacher typed where the assistant rewrote", () => {
    expect(mergeText(base, base.replace("using", "by using"), base.replace("using", "with"))).toBeNull();
  });

  it("joins edits that only meet: a word the teacher added next to words the assistant took out", () => {
    const mine = base.replace("two things", "two different things");
    const theirs = base.replace("two things", "things");
    expect(mergeText(base, mine, theirs)).toBe("Similes compare different things using like or as. They make writing vivid.");
  });

  it("takes one side when the other did nothing, and either when both did the same", () => {
    const changed = base.replace("vivid", "lively");
    expect(mergeText(base, base, changed)).toBe(changed);
    expect(mergeText(base, changed, base)).toBe(changed);
    expect(mergeText(base, changed, changed)).toBe(changed);
  });

  it("keeps an identical change made on both sides once, beside another", () => {
    const mine = base.replace("vivid", "lively").replace("Similes compare", "Similes, we know, compare");
    const theirs = base.replace("vivid", "lively").replace("two things", "things");
    expect(mergeText(base, mine, theirs)).toBe("Similes, we know, compare things using like or as. They make writing lively.");
  });
});
