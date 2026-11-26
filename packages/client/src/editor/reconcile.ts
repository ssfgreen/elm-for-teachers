/**
 * Blocks coming back from the server reconciled into the editor (Canvas.tsx), without
 * clobbering unflushed typing: the editor owns the text of ordinary blocks, and only a
 * suggestion arriving or being decided changes a block from outside. The cursor stays in its
 * block. While the editor holds a block it made that the server's list does not have yet (its
 * insert or split not answered, or the screen not yet updated with the answer), it waits:
 * rebuilding from that list would drop the block and what was typed in it. (A block the list
 * leaves out otherwise was deleted there, and goes.)
 */
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { PublicBlock } from "./types.js";
import { META_EXTERNAL } from "./blockTypes.js";
import { blockAttrsOf, blockTypeOf, displayContent, docFromBlocks, nodeToContent, visibleBlocksOf } from "./markdown.js";

export const isPlain = (n: Node) => (n.attrs.status ?? "live") === "live" && !n.attrs.pending;

export function topNodesById(doc: Node): Map<string, Node> {
  const m = new Map<string, Node>();
  doc.forEach((n) => {
    if (n.attrs.id) m.set(n.attrs.id as string, n);
  });
  return m;
}

export interface ReconcileInput {
  blocks: PublicBlock[];
  docId: string;
  /** Blocks with typing not yet sent. */
  dirty: ReadonlySet<string>;
  /** Suggestions the teacher typed into: theirs now. */
  takenOver: Set<string>;
  /** Blocks this editor sent an insert or split for; each leaves once the list has it. */
  made: Set<string>;
}

/**
 * Make the editor show the server's blocks, keeping what it owns. Plain blocks leave `takenOver`.
 * False when it waited for a list that has every block the editor made: try again on the next.
 */
export function reconcileDoc(ed: Editor, { blocks, docId, dirty, takenOver, made }: ReconcileInput): boolean {
  if (ed.isDestroyed) return true;
  const nodes = topNodesById(ed.state.doc);
  const known = new Set(blocks.map((b) => b.id));
  for (const id of made) if (known.has(id) || !nodes.has(id)) made.delete(id);
  if (made.size) return false;
  const override = new Map<string, Node>();
  for (const id of dirty) {
    const n = nodes.get(id);
    if (n) override.set(id, n);
  }
  // A node that already serialises to the stored block is kept as it is: re-parsing
  // can be lossy (a table cell trims its spaces), and replacing it would move the cursor.
  for (const b of visibleBlocksOf(blocks, docId)) {
    const n = nodes.get(b.id);
    const plain = b.status === "live" && !b.pending;
    if (plain) takenOver.delete(b.id);
    if (!n || override.has(b.id)) continue;
    // The editor owns the text of ordinary blocks: the server's answers to its own commands
    // can carry text from before the teacher's latest typing. Only a suggestion arriving or
    // being decided changes a block from outside.
    if (isPlain(n) && (plain || takenOver.has(b.id))) {
      override.set(b.id, n);
      continue;
    }
    const c = nodeToContent(n);
    const want = displayContent(b);
    if (
      blockTypeOf(n) === b.type &&
      c.content === want.content &&
      n.attrs.status === b.status &&
      JSON.stringify(n.attrs.pending ?? null) === JSON.stringify(b.pending ?? null) &&
      (n.attrs.original ?? null) === blockAttrsOf(b).original
    ) {
      override.set(b.id, n);
    }
  }
  const desired = docFromBlocks(ed.schema, blocks, docId, override);
  if (desired.eq(ed.state.doc)) return true;
  const { state } = ed;
  const sel = state.selection;
  const selBlockId = sel.$from.depth >= 1 ? (sel.$from.node(1).attrs.id as string | null) : null;
  const selOffset = sel.$from.depth >= 1 ? sel.$from.pos - sel.$from.before(1) : 0;
  const tr = state.tr.replaceWith(0, state.doc.content.size, desired.content).setMeta(META_EXTERNAL, true).setMeta("addToHistory", false);
  if (selBlockId) {
    let found = -1;
    tr.doc.forEach((n, offset) => {
      if (found === -1 && n.attrs.id === selBlockId) found = offset;
    });
    if (found !== -1) {
      const node = tr.doc.nodeAt(found)!;
      if (node.isAtom) tr.setSelection(NodeSelection.create(tr.doc, found));
      else {
        const target = Math.min(found + selOffset, found + node.nodeSize - 1);
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(target, found + 1))));
      }
    }
  }
  ed.view.dispatch(tr);
  return true;
}
