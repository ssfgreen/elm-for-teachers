import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { applyText, newUlid, type TextEdit } from "@edw/shared";
import { Canvas } from "./Canvas.js";
import { SUGGESTION_SELECT, type SuggestionSelectEvent } from "./extensions/trackChanges.js";
import { block } from "./markdown.test.js";
import type { PublicBlock, StructuralCommand, StructuralResponse } from "./types.js";
import type { EventLogger } from "../events/logger.js";
import { installEditorPolyfills } from "../test-utils.js";

function fakeLogger(): EventLogger & { calls: Array<{ kind: string; payload: unknown }> } {
  const calls: Array<{ kind: string; payload: unknown }> = [];
  return {
    calls,
    log: ((kind: string, payload: unknown) => {
      calls.push({ kind, payload });
      return newUlid();
    }) as EventLogger["log"],
    pending: () => 0,
    flush: async () => {},
    onError: () => () => {},
    stop: () => {},
  };
}

interface Harness {
  editor: Editor;
  logger: ReturnType<typeof fakeLogger>;
  structural: ReturnType<typeof vi.fn>;
  onLocalEdit: ReturnType<typeof vi.fn>;
  onSyncError: ReturnType<typeof vi.fn>;
  onAskModel: ReturnType<typeof vi.fn>;
  onSendComment: ReturnType<typeof vi.fn>;
  container: HTMLElement;
  rerender: (blocks: PublicBlock[], docId?: string) => void;
}

const ok: StructuralResponse = { changes: { blocks: [], docs: [], revisions: [] }, block: null, doc: null };

function mount(blocks: PublicBlock[], opts: { structural?: (cmd: StructuralCommand) => Promise<StructuralResponse>; readOnly?: boolean } = {}): Harness {
  const logger = fakeLogger();
  let editor: Editor | null = null;
  const structural = vi.fn(opts.structural ?? (async () => ok));
  const onLocalEdit = vi.fn();
  const onSyncError = vi.fn();
  const onAskModel = vi.fn();
  const onSendComment = vi.fn();
  const el = (b: PublicBlock[], docId = DOC) => (
    <Canvas
      docId={docId}
      blocks={b}
      readOnly={opts.readOnly ?? false}
      logger={logger}
      structural={structural}
      onLocalEdit={onLocalEdit}
      onSyncError={onSyncError}
      onAskModel={onAskModel}
      onSendComment={onSendComment}
      onEditorReady={(e) => (editor = e)}
    />
  );
  const r = render(el(blocks));
  if (!editor) throw new Error("editor not created");
  return { editor, logger, structural, onLocalEdit, onSyncError, onAskModel, onSendComment, container: r.container, rerender: (b, docId) => r.rerender(el(b, docId)) };
}

