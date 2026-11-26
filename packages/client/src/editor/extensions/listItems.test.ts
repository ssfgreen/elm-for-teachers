import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import { DOMParser, Fragment, Slice } from "@tiptap/pm/model";
import { newUlid } from "@edw/shared";
import { buildExtensions } from "./index.js";
import { blockChromeKey } from "./blockChrome.js";
import { pastedAsItems } from "./listItems.js";
import { blockToNode, docFromBlocks, nodeToContent } from "../markdown.js";
import { block } from "../markdown.test.js";
import { snapshotDoc, diffBlocks } from "../sync.js";
import { installEditorPolyfills } from "../../test-utils.js";

let editor: Editor | null = null;
beforeAll(() => installEditorPolyfills());
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";
const htmlDoc = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};
/** An editor over these blocks, each given an id, in order. */
function make(blocks: Array<{ type: string; content: string }>) {
  const e = new Editor({ extensions: buildExtensions() });
  const bs = blocks.map((b, i) => block({ id: newUlid(), order: i, type: b.type as never, content: b.content }));
  e.view.dispatch(e.state.tr.replaceWith(0, e.state.doc.content.size, docFromBlocks(e.schema, bs, DOC).content));
  return (editor = e);
}
const contents = (e: Editor) => snapshotDoc(e.state.doc).map((b) => `${b.type}|${b.content.content}`);
/** Cursor in top-level block `index`, `offset` characters into its text. */
function cursorIn(e: Editor, index: number, offset: number) {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += e.state.doc.child(i).nodeSize;
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos + 1 + offset)));
}
const press = (e: Editor, key: string) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  let handled = false;
  e.view.someProp("handleKeyDown", (f) => (handled = f(e.view, ev) || handled));
  return handled;
};
/** Type text as if from the keyboard, so input rules run. */
function type(e: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = e.state.selection;
    const done = e.view.someProp("handleTextInput", (f) => f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)));
    if (!done) e.view.dispatch(e.state.tr.insertText(ch, from, to));
  }
}

