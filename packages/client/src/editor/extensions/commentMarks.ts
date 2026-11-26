/**
 * Comment highlights as decorations (the doc itself is untouched): a thread's quoted text is
 * underlined in its block, or the whole block is marked when the thread has no quote or the
 * quote is no longer there. Clicking a highlight selects its thread. The screen sets the
 * threads with `setCommentMarks`.
 */
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface CommentMark {
  id: string;
  block_id: string;
  quote: string | null;
}

interface MarksState {
  marks: CommentMark[];
  active: string | null;
}

export const commentMarksKey = new PluginKey<MarksState>("edw-comment-marks");

/** A transaction that shows these threads (and which one is selected). */
export function setCommentMarks(tr: Transaction, marks: CommentMark[], active: string | null): Transaction {
  return tr.setMeta(commentMarksKey, { marks, active } satisfies MarksState).setMeta("addToHistory", false);
}

/** Where `quote` sits inside a top-level node at `offset`: document positions, or null. */
function findQuote(node: Node, offset: number, raw: string): { from: number; to: number } | null {
  // Line breaks are not text here, and a long quote was cut short with "…".
  const quote = raw.replace(/\n/g, "").replace(/…$/, "");
  const chars: number[] = [];
  let text = "";
  node.descendants((child, pos) => {
    if (!child.isText || !child.text) return;
    for (let i = 0; i < child.text.length; i++) chars.push(offset + 1 + pos + i);
    text += child.text;
  });
  const at = text.indexOf(quote);
  if (at < 0 || !quote) return null;
  return { from: chars[at]!, to: chars[at + quote.length - 1]! + 1 };
}

function build(state: EditorState): DecorationSet {
  const { marks, active } = commentMarksKey.getState(state) ?? { marks: [], active: null };
  if (marks.length === 0) return DecorationSet.empty;
  const decos: Decoration[] = [];
  state.doc.forEach((node, offset) => {
    const id = node.attrs.id as string | null;
    for (const m of marks.filter((x) => x.block_id === id)) {
      const cls = `comment-mark${m.id === active ? " active" : ""}`;
      const span = m.quote ? findQuote(node, offset, m.quote) : null;
      if (span) decos.push(Decoration.inline(span.from, span.to, { class: cls, "data-comment-id": m.id }, { commentId: m.id }));
      else decos.push(Decoration.node(offset, offset + node.nodeSize, { class: `comment-block${m.id === active ? " active" : ""}`, "data-comment-id": m.id }, { commentId: m.id }));
    }
  });
  return DecorationSet.create(state.doc, decos);
}

export interface CommentMarksOptions {
  /** A highlight was clicked: the thread to select. */
  onSelect: (id: string) => void;
}

export const CommentMarks = Extension.create<CommentMarksOptions>({
  name: "edwCommentMarks",

  addOptions() {
    return { onSelect: () => undefined };
  },

  addProseMirrorPlugins() {
    const onSelect = () => this.options.onSelect;
    return [
      new Plugin<MarksState>({
        key: commentMarksKey,
        state: {
          init: () => ({ marks: [], active: null }),
          apply: (tr, value) => (tr.getMeta(commentMarksKey) as MarksState | undefined) ?? value,
        },
        props: {
          decorations: build,
          handleClick(view, pos) {
            // An underlined quote wins over a whole-block mark on the same spot.
            const found = build(view.state).find(pos, pos).sort((a, b) => b.from - a.from);
            const id = (found[0]?.spec as { commentId?: string } | undefined)?.commentId;
            if (id) onSelect()(id);
            return false;
          },
        },
      }),
    ];
  },
});
