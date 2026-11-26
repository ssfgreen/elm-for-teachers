import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { buildExtensions } from "./index.js";
import { nodeToContent } from "../markdown.js";
import { installEditorPolyfills } from "../../test-utils.js";

let editor: Editor | null = null;
beforeAll(() => installEditorPolyfills());
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const HEADED = "<table><tr><th><p>Word</p></th><th><p>Type</p></th></tr><tr><td><p>silk</p></td><td><p>simile</p></td></tr></table>";
const PLAIN = "<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>";

function inTable(html: string) {
  const e = (editor = new Editor({ extensions: buildExtensions(), content: `<p>before</p>${html}` }));
  let pos = 0;
  e.state.doc.descendants((n, p) => {
    if (!pos && n.isText && n.text === (html === HEADED ? "silk" : "1")) pos = p + 1;
  });
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos)));
  return e;
}
const table = (e: Editor) => e.state.doc.child(1);

describe("table header colour", () => {
  it("colours the header row of the table the cursor is in, and is saved with it", () => {
    const e = inTable(HEADED);
    expect(e.commands.setTableHeaderColor("green")).toBe(true);
    expect(table(e).attrs.headerColor).toBe("green");
    expect(nodeToContent(table(e)).content).toBe("| Word | Type |\n| --- | --- |\n| silk | simile |\n<!-- header: green -->");
    // Shown by a decoration on the table's wrapper.
    expect(e.view.dom.querySelector('.tableWrapper[data-header-color="green"]')).not.toBeNull();
    e.commands.setTableHeaderColor(null);
    expect(table(e).attrs.headerColor).toBeNull();
    expect(e.view.dom.querySelector("[data-header-color]")).toBeNull();
  });

  it("turns the header row on for a table without one", () => {
    const e = inTable(PLAIN);
    e.commands.setTableHeaderColor("purple");
    expect(table(e).child(0).child(0).type.name).toBe("tableHeader");
    expect(nodeToContent(table(e)).content).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |\n<!-- header: purple -->");
  });

  it("does nothing outside a table", () => {
    const e = inTable(HEADED);
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 2)));
    expect(e.can().setTableHeaderColor("red")).toBe(false);
    expect(e.commands.setTableHeaderColor("red")).toBe(false);
  });
});