describe("list item blocks", () => {
  it("round-trip through markdown with their number, tick and line breaks", () => {
    const schema = new Editor({ extensions: buildExtensions() }).schema;
    const rt = (type: string, content: string) => nodeToContent(blockToNode(schema, block({ id: newUlid(), type: type as never, content }))).content;
    expect(rt("numbered_item", "3. Sentence\n   ____")).toBe("3. Sentence\n   ____");
    expect(rt("bullet_item", "- **one**")).toBe("- **one**");
    expect(rt("checklist_item", "- [x] done")).toBe("- [x] done");
    expect(rt("checklist_item", "- [ ] ")).toBe("- [ ] ");
  });

  it("Enter makes the next item, numbered on; Enter on an empty item ends the list", () => {
    const e = make([{ type: "numbered_item", content: "3. one" }]);
    cursorIn(e, 0, 3);
    expect(press(e, "Enter")).toBe(true);
    type(e, "two");
    expect(contents(e)).toEqual(["numbered_item|3. one", "numbered_item|4. two"]);
    press(e, "Enter");
    press(e, "Enter");
    expect(contents(e)).toEqual(["numbered_item|3. one", "numbered_item|4. two", "paragraph|"]);
    // Each item is its own block with its own id.
    expect(new Set(snapshotDoc(e.state.doc).map((b) => b.id)).size).toBe(3);
  });

  it("Enter splitting an item reads as a split on the server", () => {
    const e = make([{ type: "bullet_item", content: "- onetwo" }]);
    const before = snapshotDoc(e.state.doc);
    cursorIn(e, 0, 3);
    press(e, "Enter");
    const d = diffBlocks(before, snapshotDoc(e.state.doc), DOC);
    expect(d.commands).toEqual([expect.objectContaining({ command: "split", first: { content: "- one" }, second: { content: "- two" }, second_type: "bullet_item" })]);
  });

  it("Backspace at the start of an item makes it a paragraph, keeping its id and text", () => {
    const e = make([{ type: "paragraph", content: "Intro" }, { type: "checklist_item", content: "- [ ] tick" }]);
    const id = snapshotDoc(e.state.doc)[1]!.id;
    cursorIn(e, 1, 0);
    expect(press(e, "Backspace")).toBe(true);
    expect(snapshotDoc(e.state.doc)[1]).toMatchObject({ id, type: "paragraph", content: { content: "tick" } });
  });

  it("typing a marker at the start of a line starts a list", () => {
    for (const [marker, want] of [["- ", "bullet_item|- x"], ["* ", "bullet_item|- x"], ["4. ", "numbered_item|4. x"], ["[] ", "checklist_item|- [ ] x"], ["[x] ", "checklist_item|- [x] x"]] as const) {
      const e = make([{ type: "paragraph", content: "" }]);
      cursorIn(e, 0, 0);
      type(e, `${marker}x`);
      expect(contents(e)).toEqual([want]);
      e.destroy();
    }
    editor = null;
  });

  it("the toolbar's list command sets every block in the selection, and toggles back", () => {
    const e = make([{ type: "paragraph", content: "a" }, { type: "heading", content: "## b" }, { type: "paragraph", content: "c" }]);
    const ids = snapshotDoc(e.state.doc).map((b) => b.id);
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 2, e.state.doc.content.size - 1)));
    e.commands.toggleListItems("numbered_item");
    expect(contents(e)).toEqual(["numbered_item|1. a", "numbered_item|1. b", "numbered_item|1. c"]);
    expect(snapshotDoc(e.state.doc).map((b) => b.id)).toEqual(ids);
    e.commands.toggleListItems("numbered_item");
    expect(contents(e)).toEqual(["paragraph|a", "paragraph|b", "paragraph|c"]);
  });

  it("turns an older whole-list block into items when its type is changed", () => {
    const e = make([{ type: "bullet_list", content: "- one\n- two" }]);
    const id = snapshotDoc(e.state.doc)[0]!.id;
    cursorIn(e, 0, 2);
    e.commands.toggleListItems("checklist_item");
    expect(contents(e)).toEqual(["checklist_item|- [ ] one", "checklist_item|- [ ] two"]);
    expect(snapshotDoc(e.state.doc)[0]!.id).toBe(id);
  });

  it("numbers a run from its first item, across the run only", () => {
    const e = make([
      { type: "numbered_item", content: "3. a" },
      { type: "numbered_item", content: "1. b" },
      { type: "paragraph", content: "x" },
      { type: "numbered_item", content: "1. c" },
    ]);
    const plugin = blockChromeKey.get(e.state)!;
    const decos = plugin.props.decorations!.call(plugin, e.state) as DecorationSet;
    const shown = decos.find().map((d) => {
      const attrs = (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs;
      return [attrs["data-n"], attrs.class!.includes("list-end")];
    });
    expect(shown).toEqual([["3", false], ["4", true], [undefined, false], ["1", true]]);
  });

  it("a pasted list comes in as items, a nested one flattened after its item", () => {
    const e = make([{ type: "paragraph", content: "Intro" }]);
    const html = '<ol start="2"><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ol>';
    const parsed = new Slice(Fragment.from(DOMParser.fromSchema(e.schema).parse(htmlDoc(html)).content), 0, 0);
    // The editor runs it on every paste.
    let viaEditor: Slice | null = null;
    e.view.someProp("transformPasted", (f) => {
      viaEditor = f(viaEditor ?? parsed, e.view, false);
    });
    expect(viaEditor!.content.firstChild!.type.name).toBe("numberedItem");
    const s = pastedAsItems(parsed);
    const out: string[] = [];
    s.content.forEach((n) => out.push(`${n.type.name}|${n.textContent}|${n.attrs.number ?? ""}`));
    expect(out).toEqual(["numberedItem|a|2", "numberedItem|b|3", "bulletItem|c|"]);
  });
});
