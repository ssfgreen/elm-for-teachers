import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { newUlid } from "@edw/shared";
import { buildExtensions } from "./extensions/index.js";
import { docFromBlocks } from "./markdown.js";
import { block } from "./markdown.test.js";
import { reconcileDoc } from "./reconcile.js";
import { snapshotDoc } from "./sync.js";
import { installEditorPolyfills } from "../test-utils.js";

let editor: Editor | null = null;
beforeAll(() => installEditorPolyfills());
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";
const contents = (e: Editor) => snapshotDoc(e.state.doc).map((b) => b.content.content);

describe("reconcileDoc", () => {
  it("does not drop a block the editor made that the server has not answered for yet, nor move the cursor out of it", () => {
    const red = block({ id: newUlid(), order: 0, type: "paragraph", content: "red" });
    const green = block({ id: newUlid(), order: 1, type: "paragraph", content: "green" });
    const e = (editor = new Editor({ extensions: buildExtensions() }));
    e.view.dispatch(e.state.tr.replaceWith(0, e.state.doc.content.size, docFromBlocks(e.schema, [red, green], DOC).content));
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    // The server has the first block only: its answer to the second is still to come.
    const done = reconcileDoc(e, { blocks: [{ ...red, content: "r" }], docId: DOC, dirty: new Set(), takenOver: new Set(), made: new Set([green.id]) });
    expect(done).toBe(false);
    expect(contents(e)).toEqual(["red", "green"]);
    expect(e.state.selection.$from.parent.textContent).toBe("green");
    // Once it has both, the editor keeps its own text.
    expect(reconcileDoc(e, { blocks: [red, { ...green, content: "" }], docId: DOC, dirty: new Set(), takenOver: new Set(), made: new Set([green.id]) })).toBe(true);
    expect(contents(e)).toEqual(["red", "green"]);
  });

  it("still removes a block the server knows and no longer shows", () => {
    const red = block({ id: newUlid(), order: 0, type: "paragraph", content: "red" });
    const offer = block({ id: newUlid(), order: 1, type: "paragraph", content: "offer", status: "proposed" });
    const e = (editor = new Editor({ extensions: buildExtensions() }));
    e.view.dispatch(e.state.tr.replaceWith(0, e.state.doc.content.size, docFromBlocks(e.schema, [red, offer], DOC).content));
    expect(reconcileDoc(e, { blocks: [red, { ...offer, status: "rejected" }], docId: DOC, dirty: new Set(), takenOver: new Set(), made: new Set() })).toBe(true);
    expect(contents(e)).toEqual(["red"]);
  });

  it("removes a block the server's list no longer has (deleted there) when the editor did not just make it", () => {
    const red = block({ id: newUlid(), order: 0, type: "paragraph", content: "red" });
    const gone = block({ id: newUlid(), order: 1, type: "paragraph", content: "gone", status: "live", pending: { op: "delete", turn_id: "t1" } });
    const e = (editor = new Editor({ extensions: buildExtensions() }));
    e.view.dispatch(e.state.tr.replaceWith(0, e.state.doc.content.size, docFromBlocks(e.schema, [red, gone], DOC).content));
    expect(reconcileDoc(e, { blocks: [red], docId: DOC, dirty: new Set(), takenOver: new Set(), made: new Set() })).toBe(true);
    expect(contents(e)).toEqual(["red"]);
  });
});
