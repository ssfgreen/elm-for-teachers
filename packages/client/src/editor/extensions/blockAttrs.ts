/**
 * Every top-level node is a server block, so every top-level node carries the
 * block's `id`, `status`, `pending` and `original`. None of these are
 * rendered to the DOM here; blockChrome.ts puts `data-block-id` on through a
 * decoration so nested nodes (a paragraph inside a list item) never look like blocks.
 *
 * The plugin names blocks and keeps the attributes honest after each edit:
 *  - a top-level node without an id, or sharing an id with an earlier node (Enter
 *    splits a block and copies its attrs), gets a new ULID; the first occurrence
 *    keeps the old id, matching the server's split semantics;
 *  - a new node that replaced a vanished one (toggling a paragraph into a list
 *    wraps it in a new bulletList) adopts the vanished node's id, so
 *    the sync layer sees a retype instead of a delete plus an insert;
 *  - typing into one of the assistant's suggestions keeps it waiting, as in Word: a new block
 *    stays a suggestion, a suggested move stays, and a suggested edit to the text carries the
 *    teacher's edit over to the block's own text (`original`, see suggest/merge.ts). Typing into
 *    a block suggested for deletion, or an edit that cannot be carried over, clears the
 *    suggestion as before (edit-then-accept); the server does the same when the batch arrives.
 */
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { newUlid } from "@edw/shared";
import { META_EXTERNAL, TOP_NODE_NAMES, TYPE_FOR_NODE } from "../blockTypes.js";
import { nodeToContent } from "../markdown.js";
import { carryEdit } from "../suggest/merge.js";
import { nodeOf } from "../suggest/text.js";

export const blockIdsKey = new PluginKey("edw-block-ids");

export const BlockAttrs = Extension.create({
  name: "edwBlockAttrs",

  addGlobalAttributes() {
    return [
      {
        types: [...TOP_NODE_NAMES],
        attributes: {
          id: { default: null, rendered: false, keepOnSplit: true },
          status: { default: "live", rendered: false, keepOnSplit: false },
          pending: { default: null, rendered: false, keepOnSplit: false },
          original: { default: null, rendered: false, keepOnSplit: false },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockIdsKey,
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((t) => t.docChanged)) return null;
          if (trs.some((t) => t.getMeta(META_EXTERNAL))) return null;
          return normaliseBlocks(oldState.doc, newState);
        },
      }),
    ];
  },
});

const CLEARED = { status: "live", pending: null, original: null } as const;

function normaliseBlocks(oldDoc: Node, newState: EditorState): Transaction | null {
  const oldById = new Map<string, Node>();
  oldDoc.forEach((n) => {
    const id = n.attrs.id as string | null;
    if (id) oldById.set(id, n);
  });
  const newIds = new Set<string>();
  newState.doc.forEach((n) => {
    const id = n.attrs.id as string | null;
    if (id) newIds.add(id);
  });
  const vanished = [...oldById.keys()].filter((id) => !newIds.has(id));

  const tr = newState.tr;
  let changed = false;
  const seen = new Set<string>();
  newState.doc.forEach((node, pos) => {
    const attrs = node.attrs;
    const id = attrs.id as string | null;
    let patch: Record<string, unknown> | null = null;
    if (!id || seen.has(id)) {
      const adopt = !id && vanished.length ? oldById.get(vanished.shift()!) : undefined;
      patch = adopt ? { id: adopt.attrs.id, ...CLEARED } : { id: newUlid(), ...CLEARED };
    } else {
      const old = oldById.get(id);
      if (old && (attrs.status !== "live" || attrs.pending) && !old.eq(node)) patch = afterEdit(old, node);
    }
    seen.add((patch?.id as string | undefined) ?? id!);
    if (patch) {
      tr.setNodeMarkup(pos, undefined, { ...attrs, ...patch });
      changed = true;
    }
  });
  return changed ? tr : null;
}

/** A suggestion's attrs after the teacher edited its block: kept (null: no change), carried over, or cleared. */
function afterEdit(old: Node, node: Node): Record<string, unknown> | null {
  const pending = node.attrs.pending as { op: string } | null;
  if (node.attrs.status === "proposed" || pending?.op === "move") return null;
  const original = node.attrs.original as string | null;
  const type = TYPE_FOR_NODE[node.type.name];
  if (pending?.op !== "replace" || original === null || !type) return { ...CLEARED };
  const live = carryEdit(nodeOf(node.type.schema, type, original), old, node);
  if (!live) return { ...CLEARED };
  return { original: nodeToContent(live).content, pending: { ...pending, content: nodeToContent(node).content } };
}
