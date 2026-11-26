import { describe, expect, it } from "vitest";
import { itemNumbers, joinRuns, matchItems, parseItem, sameItem, splitList, writeItem } from "./lists.js";

describe("list items", () => {
  it("reads and writes an item, with continuation lines under the marker", () => {
    expect(parseItem("numbered_item", "3. Sentence\n   ____")).toEqual({ text: "Sentence\n____", number: 3, checked: false });
    expect(parseItem("checklist_item", "- [x] done")).toEqual({ text: "done", number: 1, checked: true });
    expect(parseItem("bullet_item", "* one")).toMatchObject({ text: "one" });
    expect(parseItem("bullet_item", "no marker")).toMatchObject({ text: "no marker" });
    expect(writeItem("numbered_item", { text: "Sentence\n____", number: 3 })).toBe("3. Sentence\n   ____");
    expect(writeItem("checklist_item", { text: "a\nb", checked: false })).toBe("- [ ] a\n      b");
    expect(writeItem("bullet_item", { text: "" })).toBe("- ");
  });

  it("splits an old list into items, keeping each item's lines and number", () => {
    expect(splitList("numbered_list", "3. On Monday\n   ____\n4. The storm")).toEqual([
      { type: "numbered_item", content: "3. On Monday\n   ____" },
      { type: "numbered_item", content: "4. The storm" },
    ]);
    expect(splitList("bullet_list", "- one\n* two")).toEqual([
      { type: "bullet_item", content: "- one" },
      { type: "bullet_item", content: "- two" },
    ]);
    expect(splitList("checklist", "- [ ] read\n- [x] write\n- plain")).toEqual([
      { type: "checklist_item", content: "- [ ] read" },
      { type: "checklist_item", content: "- [x] write" },
      { type: "checklist_item", content: "- [ ] plain" },
    ]);
    expect(splitList("bullet_list", "")).toEqual([{ type: "bullet_item", content: "- " }]);
  });

  it("numbers a run from its first item, ignoring the others' own numbers", () => {
    const b = (type: string, content: string) => ({ type, content });
    expect(
      itemNumbers([b("numbered_item", "3. a"), b("numbered_item", "1. b"), b("heading", "# H"), b("numbered_item", "5. c"), b("bullet_item", "- d"), b("numbered_item", "1. e")]),
    ).toEqual([3, 4, null, 5, null, 1]);
  });

  it("joins runs into one list each, numbered as shown", () => {
    const blocks = [
      { type: "paragraph", content: "Intro" },
      { type: "numbered_item", content: "2. a" },
      { type: "numbered_item", content: "1. b\n   ____" },
      { type: "bullet_item", content: "- c" },
      { type: "bullet_item", content: "- d" },
    ];
    expect(joinRuns(blocks).map(({ type, content, items }) => ({ type, content, n: items.length }))).toEqual([
      { type: "paragraph", content: "Intro", n: 1 },
      { type: "numbered_list", content: "2. a\n3. b\n   ____", n: 2 },
      { type: "bullet_list", content: "- c\n- d", n: 2 },
    ]);
  });

  it("matches a list's items to its earlier version's: same text first, the rest paired in order", () => {
    // b edited to B, x added after c, d gone.
    expect([...matchItems(["a", "b", "c", "d"], ["a", "B", "c", "x"])]).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect([...matchItems(["a", "b", "c"], ["a", "new", "b", "c"])]).toEqual([[0, 0], [2, 1], [3, 2]]);
    expect([...matchItems(["a", "b", "c"], ["c"])]).toEqual([[0, 2]]);
  });

  it("counts a later numbered item's new number as no change, but not the first item's or a tick", () => {
    expect(sameItem("numbered_item", "2. a", "3. a", false)).toBe(true);
    expect(sameItem("numbered_item", "2. a", "3. a", true)).toBe(false);
    expect(sameItem("numbered_item", "2. a", "2. b", false)).toBe(false);
    expect(sameItem("checklist_item", "- [ ] a", "- [x] a", false)).toBe(false);
  });
});
