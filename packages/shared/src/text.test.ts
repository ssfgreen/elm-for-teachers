import { describe, expect, it } from "vitest";
import { applyText, diffText, textEventName, textOpCounts, TextOpError, TextOps } from "./text.js";

describe("text deltas", () => {
  it("writes CoAuthor-shaped ops with no trailing retain", () => {
    expect(diffText("Hello", "Hello world")).toEqual([{ retain: 5 }, { insert: " world" }]);
    expect(diffText("Hello world", "Hello")).toEqual([{ retain: 5 }, { delete: 6 }]);
    expect(diffText("cat", "hat")).toEqual([{ delete: 1 }, { insert: "h" }]);
    expect(diffText("a**b**c", "abc")).toEqual([{ retain: 1 }, { delete: 5 }, { insert: "b" }]);
    expect(diffText("same", "same")).toEqual([]);
    expect(diffText("", "new")).toEqual([{ insert: "new" }]);
  });

  it("round-trips arbitrary edits, counting code points so emoji are one unit", () => {
    const cases: [string, string][] = [
      ["", ""],
      ["abc", ""],
      ["The loch was smooth.", "The loch was as smooth as glass."],
      ["- one\n- two", "- one\n- two\n- three"],
      ["smile 😀 here", "smile 😀😀 there"],
      ["aaaa", "aa"],
      ["abab", "ab"],
      ["| a | b |", "| a  | b |"],
    ];
    for (const [a, b] of cases) {
      const ops = diffText(a, b);
      expect(TextOps.parse(ops)).toEqual(ops);
      expect(applyText(a, ops)).toBe(b);
    }
    expect(diffText("x😀", "x😀y")).toEqual([{ retain: 2 }, { insert: "y" }]);
  });

  it("refuses ops that run past the end", () => {
    expect(() => applyText("ab", [{ retain: 3 }])).toThrow(TextOpError);
    expect(() => applyText("ab", [{ retain: 1 }, { delete: 2 }])).toThrow(TextOpError);
  });

  it("names and counts deltas", () => {
    expect(textEventName([{ retain: 3 }, { insert: "x" }])).toBe("text-insert");
    expect(textEventName([{ delete: 2 }])).toBe("text-delete");
    expect(textEventName([{ delete: 1 }, { insert: "é😀" }])).toBe("text-replace");
    expect(textEventName([])).toBe("text-none");
    expect(textOpCounts([{ delete: 1 }, { insert: "é😀" }])).toEqual({ inserted: 2, deleted: 1 });
  });
});
