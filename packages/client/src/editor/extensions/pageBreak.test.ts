import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { buildExtensions } from "./index.js";
import { installEditorPolyfills } from "../../test-utils.js";

let editor: Editor | null = null;
beforeAll(() => installEditorPolyfills());
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const make = (html: string) => (editor = new Editor({ extensions: buildExtensions(), content: html }));
const names = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.forEach((n) => out.push(n.type.name === "paragraph" ? `p:${n.textContent}` : n.type.name));
  return out;
};
/** Puts the cursor in the top-level block at `index`, `offset` characters in. */
function cursorIn(e: Editor, index: number, offset: number) {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += e.state.doc.child(i).nodeSize;
  // Inside a list the text starts deeper: find the first text position at or after the block's start.
  let start = pos + 1;
  e.state.doc.nodesBetween(pos, pos + e.state.doc.child(index).nodeSize, (n, p) => {
    if (n.isTextblock && start === pos + 1) start = p + 1;
  });
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, start + offset)));
}

describe("page break", () => {
  it("goes after the block the cursor is in, with the cursor in the block after it", () => {
    const e = make("<p>One</p><p>Two</p>");
    cursorIn(e, 0, 1);
    e.commands.setPageBreak();
    expect(names(e)).toEqual(["p:One", "pageBreak", "p:Two"]);
    expect(e.state.selection.$from.parent.textContent).toBe("Two");
  });

  it("adds a paragraph to write in when it is the last block", () => {
    const e = make("<p>One</p>");
    cursorIn(e, 0, 3);
    e.commands.setPageBreak();
    expect(names(e)).toEqual(["p:One", "pageBreak", "p:"]);
  });

  it("goes before a block when the cursor is at its start", () => {
    const e = make("<p>One</p><h2>Answers</h2>");
    cursorIn(e, 1, 0);
    e.commands.setPageBreak();
    expect(names(e)).toEqual(["p:One", "pageBreak", "heading"]);
    expect(e.state.selection.$from.parent.textContent).toBe("Answers");
  });

  it("never goes inside a list: it follows the whole list", () => {
    const e = make("<ul><li><p>a</p></li><li><p>b</p></li></ul><p>after</p>");
    cursorIn(e, 0, 1);
    e.commands.setPageBreak();
    expect(names(e)).toEqual(["bulletList", "pageBreak", "p:after"]);
  });

  it("reads page breaks pasted from Word and Google Docs, and leaves ordinary rules as dividers", () => {
    const e = make('<p>a</p><br clear="all" style="page-break-before:always"><p>b</p><hr style="page-break-before:always;display:none;"><p>c</p><hr><div data-page-break></div>');
    expect(names(e)).toEqual(["p:a", "pageBreak", "p:b", "pageBreak", "p:c", "horizontalRule", "pageBreak"]);
  });
});
