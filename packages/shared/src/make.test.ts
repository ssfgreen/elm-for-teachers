import { describe, expect, it } from "vitest";
import { cleanPart, DESIGN_PART_TYPES, designPrompt, ensureFit, MAKE_PARTS_MAX, MakeBoard, MakePart, parseDesign, sketchIdea } from "./make.js";

describe("make kit", () => {
  it("reads the model's design as one option, cleaning parts, places and dashes", () => {
    const reply = `Here you go:\n${JSON.stringify({
      understood: "You want it read aloud — to hear it",
      question: null,
      options: [
        { title: "Read aloud", zone: "toolbar", pill: "🔊 Read", parts: [{ type: "heading", text: "Read aloud" }, { type: "script", text: "x" }, { type: "chips", items: ["Slow", "Normal"] }], fit: { toolbar: { ok: true, why: "an action" }, sidebar: { ok: false, why: "for finding chats" } } },
        { title: "Second", zone: "chat", parts: [{ type: "text", text: "dropped" }] },
      ],
    })}`;
    const r = parseDesign(reply, "read the worksheet aloud")!;
    expect(r.understood).toBe("You want it read aloud , to hear it");
    expect(r.options).toHaveLength(1);
    expect(r.options[0]!.parts).toEqual([{ type: "heading", text: "Read aloud" }, { type: "chips", items: ["Slow", "Normal"] }]);
    expect(r.options[0]!.fit.sidebar).toEqual({ ok: false, why: "for finding chats" });
    // At least two good places, and the zone is one of them.
    expect(Object.values(r.options[0]!.fit).filter((f) => f?.ok).length).toBeGreaterThanOrEqual(2);
    expect(r.options[0]!.fit[r.options[0]!.zone]?.ok).toBe(true);
  });

  it("fills in a design's missing goal, pill and place", () => {
    const r = parseDesign(JSON.stringify({ options: [{ title: "Bad place", zone: "nowhere", parts: [{ type: "text", text: "Hi" }] }] }), "x")!;
    expect(r.options[0]!.goal).toBe("");
    expect(r.options[0]!.pill).toBe("✦ Bad place");
    expect(r.options[0]!.fit[r.options[0]!.zone]?.ok).toBe(true);
  });

  it("asks the model for one design", () => {
    const p = designPrompt({ text: "a timer" });
    expect(p).toContain("Design ONE");
    expect(p).not.toMatch(/TWO|option A/);
  });

  it("returns null for a reply with no usable options", () => {
    expect(parseDesign("sorry", "x")).toBeNull();
    expect(parseDesign('{"options":[{"parts":[]}]}', "x")).toBeNull();
  });

  it("places a sketch by keyword and never against a poor fit", () => {
    expect(sketchIdea("i1", "Undo the last AI change").zone).toBe("toolbar");
    const fit = ensureFit({ toolbar: { ok: false, why: "no" } }, "undo");
    expect(fit.toolbar).toEqual({ ok: false, why: "no" });
    expect(Object.values(fit).filter((f) => f?.ok)).toHaveLength(2);
  });

  it("asks again with the previous options and the change", () => {
    const p = designPrompt({ text: "a timer", feedback: "smaller", previous: [{ title: "Timer", zone: "bottom", parts: [{ type: "text", text: "0:00" }] }] });
    expect(p).toContain('"""smaller"""');
    expect(p).toContain('"title":"Timer"');
  });

  it("cleans each kind of part, keeping values in range", () => {
    expect(cleanPart({ type: "slider", text: "Support", low: "Less", high: "More", value: 140 })).toEqual({ type: "slider", text: "Support", low: "Less", high: "More", value: 100 });
    expect(cleanPart({ type: "radio", items: ["A", "B"], active: 9 })).toEqual({ type: "radio", items: ["A", "B"], active: 1 });
    expect(cleanPart({ type: "checks", items: ["A", "B"], on: [1, 5, -1] })).toEqual({ type: "checks", items: ["A", "B"], on: [1] });
    expect(cleanPart({ type: "table", columns: ["Name", "Level"], rows: [["Amy", "P7", "extra"], "bad"] })).toEqual({ type: "table", columns: ["Name", "Level"], rows: [["Amy", "P7"]] });
    expect(cleanPart({ type: "note", text: "Careful", tone: "loud" })).toEqual({ type: "note", text: "Careful" });
    expect(cleanPart({ type: "message", from: "pupil", text: "Hi" })).toEqual({ type: "message", from: "assistant", text: "Hi" });
    expect(cleanPart({ type: "list", items: [] })).toBeNull();
    expect(cleanPart({ type: "timer" })).toBeNull();
    expect(cleanPart({ type: "constructor" })).toBeNull();
  });

  it("cleans the activity parts", () => {
    expect(cleanPart({ type: "question", text: "Which is a simile?", items: ["As brave as a lion", "He is a lion"], answer: 7 })).toEqual({ type: "question", text: "Which is a simile?", items: ["As brave as a lion", "He is a lion"], answer: 1 });
    expect(cleanPart({ type: "blanks", text: "No gaps here" })).toBeNull();
    expect(cleanPart({ type: "score", value: 40, total: 10, text: "" })).toEqual({ type: "score", value: 10, total: 10, text: "" });
    expect(cleanPart({ type: "match", pairs: [["simile", "like or as"]] })).toBeNull();
  });

  it("keeps rows and boxes one level deep", () => {
    const box = cleanPart({ type: "box", title: "Settings", parts: [{ type: "toggle", text: "On" }, { type: "row", parts: [{ type: "text", text: "x" }] }, { type: "nope" }] });
    expect(box).toEqual({ type: "box", title: "Settings", parts: [{ type: "toggle", text: "On" }] });
    expect(cleanPart({ type: "row", parts: [{ type: "nope" }] })).toBeNull();
  });

  it("allows up to eight parts, and every design part fits the schema", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({ type: "text", text: `t${i}` }));
    const r = parseDesign(JSON.stringify({ understood: "", question: null, options: [{ title: "Many", zone: "chat", parts }] }), "x")!;
    expect(r.options[0]!.parts).toHaveLength(MAKE_PARTS_MAX);
    const sample: Record<string, unknown> = { text: "a", items: ["a", "b"], rows: [["a", "b"]], columns: ["a"], sections: [["a", "b"]], name: "a", source: "a", before: "a", after: "a", value: 3, low: "a", high: "a", from: "teacher" };
    for (const type of DESIGN_PART_TYPES) {
      const own: Record<string, unknown> = { table: { rows: [["a"]] }, bars: { rows: [["a", 50]] }, stat: { value: "3" }, blanks: { text: "as bright [[as]] the sun" }, match: { pairs: [["a", "b"], ["c", "d"]] } };
      const p = cleanPart({ type, ...sample, ...(own[type] as object) });
      expect(p, type).not.toBeNull();
      expect(MakePart.safeParse(p).success, type).toBe(true);
    }
  });

  it("lists every part, rows, boxes and the catch-all in the prompt", () => {
    const p = designPrompt({ text: "a timer" });
    for (const type of DESIGN_PART_TYPES) expect(p).toContain(`"type":"${type}"`);
    expect(p).toContain('"type":"row"');
    expect(p).toContain('"type":"box"');
    expect(p).toContain(`Use 2 to ${MAKE_PARTS_MAX} parts`);
  });

  it("checks a saved board", () => {
    expect(MakeBoard.safeParse({ placed: [{ uid: "u", id: "ask", zone: "chat" }], ideas: [], feedback: { "Chat › Send": { verdict: "like", comment: "", at: "2026-11-02T10:00:00Z" } } }).success).toBe(true);
    expect(MakeBoard.safeParse({ placed: [{ uid: "u", id: "ask", zone: "roof" }], ideas: [], feedback: {} }).success).toBe(false);
  });
});
