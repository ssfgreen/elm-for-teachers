import { describe, expect, it } from "vitest";
import { diffWords } from "@edw/shared";
import { plainText, suggestionsIn, textChanges } from "./suggestions.js";
import type { PublicBlock } from "../types.js";

describe("textChanges", () => {
  it("pairs an insertion with the deletion after it", () => {
    expect(textChanges(diffWords("a big dog", "a small dog and cat"))).toEqual([
      { ins: "small", del: "big" },
      { ins: " and cat", del: "" },
    ]);
  });
});

const block = (over: Partial<PublicBlock>): PublicBlock => ({
  id: "b1",
  session_id: "s",
  doc_id: "d",
  type: "paragraph",
  content: "",
  status: "live",
  version: 1,
  derived_from: null,
  order: 0,
  pending: null,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("suggestionsIn", () => {
  it("lists the doc's suggestions in order, with what each would do", () => {
    const blocks = [
      block({ id: "b3", order: 2, type: "heading", content: "## Old", pending: { op: "delete", turn_id: "t" } }),
      block({ id: "b1", order: 0, content: "A **bold** claim", pending: { op: "replace", turn_id: "t", content: "A **bold** idea" } }),
      block({ id: "b2", order: 1, status: "proposed", content: "New text" }),
      block({ id: "b4", order: 3, content: "Plain" }),
      block({ id: "b5", order: 4, doc_id: "other", status: "proposed", content: "Elsewhere" }),
    ];
    expect(suggestionsIn(blocks, "d").map((s) => [s.block_id, s.kind, s.title, s.changes, s.text])).toEqual([
      ["b1", "replace", "Edit paragraph", [{ ins: "idea", del: "claim" }], "A bold idea"],
      ["b2", "insert", "Add paragraph", [], "New text"],
      ["b3", "delete", "Delete heading", [], "Old"],
    ]);
  });

  it("calls a change with the same words a formatting change", () => {
    const [s] = suggestionsIn([block({ content: "A claim", pending: { op: "replace", turn_id: "t", content: "A **claim**" } })], "d");
    expect(s?.title).toBe("Format paragraph");
    expect(s?.changes).toEqual([]);
  });

  it("reads list items as lines", () => {
    expect(plainText("bullet_list", "- one\n- two")).toBe("one\ntwo");
  });
});
