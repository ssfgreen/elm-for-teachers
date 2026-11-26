/**
 * Per-block chrome as decorations, so Tiptap's own nodes stay untouched: a node decoration on
 * every top-level node with `data-block-id` and status classes (what the trackers and CSS key
 * on: `st-proposed` for a new block from the assistant, `pending-replace`, `pending-delete` and
 * `pending-move` for a suggested change). List items also get the number they show (`data-n`, a run
 * counts on from its first item) and `list-end` on the last item of a run. How suggestions look is in trackChanges.ts and
 * suggestions.css; they are decided on their cards in the comments column.
 */
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { itemNumbers } from "@edw/shared";
import { TYPE_FOR_NODE } from "../blockTypes.js";
import { isItemNode } from "./listItems.js";

type PendingAttr = { op: "replace" | "delete" | "move" } | null;

export const blockChromeKey = new PluginKey("edw-block-chrome");

export const BlockChrome = Extension.create({
  name: "edwBlockChrome",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockChromeKey,
        props: {
          decorations(state) {
            return buildDecorations(state.doc);
          },
        },
      }),
    ];
  },
});

function buildDecorations(doc: Node): DecorationSet {
  const decos: Decoration[] = [];
  const nodes: Node[] = [];
  doc.forEach((node) => nodes.push(node));
  const numbers = itemNumbers(nodes.map((n) => ({ type: TYPE_FOR_NODE[n.type.name] ?? "", content: `${Number(n.attrs.number) || 1}. ` })));
  doc.forEach((node, pos, i) => {
    const id = (node.attrs.id as string | null) ?? "";
    const status = (node.attrs.status as string) ?? "live";
    const pending = node.attrs.pending as PendingAttr;
    const classes = ["blk", `blk-${node.type.name}`, `st-${status}`];
    if (pending) classes.push(`pending-${pending.op}`);
    const attrs: Record<string, string> = { class: "", "data-block-id": id };
    if (isItemNode(node)) {
      if (nodes[i + 1]?.type !== node.type) classes.push("list-end");
      if (numbers[i] !== null) attrs["data-n"] = String(numbers[i]);
    }
    attrs.class = classes.join(" ");
    decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
  });
  return DecorationSet.create(doc, decos);
}
