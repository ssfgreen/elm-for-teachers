import { describe, expect, it } from "vitest";
import { parsePartialArray, splitStreamingReply } from "./streaming.js";

describe("splitStreamingReply", () => {
  it("shows the message and hides a fence that is still being typed", () => {
    expect(splitStreamingReply("Here is a draft")).toEqual({ message: "Here is a draft", opsText: null, opsDone: false });
    expect(splitStreamingReply("Here is a draft.\n\n``")).toMatchObject({ message: "Here is a draft.", opsText: null });
    expect(splitStreamingReply("Here is a draft.\n\n```jso")).toMatchObject({ message: "Here is a draft.", opsText: null });
  });

  it("separates the operations fence, open or closed, and keeps text after it", () => {
    expect(splitStreamingReply('Done.\n\n```json\n[{"op":')).toEqual({ message: "Done.", opsText: '[{"op":', opsDone: false });
    expect(splitStreamingReply('Done.\r\n\r\n```json\r\n[]\r\n```\r\nAsk me more.')).toEqual({ message: "Done.\n\nAsk me more.", opsText: "[]\n", opsDone: true });
    expect(splitStreamingReply("Done.\n\n```\n[1]\n```")).toMatchObject({ message: "Done.", opsText: "[1]\n" });
  });

  it("leaves an ordinary quoted fence in the message", () => {
    expect(splitStreamingReply("Try:\n\n```\nThe sea is a mirror.\n```").opsText).toBeNull();
  });
});

describe("parsePartialArray", () => {
  it("returns finished elements and the object being written, with its partial string", () => {
    const text = '[{"op":"insert","after":"start","type":"heading","content":"# Similes"},\n {"op":"insert","after":"start","type":"paragraph","content":"A simile compa';
    expect(parsePartialArray(text)).toEqual({
      items: [
        { op: "insert", after: "start", type: "heading", content: "# Similes" },
        { op: "insert", after: "start", type: "paragraph", content: "A simile compa" },
      ],
      lastComplete: false,
    });
  });

  it("keeps a half-written value, drops a dangling colon, an unfinished escape and a growing number", () => {
    expect(parsePartialArray('[{"op":"delete","id":"X"},{"op":"repl').items).toEqual([{ op: "delete", id: "X" }, { op: "repl" }]);
    expect(parsePartialArray('[{"op":"delete","i').items).toEqual([{ op: "delete" }]);
    expect(parsePartialArray('[{"op":"replace","content":').items).toEqual([{ op: "replace" }]);
    expect(parsePartialArray('[{"content":"line\\').items).toEqual([{ content: "line" }]);
    expect(parsePartialArray('[{"content":"a\\nb \\u00e9 \\u00').items).toEqual([{ content: "a\nb é " }]);
    expect(parsePartialArray('[{"n":12').items).toEqual([{}]);
  });

  it("reports a finished array, and gives nothing for text that is not an array", () => {
    expect(parsePartialArray(' [ {"a":[1,2]} , {"b":true} ] ')).toEqual({ items: [{ a: [1, 2] }, { b: true }], lastComplete: true });
    expect(parsePartialArray('[{"a":1},')).toEqual({ items: [{ a: 1 }], lastComplete: true });
    expect(parsePartialArray("")).toEqual({ items: [], lastComplete: true });
    expect(parsePartialArray('{"a":1}')).toEqual({ items: [], lastComplete: true });
  });
});