const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";
const OTHER_DOC = "01ARZ3NDEKTSV4RRFFQ69G5D02";
const A = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
const B = "01ARZ3NDEKTSV4RRFFQ69G5FA2";
const C = "01ARZ3NDEKTSV4RRFFQ69G5FA3";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const ids = (h: Harness) => Array.from(h.container.querySelectorAll(".canvas-pm > [data-block-id]")).map((e) => e.getAttribute("data-block-id"));
const type = (h: Harness, text: string) => act(() => h.editor.view.dispatch(h.editor.state.tr.insertText(text)));
const setCursor = (h: Harness, pos: number) => act(() => h.editor.view.dispatch(h.editor.state.tr.setSelection(TextSelection.create(h.editor.state.doc, pos))));
const key = (h: Harness, name: string) => act(() => void h.editor.commands.keyboardShortcut(name));
const flushBatch = () => act(() => void vi.advanceTimersByTime(600));
async function waitForOption(h: Harness, title: string): Promise<HTMLElement> {
  for (let i = 0; i < 10; i++) {
    const found = [...h.container.querySelectorAll<HTMLElement>(".slash-item")].find((el) => el.querySelector(".slash-title")?.textContent === title);
    if (found) return found;
    await act(async () => {
      vi.advanceTimersByTime(20);
      await Promise.resolve();
    });
  }
  throw new Error(`menu option ${title} not shown`);
}
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeAll(installEditorPolyfills);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Canvas on Tiptap", () => {
  it("renders the doc's blocks in order with their ids and types in the DOM", () => {
    const h = mount([
      block({ id: B, content: "- two", type: "bullet_list", order: 1 }),
      block({ id: A, content: "# One", type: "heading", order: 0 }),
      block({ id: C, content: "Silk.", order: 2 }),
    ]);
    expect(ids(h)).toEqual([A, B, C]);
    expect(h.container.querySelector(`h1[data-block-id="${A}"]`)).not.toBeNull();
    expect(h.container.querySelector(`ul[data-block-id="${B}"] li p`)?.textContent).toBe("two");
    expect(h.container.querySelector(`p[data-block-id="${C}"]`)?.textContent).toBe("Silk.");
    expect(h.structural).not.toHaveBeenCalled();
  });

  it("batches typing into one keystroke_batch with content_after and reports the local edit", () => {
    const h = mount([block({ id: A, content: "Hello" })]);
    setCursor(h, 6);
    type(h, " w");
    type(h, "orld");
    expect(h.logger.calls.filter((c) => c.kind === "keystroke_batch")).toEqual([]);
    flushBatch();
    const batches = h.logger.calls.filter((c) => c.kind === "keystroke_batch");
    expect(batches).toHaveLength(1);
    expect(batches[0]!.payload).toMatchObject({
      target: { kind: "block", block_id: A },
      char_count: 6,
      content_after: { content: "Hello world" },
      edits: [
        { t: expect.any(Number), ops: [{ retain: 5 }, { insert: " w" }] },
        { t: expect.any(Number), ops: [{ retain: 7 }, { insert: "orld" }] },
      ],
    });
    expect(batches[0]!.payload).not.toHaveProperty("steps");
    expect(h.onLocalEdit).toHaveBeenCalledWith(A, { content: "Hello world" });
    expect(h.structural).not.toHaveBeenCalled();
  });

  it("replaying the logged edits from the starting content reproduces every content_after", () => {
    type Batch = { target: { block_id: string }; edits: TextEdit[]; content_after: { content: string } };
    const h = mount([
      block({ id: A, content: "Hello world", order: 0 }),
      block({ id: B, type: "table", content: "| a | b |\n| 1 | 2 |", order: 1 }),
    ]);
    const state = new Map<string, { content: string }>([
      [A, { content: "Hello world" }],
      [B, { content: "| a | b |\n| 1 | 2 |" }],
    ]);
    const posOf = (id: string) => {
      let at = -1;
      h.editor.state.doc.forEach((n, off) => {
        if (n.attrs.id === id) at = off;
      });
      return at;
    };
    // Paragraph: type, delete, bold a word.
    // Text offset k sits at document position posOf(A) + 1 + k.
    setCursor(h, posOf(A) + 7); // after "Hello "
    type(h, "big "); // "Hello big world"
    act(() => h.editor.view.dispatch(h.editor.state.tr.delete(posOf(A) + 2, posOf(A) + 3))); // "Hllo big world"
    act(() => {
      h.editor.view.dispatch(h.editor.state.tr.setSelection(TextSelection.create(h.editor.state.doc, posOf(A) + 6, posOf(A) + 9)));
      h.editor.commands.toggleBold();
    });
    flushBatch();
    // Table: a trailing space then a letter in the first cell.
    setCursor(h, posOf(B) + 5);
    type(h, " ");
    type(h, "x");
    flushBatch();
    const batches = h.logger.calls.filter((c) => c.kind === "keystroke_batch").map((c) => c.payload as Batch);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    for (const b of batches) {
      const s = state.get(b.target.block_id)!;
      for (const e of b.edits) {
        s.content = applyText(s.content, e.ops);
      }
      expect(s).toEqual(b.content_after);
    }
    expect(state.get(A)!.content).toBe("Hllo **big** world");
    expect(state.get(B)!.content).toBe("| a x | b |\n| 1 | 2 |");
  });

  it("Enter splits locally at once, names the new block, and posts a split in the background", async () => {
    const h = mount([block({ id: A, content: "Hello world" })]);
    setCursor(h, 7); // after "Hello "
    key(h, "Enter");
    const after = ids(h);
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(A);
    expect(after[1]).toMatch(ULID);
    expect(h.editor.state.doc.child(1).textContent).toBe("world");
    await settle();
    expect(h.structural).toHaveBeenCalledTimes(1);
    expect(h.structural.mock.calls[0]![0]).toEqual({
      command: "split",
      block_id: A,
      first: { content: "Hello " },
      second: { content: "world" },
      second_type: "paragraph",
      second_id: after[1],
    });
  });

  it("holds keystroke batches for a new block until its insert is acknowledged", async () => {
    let release: (() => void) | null = null;
    const h = mount([block({ id: A, content: "Hello" })], {
      structural: () => new Promise<StructuralResponse>((r) => (release = () => r(ok))),
    });
    setCursor(h, 6);
    key(h, "Enter");
    type(h, "new text");
    flushBatch();
    await settle();
    expect(h.logger.calls.filter((c) => c.kind === "keystroke_batch")).toHaveLength(0);
    expect(h.structural).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!();
      await Promise.resolve();
      await Promise.resolve();
    });
    const batches = h.logger.calls.filter((c) => c.kind === "keystroke_batch");
    expect(batches).toHaveLength(1);
    expect(batches[0]!.payload).toMatchObject({ content_after: { content: "new text" } });
  });

  it("Backspace at the start of a block merges into the previous one through a merge command", async () => {
    const h = mount([block({ id: A, content: "Hello", order: 0 }), block({ id: B, content: "world", order: 1 })]);
    setCursor(h, 8); // start of B: A occupies 0..7
    key(h, "Backspace");
    expect(ids(h)).toEqual([A]);
    expect(h.editor.state.doc.child(0).textContent).toBe("Helloworld");
    await settle();
    expect(h.structural.mock.calls[0]![0]).toEqual({ command: "merge", block_id: B, merged_into: A, after: { content: "Helloworld" } });
  });

  it("changing the block type from the toolbar is a retype that keeps the id", async () => {
    const h = mount([block({ id: A, content: "Title" })]);
    setCursor(h, 2);
    await act(async () => {
      fireEvent.click(h.container.querySelector('button[aria-label^="Heading 1"]')!);
    });
    expect(h.container.querySelector(`h1[data-block-id="${A}"]`)?.textContent).toBe("Title");
    await settle();
    expect(h.structural.mock.calls[0]![0]).toEqual({ command: "retype", block_id: A, type: "heading", after: { content: "# Title" } });
    await act(async () => {
      fireEvent.click(h.container.querySelector('button[aria-label^="Bulleted list"]')!);
    });
    // A list is a block per item (PLAN.md section 6).
    expect(h.container.querySelector(`div.list-blk[data-block-id="${A}"]`)).not.toBeNull();
    await settle();
    expect(h.structural.mock.calls[1]![0]).toMatchObject({ command: "retype", block_id: A, type: "bullet_item", after: { content: "- Title" } });
  });

  it("shows suggestions as tracked changes: words added underlined, words taken out struck through after them", () => {
    const h = mount([
      block({ id: A, content: "live", order: 0 }),
      block({ id: B, content: "suggested", status: "proposed", order: 1 }),
      block({ id: C, content: "the old word", order: 2, pending: { op: "replace", turn_id: "t", content: "the new word" } }),
    ]);
    expect(h.container.querySelector(`[data-block-id="${B}"]`)?.classList.contains("st-proposed")).toBe(true);
    const changed = h.container.querySelector(`[data-block-id="${C}"]`)!;
    expect(changed.querySelector(".sg-ins")?.textContent).toBe("new");
    expect(changed.querySelector("del.sg-del")?.textContent).toBe("old");
    // Each change is labelled with its card's number, so hovering a card can pick out just it.
    expect(changed.querySelector(".sg-ins")?.getAttribute("data-suggest-part")).toBe("0");
    expect(changed.querySelector(".sg-del")?.getAttribute("data-suggest-part")).toBe("0");
    // The struck words are drawn, not part of the document: the teacher edits the suggested text.
    expect(changed.textContent).toBe("the newold word");
    expect(h.editor.state.doc.child(2).textContent).toBe("the new word");
    // No tick or cross in the margin: suggestions are decided on their cards.
    expect(h.container.querySelector(".proposal-marks, .pm-btn")).toBeNull();
  });

  it("a click in a suggestion tells the screen which one, and a click elsewhere does not", () => {
    const h = mount([
      block({ id: A, content: "live", order: 0 }),
      block({ id: B, content: "suggested", status: "proposed", order: 1 }),
    ]);
    const picked: string[] = [];
    h.container.addEventListener(SUGGESTION_SELECT, (e) => picked.push((e as SuggestionSelectEvent).detail.block_id));
    const click = (pos: number) => h.editor.view.someProp("handleClick", (f) => f(h.editor.view, pos, new MouseEvent("click")));
    click(2);
    click(h.editor.state.doc.child(0).nodeSize + 3);
    expect(picked).toEqual([B]);
  });

  it("a click on one change in a suggested edit says which change, so its own card is picked out", () => {
    const h = mount([block({ id: A, content: "a big dog", pending: { op: "replace", turn_id: "t", content: "a small dog and cat" } })]);
    const picked: unknown[] = [];
    h.container.addEventListener(SUGGESTION_SELECT, (e) => picked.push((e as SuggestionSelectEvent).detail));
    const clickOn = (el: Element, pos: number) => {
      const e = new MouseEvent("click", { bubbles: true });
      el.dispatchEvent(e);
      h.editor.view.someProp("handleClick", (f) => f(h.editor.view, pos, e));
    };
    const [, second] = [...h.container.querySelectorAll(".sg-ins")];
    clickOn(second!, 15);
    clickOn(h.container.querySelector(".sg-del")!, 3);
    // Elsewhere in the block: the block, with no change in particular.
    clickOn(h.container.querySelector(`[data-block-id="${A}"]`)!, 2);
    expect(picked).toEqual([{ block_id: A, part: 1 }, { block_id: A, part: 0 }, { block_id: A, part: null }]);
  });

  it("typing into a suggestion keeps it waiting, as in Word: after its words the text joins it, elsewhere it is the teacher's", () => {
    const h = mount([block({ id: A, content: "old text", pending: { op: "replace", turn_id: "t", content: "new text" } })]);
    // At the end, after the block's own word "text": the teacher's text, in both.
    setCursor(h, 9);
    type(h, "!");
    expect(h.editor.state.doc.child(0).attrs).toMatchObject({ status: "live", original: "old text!", pending: { op: "replace", content: "new text!" } });
    // Straight after the suggested word "new": part of the suggestion only.
    setCursor(h, 4);
    type(h, "er");
    expect(h.editor.state.doc.child(0).attrs).toMatchObject({ original: "old text!", pending: { op: "replace", content: "newer text!" } });
    expect(h.container.querySelector(".sg-ins")?.textContent).toBe("newer");
    expect(h.container.querySelector(".sg-del")?.textContent).toBe("old");
    flushBatch();
    const batch = h.logger.calls.filter((c) => c.kind === "keystroke_batch").at(-1)!.payload;
    expect(batch).toMatchObject({ content_after: { content: "newer text!" }, in_suggestion: true, live_after: { content: "old text!" } });
    expect(h.onLocalEdit).toHaveBeenLastCalledWith(A, { content: "newer text!" }, { live: { content: "old text!" } });
  });

  it("typing into a new block from the assistant keeps it a suggestion; typing into one suggested for deletion keeps the block", () => {
    const h = mount([block({ id: A, content: "added", status: "proposed", order: 0 }), block({ id: B, content: "gone", order: 1, pending: { op: "delete", turn_id: "t" } })]);
    setCursor(h, 6);
    type(h, "!");
    expect(h.editor.state.doc.child(0).attrs.status).toBe("proposed");
    expect(h.container.querySelector(`[data-block-id="${A}"]`)?.classList.contains("st-proposed")).toBe(true);
    setCursor(h, h.editor.state.doc.child(0).nodeSize + 5);
    type(h, "?");
    expect(h.editor.state.doc.child(1).attrs).toMatchObject({ status: "live", pending: null });
  });

  it("reconciles new blocks from props without clobbering a block with unflushed typing", () => {
    const h = mount([block({ id: A, content: "Hello", order: 0 })]);
    setCursor(h, 6);
    type(h, " there");
    h.rerender([block({ id: A, content: "Hello", order: 0 }), block({ id: B, content: "Added", status: "proposed", order: 1 })]);
    expect(ids(h)).toEqual([A, B]);
    expect(h.editor.state.doc.child(0).textContent).toBe("Hello there");
    expect(h.editor.state.doc.child(1).textContent).toBe("Added");
    expect(h.structural).not.toHaveBeenCalled();
  });

  it("keeps the cursor and a trailing space in a table cell when the flushed content comes back as props", () => {
    const h = mount([block({ id: A, type: "table", content: "| a | b |\n| 1 | 2 |" })]);
    // Inside the first cell, after "a": table(1) > row(1) > cell(1) > paragraph(1) > text.
    setCursor(h, 5);
    type(h, " ");
    expect(h.editor.state.doc.firstChild!.firstChild!.firstChild!.textContent).toBe("a ");
    flushBatch();
    expect(h.onLocalEdit).toHaveBeenCalledTimes(1);
    const stored = h.onLocalEdit.mock.calls[0]![1] as { content: string };
    expect(stored.content).toBe("| a  | b |\n| 1 | 2 |");
    const before = h.editor.state.selection.from;
    h.rerender([block({ id: A, type: "table", content: stored.content })]);
    expect(h.editor.state.doc.firstChild!.firstChild!.firstChild!.textContent).toBe("a ");
    expect(h.editor.state.selection.from).toBe(before);
    type(h, "x");
    expect(h.editor.state.doc.firstChild!.firstChild!.firstChild!.textContent).toBe("a x");
  });

  it("an empty doc starts as one unnamed paragraph that becomes an insert when typed into", async () => {
    const h = mount([]);
    expect(ids(h)).toEqual([""]);
    setCursor(h, 1);
    type(h, "First");
    const [id] = ids(h);
    expect(id).toMatch(ULID);
    await settle();
    expect(h.structural.mock.calls[0]![0]).toMatchObject({ command: "insert", id, after: "start", type: "paragraph", content: "First" });
    expect(h.logger.calls.filter((c) => c.kind === "keystroke_batch")).toHaveLength(0);
  });

  it("Shift+Enter is a line break inside a paragraph, saved as \\n, and does nothing in a heading", () => {
    const h = mount([block({ id: A, content: "Write your own:", order: 0 }), block({ id: B, type: "heading", content: "## Title", order: 1 })]);
    setCursor(h, 16);
    key(h, "Shift-Enter");
    type(h, "The thunder was");
    expect(h.editor.state.doc.childCount).toBe(2);
    flushBatch();
    expect(h.onLocalEdit).toHaveBeenLastCalledWith(A, { content: "Write your own:\nThe thunder was" });
    expect(h.container.querySelector(`p[data-block-id="${A}"] br`)).not.toBeNull();
    const before = h.editor.state.doc.child(1).toJSON();
    setCursor(h, h.editor.state.doc.child(0).nodeSize + 3);
    key(h, "Shift-Enter");
    expect(h.editor.state.doc.child(1).toJSON()).toEqual(before);
    expect(h.structural).not.toHaveBeenCalled();
  });

  it("shows one hint: on an empty doc's line, then only on the empty line with the cursor", () => {
    const h = mount([]);
    const hints = () => [...h.container.querySelectorAll(".canvas-pm > .has-placeholder")].map((e) => e.getAttribute("data-placeholder"));
    expect(hints()).toEqual(["Write here, or type / for options"]);
    setCursor(h, 1);
    key(h, "Enter");
    key(h, "Enter");
    expect(h.editor.state.doc.childCount).toBe(3);
    expect(hints()).toEqual(["Write here, or type / for options"]);
    expect(h.container.querySelectorAll(".canvas-pm > *")[2]!.classList.contains("has-placeholder")).toBe(true);
    setCursor(h, 1);
    expect(h.container.querySelectorAll(".canvas-pm > *")[0]!.classList.contains("has-placeholder")).toBe(true);
    expect(hints()).toHaveLength(1);
    act(() => void h.editor.commands.setHeading({ level: 3 }));
    expect(hints()).toEqual(["Heading 3"]);
    type(h, "x");
    expect(hints()).toEqual([]);
  });

  it("switching docs keeps sending the last doc's queued commands", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const h = mount([block({ id: A, content: "Hello" })], { structural: async () => (await gate, ok) });
    setCursor(h, 3);
    key(h, "Enter");
    key(h, "Enter");
    await settle();
    expect(h.structural).toHaveBeenCalledTimes(1);
    act(() => h.rerender([block({ id: C, content: "Other", doc_id: OTHER_DOC })], OTHER_DOC));
    expect(ids(h)).toEqual([C]);
    release();
    await settle();
    await settle();
    expect(h.structural.mock.calls.map((c) => (c[0] as StructuralCommand).command)).toEqual(["split", "split"]);
    expect(h.onSyncError).not.toHaveBeenCalled();
  });

  it("reports a refused command so the screen can reload", async () => {
    const h = mount([block({ id: A, content: "Hello" })], { structural: async () => Promise.reject(new Error("409 conflict")) });
    setCursor(h, 3);
    key(h, "Enter");
    await settle();
    await settle();
    expect(h.onSyncError).toHaveBeenCalledTimes(1);
    expect(h.onSyncError.mock.calls[0]![1]).toMatchObject({ command: "split", block_id: A });
  });

  it("logs a paste with its source and lets the editor insert it", () => {
    const h = mount([block({ id: A, content: "A" })]);
    setCursor(h, 2);
    const text = "pasted from outside the tool window";
    act(() => {
      fireEvent.paste(h.editor.view.dom, { clipboardData: { getData: (t: string) => (t === "text/plain" ? text : ""), files: [], types: ["text/plain"] } });
    });
    const paste = h.logger.calls.find((c) => c.kind === "paste");
    expect(paste?.payload).toMatchObject({ target: { kind: "block", block_id: A }, source: "external", length: text.length });
  });

  it("the @model button reports the selected passage with offsets inside its block, once the block is saved", async () => {
    const h = mount([block({ id: A, content: "Her voice was like silk.", order: 0 }), block({ id: B, content: "Second", order: 1 })]);
    act(() => h.editor.view.dispatch(h.editor.state.tr.setSelection(TextSelection.create(h.editor.state.doc, 1, 10))));
    act(() => {
      fireEvent.click(h.container.querySelector(".canvas-toolbar button.tb-ask")!);
    });
    await vi.waitFor(() => expect(h.onAskModel).toHaveBeenCalledWith({ block_id: A, from: 0, to: 9, quote: "Her voice" }));
    expect(h.structural).not.toHaveBeenCalled();
  });

  it("@model keeps a line break in the quoted passage", async () => {
    const h = mount([block({ id: A, content: "The sun was a golden coin.\nS or M? ____", order: 0 })]);
    act(() => h.editor.view.dispatch(h.editor.state.tr.setSelection(TextSelection.create(h.editor.state.doc, 1, h.editor.state.doc.firstChild!.nodeSize - 1))));
    act(() => {
      fireEvent.click(h.container.querySelector(".canvas-toolbar button.tb-ask")!);
    });
    await vi.waitFor(() => expect(h.onAskModel).toHaveBeenCalledWith(expect.objectContaining({ block_id: A, quote: "The sun was a golden coin.\nS or M? ____" })));
  });

  it("typing @ offers @model; choosing it opens an inline prompt that sends a comment on the block", async () => {
    const h = mount([block({ id: A, content: "Her voice was like silk.", order: 0 })]);
    setCursor(h, 25); // end of the sentence
    type(h, " @");
    const option = await waitForOption(h, "@model");
    expect(option.getAttribute("aria-selected")).toBe("true");
    act(() => {
      fireEvent.keyDown(h.editor.view.dom, { key: "Enter" });
    });
    // The "@" is gone and the prompt is open with the focus in it.
    expect(h.editor.state.doc.child(0).textContent).toBe("Her voice was like silk. ");
    const input = h.container.querySelector<HTMLTextAreaElement>(".ask-prompt textarea")!;
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Make this a metaphor" } });
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(h.container.querySelector(".ask-prompt")).toBeNull();
    await settle();
    expect(h.onSendComment).toHaveBeenCalledWith({ block_id: A, from: null, to: null, quote: null }, "Make this a metaphor");
    // Typing in the prompt was logged as chat keystrokes.
    expect(h.logger.calls.some((c) => c.kind === "keystroke_batch" && (c.payload as { target: { kind: string } }).target.kind === "chat")).toBe(true);
  });

  it("Escape closes the @model prompt without sending; an @ inside a word opens nothing", async () => {
    const h = mount([block({ id: A, content: "mail", order: 0 })]);
    setCursor(h, 5);
    type(h, "@");
    expect(h.container.querySelector(".slash-menu")).toBeNull();
    type(h, " @");
    await waitForOption(h, "@model");
    act(() => {
      fireEvent.click(h.container.querySelector(".slash-item")!);
    });
    const input = h.container.querySelector<HTMLTextAreaElement>(".ask-prompt textarea")!;
    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(h.container.querySelector(".ask-prompt")).toBeNull();
    await settle();
    expect(h.onSendComment).not.toHaveBeenCalled();
  });

  it("the toolbar is icons named by aria-label and data-tip, with the active block type pressed", () => {
    const h = mount([block({ id: A, type: "numbered_list", content: "1. one" })]);
    setCursor(h, 3);
    const numbered = h.container.querySelector<HTMLButtonElement>('button[aria-label^="Numbered list"]')!;
    expect(numbered.getAttribute("data-tip")).toMatch(/^Numbered list \(/);
    expect(numbered.getAttribute("aria-pressed")).toBe("true");
    expect(numbered.querySelector("svg")).not.toBeNull();
    expect(numbered.textContent).toBe("");
    for (const name of ["Text", "Heading 1", "Bulleted list", "Checklist", "Quote", "Code block", "Divider", "Table", "Bold", "Italic", "Underline", "Inline code"]) {
      expect(h.container.querySelector(`.canvas-toolbar button[aria-label^="${name}"]`), name).not.toBeNull();
    }
  });

  it("right-clicking a table cell opens the table menu, which edits rows and deletes the table", async () => {
    const h = mount([block({ id: A, type: "table", content: "| a | b |\n| --- | --- |\n| 1 | 2 |", order: 0 }), block({ id: B, content: "after", order: 1 })]);
    // Right-click the "1" cell (second row, first column).
    const cell = [...h.container.querySelectorAll("td")].find((td) => td.textContent === "1")!;
    act(() => {
      fireEvent.contextMenu(cell, { clientX: 40, clientY: 40 });
    });
    const menu = h.container.querySelector('[role="menu"][aria-label="Table"]')!;
    expect(menu).not.toBeNull();
    const item = (name: string) => [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === name)!;
    for (const name of ["Insert row above", "Insert row below", "Insert column left", "Insert column right", "Header row", "Delete row", "Delete column", "Delete table"]) {
      expect(item(name), name).toBeTruthy();
    }
    act(() => {
      fireEvent.click(item("Insert row below"));
    });
    expect(h.container.querySelector('[role="menu"]')).toBeNull();
    const table = h.editor.state.doc.child(0);
    expect(table.childCount).toBe(3);
    flushBatch();
    const batch = h.logger.calls.filter((c) => c.kind === "keystroke_batch").at(-1)!.payload as { target: { block_id: string }; content_after: { content: string } };
    expect(batch.target.block_id).toBe(A);
    expect(batch.content_after.content).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |\n|  |  |");
    // Delete the whole table: a structural delete of that block.
    const again = [...h.container.querySelectorAll("td")].find((td) => td.textContent === "2")!;
    act(() => {
      fireEvent.contextMenu(again, { clientX: 40, clientY: 40 });
    });
    act(() => {
      fireEvent.click([...h.container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === "Delete table")!);
    });
    expect(ids(h)).toEqual([B]);
    await settle();
    expect(h.structural.mock.calls.at(-1)![0]).toEqual({ command: "delete", block_id: A });
  });

  it("right-clicking an image offers Delete image, which removes the block", async () => {
    const h = mount([block({ id: A, content: "before", order: 0 }), block({ id: B, type: "image", content: "![cat](asset:ast_1)", order: 1 })]);
    const figure = h.container.querySelector(".blk-image")!;
    act(() => {
      fireEvent.contextMenu(figure, { clientX: 30, clientY: 30 });
    });
    const menu = h.container.querySelector('[role="menu"][aria-label="Image"]')!;
    expect(menu).not.toBeNull();
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((b) => b.textContent)).toEqual(["Delete image"]);
    act(() => {
      fireEvent.click(items[0]!);
    });
    expect(ids(h)).toEqual([A]);
    await settle();
    expect(h.structural.mock.calls.at(-1)![0]).toEqual({ command: "delete", block_id: B });
  });

  it("the table menu does not replace the browser menu outside tables; a resized width is saved", () => {
    const h = mount([block({ id: A, content: "plain", order: 0 }), block({ id: B, type: "table", content: "| a | b |", order: 1 })]);
    const p = h.container.querySelector(`[data-block-id="${A}"]`)!;
    const ev = fireEvent.contextMenu(p);
    expect(ev).toBe(true); // not prevented
    expect(h.container.querySelector('[role="menu"]')).toBeNull();
    // What the column-resize drag does on release: set colwidth on the column's cells.
    act(() => {
      const { state } = h.editor;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.type.name === "tableCell" && node.textContent === "a") tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: [200] });
      });
      h.editor.view.dispatch(tr);
    });
    flushBatch();
    const batch = h.logger.calls.filter((c) => c.kind === "keystroke_batch").at(-1)!.payload as { content_after: { content: string } };
    expect(batch.content_after.content).toBe("| a | b |\n<!-- colwidths: 200 0 -->");
  });

  it("read-only mode renders no toolbar, no buttons and never posts", () => {
    const h = mount([block({ id: A, content: "x", status: "proposed" })], { readOnly: true });
    expect(h.container.querySelector(".canvas-toolbar")).toBeNull();
    // The facilitator still sees which blocks are suggestions.
    expect(h.container.querySelector(`[data-block-id="${A}"]`)?.classList.contains("st-proposed")).toBe(true);
    expect(h.editor.isEditable).toBe(false);
  });
});
