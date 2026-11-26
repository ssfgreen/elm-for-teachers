/**
 * What the toolbar shows and does for the canvas: the block type at the cursor, and the
 * commands behind its block-type, mark and insert buttons.
 */
import { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { ITEM_TYPE_OF, isListItem, isOldList } from "@edw/shared";
import { TYPE_FOR_NODE } from "./blockTypes.js";
import type { BlockTypeChoice, MarkName } from "./Toolbar.js";

/** The block type at the cursor (or of the selected node). */
export function currentChoice(editor: Editor | null): BlockTypeChoice {
  if (!editor) return { type: "paragraph" };
  const sel = editor.state.selection;
  const node = sel instanceof NodeSelection ? sel.node : sel.$from.depth >= 1 ? sel.$from.node(1) : null;
  if (!node) return { type: "paragraph" };
  const raw = TYPE_FOR_NODE[node.type.name] ?? "paragraph";
  // An older whole-list block shows as its item type, so the toolbar's list button lights up.
  const type = isOldList(raw) ? ITEM_TYPE_OF[raw] : raw;
  return type === "heading" ? { type, level: node.attrs.level as number } : { type };
}

export function useToolbarCommands(editor: Editor | null) {
  const onBlockType = useCallback(
    (choice: BlockTypeChoice) => {
      if (!editor) return;
      if (isListItem(choice.type)) {
        editor.chain().focus().toggleListItems(choice.type).run();
        return;
      }
      const chain = editor.chain().focus().clearNodes();
      switch (choice.type) {
        case "heading":
          chain.setHeading({ level: (choice.level ?? 2) as 1 | 2 | 3 });
          break;
        case "quote":
          chain.toggleBlockquote();
          break;
        case "code_block":
          chain.toggleCodeBlock();
          break;
        default:
          break;
      }
      chain.run();
    },
    [editor],
  );
  const onMark = useCallback(
    (mark: MarkName) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      if (mark === "bold") chain.toggleBold();
      else if (mark === "italic") chain.toggleItalic();
      else if (mark === "underline") chain.toggleUnderline();
      else chain.toggleCode();
      chain.run();
    },
    [editor],
  );
  const onInsert = useCallback(
    (what: "divider" | "page_break" | "table") => {
      if (!editor) return;
      if (what === "divider") editor.chain().focus().setHorizontalRule().run();
      else if (what === "page_break") editor.chain().focus().setPageBreak().run();
      else editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    },
    [editor],
  );
  return { current: currentChoice(editor), onBlockType, onMark, onInsert };
}
