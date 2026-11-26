/**
 * A block per list item (PLAN.md section 6): `bulletItem`, `numberedItem` and `checklistItem`
 * are top-level text blocks, one server block each, so ids, suggestions, comments, drag and
 * logging work for an item as for a paragraph. A run of them is drawn as one list: the bullet
 * or number is CSS, and the number each item shows comes from blockChrome.ts (`data-n`).
 *
 *  - Enter makes the next item (an empty item becomes a paragraph, ending the list);
 *  - Backspace at the start of an item makes it a paragraph, as in Word and Google Docs;
 *  - `- `, `* `, `1. ` and `[] ` at the start of a line start a list;
 *  - the toolbar, slash menu and shortcuts set the type of every block in the selection
 *    (`toggleListItems`); a selection that is all of that type goes back to paragraphs;
 *  - a pasted list (from Word, Google Docs or a web page) comes in as items.
 *
 * The old whole-list nodes (bulletList, orderedList, taskList) stay in the schema so older
 * blocks still show; this file never makes them, and turns one into items when the teacher
 * changes its type.
 */
import { Extension, InputRule, Node as TiptapNode, mergeAttributes, type CommandProps } from "@tiptap/core";
import { Fragment, Slice, type Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isOldList, type ListItemType } from "@edw/shared";
import { NODE_FOR_TYPE, TYPE_FOR_NODE } from "../blockTypes.js";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    listItems: {
      /** Every block in the selection becomes an item of this type, or, if all already are, a paragraph. */
      toggleListItems: (type: ListItemType) => ReturnType;
    };
  }
}

export const ITEM_NODE_NAMES = ["bulletItem", "numberedItem", "checklistItem"] as const;
export const isItemNode = (n: Node | null | undefined) => !!n && (ITEM_NODE_NAMES as readonly string[]).includes(n.type.name);

/** The block attributes (blockAttrs.ts) carried over when a block changes type. */
const blockAttrs = (n: Node) => ({ id: n.attrs.id, status: n.attrs.status, pending: n.attrs.pending, original: n.attrs.original });

