/**
 * The grey hint on an empty line. Exactly one at a time: on the only line of an empty doc,
 * otherwise on the empty line holding the cursor. (Tiptap's Placeholder marks every empty
 * line of a doc that holds nothing but empty lines, so Enter twice showed three hints.)
 */
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const PARAGRAPH_HINT = "Write here, or type / for options";

const isEmptyLine = (n: Node) => (n.type.name === "paragraph" || n.type.name === "heading") && n.content.size === 0;
const hintFor = (n: Node) => (n.type.name === "heading" ? `Heading ${n.attrs.level as number}` : PARAGRAPH_HINT);

/** The top-level position and node that should show the hint, if any. */
export function placeholderTarget(state: EditorState): { pos: number; node: Node } | null {
  const { doc, selection } = state;
  if (doc.childCount === 1 && isEmptyLine(doc.firstChild!)) return { pos: 0, node: doc.firstChild! };
  const $from = selection.$from;
  if (!selection.empty || $from.depth < 1) return null;
  const node = $from.node(1);
  return isEmptyLine(node) ? { pos: $from.before(1), node } : null;
}

export const EdwPlaceholder = Extension.create<{ readOnly: () => boolean }>({
  name: "edwPlaceholder",
  addOptions() {
    return { readOnly: () => false };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      new Plugin({
        key: new PluginKey("edw-placeholder"),
        props: {
          decorations(state) {
            if (opts.readOnly()) return null;
            const t = placeholderTarget(state);
            if (!t) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(t.pos, t.pos + t.node.nodeSize, { class: "has-placeholder", "data-placeholder": hintFor(t.node) }),
            ]);
          },
        },
      }),
    ];
  },
});
