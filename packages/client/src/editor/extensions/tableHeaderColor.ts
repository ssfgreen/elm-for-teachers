/**
 * A table's header row colour: one of the text colours as a light fill, or none (the usual grey).
 * Kept as the table's `headerColor` attribute and saved as a `<!-- header: blue -->` line
 * (markdown.ts). The table's node view does not draw node attributes, so a decoration puts
 * `data-header-color` on its wrapper and table.css colours the header cells.
 */
import { Extension, findParentNode } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { TEXT_COLORS, type TextColor } from "../textColors.js";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableHeaderColor: {
      /** Colour the header row of the table the cursor is in (null for the usual grey); turns the header row on if it is off. */
      setTableHeaderColor: (color: TextColor | null) => ReturnType;
    };
  }
}

export const isHeaderColor = (c: unknown): c is TextColor => typeof c === "string" && (TEXT_COLORS as readonly string[]).includes(c);

/** Whether the table's first row is all header cells. */
export const hasHeaderRow = (table: Node) => {
  const row = table.firstChild;
  if (!row || row.childCount === 0) return false;
  let all = true;
  row.forEach((c) => {
    if (c.type.name !== "tableHeader") all = false;
  });
  return all;
};

const findTable = findParentNode((n) => n.type.name === "table");

export const TableHeaderColor = Extension.create({
  name: "edwTableHeaderColor",

  addGlobalAttributes() {
    return [{ types: ["table"], attributes: { headerColor: { default: null, rendered: false } } }];
  },

  addCommands() {
    return {
      setTableHeaderColor:
        (color) =>
        ({ state, tr, dispatch, chain }) => {
          const found = findTable(state.selection);
          if (!found) return false;
          if (!dispatch) return true;
          tr.setNodeAttribute(found.pos, "headerColor", color);
          if (color && !hasHeaderRow(found.node)) return chain().toggleHeaderRow().run();
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("edw-table-header-color"),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.forEach((node, pos) => {
              const c = node.attrs.headerColor as unknown;
              if (node.type.name === "table" && isHeaderColor(c)) decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-header-color": c }));
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