const itemNode = (name: string, list: string) =>
  TiptapNode.create({
    name,
    group: "block",
    content: "inline*",
    defining: true,
    parseHTML() {
      return [{ tag: `div[data-list="${list}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-list": list, class: "list-blk" }), 0];
    },
  });

export const BulletItem = itemNode("bulletItem", "bullet");

export const NumberedItem = itemNode("numberedItem", "numbered").extend({
  addAttributes() {
    // The item's own number: what a run starts at when this item comes first.
    return { number: { default: 1, rendered: false, keepOnSplit: false } };
  },
});

export const ChecklistItem = itemNode("checklistItem", "check").extend({
  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute("data-checked") === "true",
        renderHTML: (a) => ({ "data-checked": a.checked ? "true" : "false" }),
      },
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      dom.className = "list-blk";
      dom.dataset.list = "check";
      const box = document.createElement("label");
      box.contentEditable = "false";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("aria-label", "Tick");
      box.append(input);
      const content = document.createElement("div");
      dom.append(box, content);
      const show = (n: Node) => {
        input.checked = !!n.attrs.checked;
        dom.dataset.checked = n.attrs.checked ? "true" : "false";
      };
      show(node);
      input.addEventListener("mousedown", (e) => e.preventDefault());
      input.addEventListener("change", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (!editor.isEditable || pos === undefined) {
          input.checked = !input.checked;
          return;
        }
        const current = editor.state.doc.nodeAt(pos);
        if (current) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, checked: input.checked }));
      });
      return {
        dom,
        contentDOM: content,
        update: (n) => {
          if (n.type.name !== "checklistItem") return false;
          show(n);
          return true;
        },
        ignoreMutation: (m) => m.type === "attributes" || box.contains(m.target),
      };
    };
  },
});

/** Attributes a new item of `type` starts with. */
const freshAttrs = (type: ListItemType, number = 1) => (type === "numbered_item" ? { number } : type === "checklist_item" ? { checked: false } : {});

/** The top-level blocks the selection touches, with their positions. */
function selectedBlocks(state: EditorState): Array<{ node: Node; pos: number }> {
  const { from, to } = state.selection;
  const out: Array<{ node: Node; pos: number }> = [];
  state.doc.forEach((node, pos) => {
    const end = pos + node.nodeSize;
    if (end > from && pos < to) out.push({ node, pos });
    else if (from === to && pos <= from && from <= end) out.push({ node, pos });
  });
  return out;
}

const OLD_LIST_ITEM: Record<string, ListItemType> = { bulletList: "bullet_item", orderedList: "numbered_item", taskList: "checklist_item" };

/**
 * An old whole-list node's items as item nodes, of `type` (or its own kind); the first keeps the
 * block's id, so it reads as a retype. A list nested in an item (pasted from elsewhere) is
 * flattened after it: there are no nested lists.
 */
function itemsOfOldList(list: Node, type?: ListItemType): Node[] {
  const kind = type ?? OLD_LIST_ITEM[list.type.name] ?? "bullet_item";
  const itemType = list.type.schema.nodes[NODE_FOR_TYPE[kind]]!;
  const start = Number(list.attrs.start) || 1;
  const out: Node[] = [];
  list.forEach((li, _o, i) => {
    const para = li.firstChild;
    const attrs = { ...(i === 0 ? blockAttrs(list) : {}), ...freshAttrs(kind, start + i), ...(kind === "checklist_item" ? { checked: !!li.attrs.checked } : {}) };
    out.push(itemType.create(attrs, para?.isTextblock ? para.content : undefined));
    li.forEach((child, _p, j) => {
      if (j > 0 && OLD_LIST_ITEM[child.type.name]) out.push(...itemsOfOldList(child, type).map((n) => n.type.create({ ...n.attrs, id: null }, n.content)));
    });
  });
  return out;
}

/** A pasted slice with any whole lists in it made into item blocks (Word, Docs and web pages paste lists). */
export function pastedAsItems(slice: Slice): Slice {
  let changed = false;
  const nodes: Node[] = [];
  slice.content.forEach((n) => {
    if (OLD_LIST_ITEM[n.type.name]) {
      changed = true;
      nodes.push(...itemsOfOldList(n).map((i) => i.type.create({ ...i.attrs, id: null }, i.content)));
    } else nodes.push(n);
  });
  if (!changed) return slice;
  // Open into a list's item text (list > item > paragraph) is open into the item block's text.
  const open = (n: Node | null, depth: number) => (n && OLD_LIST_ITEM[n.type.name] ? (depth >= 3 ? 1 : 0) : depth);
  return new Slice(Fragment.fromArray(nodes), open(slice.content.firstChild, slice.openStart), open(slice.content.lastChild, slice.openEnd));
}

export function toggleListItemsTr(state: EditorState, type: ListItemType): Transaction | null {
  const itemType = state.schema.nodes[NODE_FOR_TYPE[type]]!;
  const paragraph = state.schema.nodes.paragraph!;
  const blocks = selectedBlocks(state).filter(({ node }) => (node.isTextblock && node.type.name !== "codeBlock") || isOldList(TYPE_FOR_NODE[node.type.name]));
  if (!blocks.length) return null;
  const allAlready = blocks.every(({ node }) => node.type === itemType);
  const tr = state.tr;
  // Right to left, so earlier positions stay put.
  for (const { node, pos } of [...blocks].reverse()) {
    const oldType = TYPE_FOR_NODE[node.type.name];
    if (isOldList(oldType)) {
      tr.replaceWith(pos, pos + node.nodeSize, itemsOfOldList(node, type));
    } else if (allAlready) tr.setNodeMarkup(pos, paragraph, blockAttrs(node));
    else if (node.type !== itemType) tr.setNodeMarkup(pos, itemType, { ...blockAttrs(node), ...freshAttrs(type) });
  }
  return tr.docChanged ? tr : null;
}

/** Enter in an item: the next item, or, on an empty item, a paragraph. */
function enterInItem(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { $from, empty } = state.selection;
  if ($from.depth !== 1 || !isItemNode($from.parent)) return false;
  const item = $from.parent;
  if (empty && item.content.size === 0) {
    dispatch?.(state.tr.setNodeMarkup($from.before(1), state.schema.nodes.paragraph!, blockAttrs(item)));
    return true;
  }
  const tr = state.tr;
  if (!empty) tr.deleteSelection();
  const at = tr.mapping.map($from.pos);
  const number = item.type.name === "numberedItem" ? (Number(item.attrs.number) || 1) + 1 : undefined;
  tr.split(at, 1, [{ type: item.type, attrs: number ? { number } : {} }]);
  dispatch?.(tr.scrollIntoView());
  return true;
}

/** Backspace at the very start of an item: it becomes a paragraph, keeping its text. */
function backspaceInItem(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 1 || !isItemNode($from.parent) || $from.parentOffset !== 0) return false;
  const tr = state.tr.setNodeMarkup($from.before(1), state.schema.nodes.paragraph!, blockAttrs($from.parent));
  dispatch?.(tr.setSelection(TextSelection.create(tr.doc, $from.pos)));
  return true;
}

/** A list marker typed at the start of a top-level paragraph or heading turns it into an item. */
function markerRule(find: RegExp, type: ListItemType, attrs: (m: RegExpMatchArray) => Record<string, unknown>) {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from);
      const block = $from.parent;
      if ($from.depth !== 1 || !["paragraph", "heading"].includes(block.type.name)) return null;
      const itemType = state.schema.nodes[NODE_FOR_TYPE[type]]!;
      state.tr.delete(range.from, range.to).setNodeMarkup($from.before(1), itemType, { ...blockAttrs(block), ...freshAttrs(type), ...attrs(match) });
    },
  });
}

/** The commands, keys and input rules for list items, with the three nodes. */
export const ListItems = Extension.create({
  name: "edwListItems",
  // Above StarterKit's lists, so `- ` makes an item, not a whole-list block.
  priority: 200,
  addExtensions() {
    return [BulletItem, NumberedItem, ChecklistItem];
  },
  addCommands() {
    return {
      toggleListItems:
        (type: ListItemType) =>
        ({ state, dispatch }: CommandProps) => {
          const tr = toggleListItemsTr(state, type);
          if (!tr) return false;
          dispatch?.(tr);
          return true;
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => enterInItem(editor.state, editor.view.dispatch),
      Backspace: ({ editor }) => backspaceInItem(editor.state, editor.view.dispatch),
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey("edw-list-paste"), props: { transformPasted: (slice) => pastedAsItems(slice) } })];
  },
  addInputRules() {
    return [
      markerRule(/^\s*([-+*])\s$/, "bullet_item", () => ({})),
      markerRule(/^(\d+)[.)]\s$/, "numbered_item", (m) => ({ number: Number(m[1]) || 1 })),
      markerRule(/^\[( |x)?\]\s$/, "checklist_item", (m) => ({ checked: m[1] === "x" })),
    ];
  },
});
