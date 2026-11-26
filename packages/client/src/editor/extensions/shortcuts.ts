/**
 * Keyboard policy on top of Tiptap's defaults (Mod-B/I/U/E, Mod-Alt-1..3 headings,
 * Mod-Shift-B quote, Mod-Alt-C code):
 *  - Mod-Shift-7/8/9 make list items (listItems.ts), not Tiptap's whole-list blocks;
 *  - the extra shortcuts the dev notes promise: Mod-Alt-0 text, 4 checklist,
 *    5 bullets, 6 numbers, 8 code block, Mod-Shift-. quote;
 *  - no nested lists (blocks are flat): Tab and Shift-Tab do nothing in lists,
 *    but still move between table cells;
 *  - Shift-Enter is a line break inside a paragraph or a list item, as in a word
 *    processor, and does nothing in a heading or table cell;
 *  - Mod-A selects the current block first, then everything (from novel's
 *    CustomKeymap, Apache-2.0).
 */
import { Extension } from "@tiptap/core";
import { isItemNode } from "./listItems.js";

export const Shortcuts = Extension.create({
  name: "edwShortcuts",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": ({ editor }) => editor.chain().focus().clearNodes().run(),
      "Mod-Alt-4": ({ editor }) => editor.chain().focus().toggleListItems("checklist_item").run(),
      "Mod-Alt-5": ({ editor }) => editor.chain().focus().toggleListItems("bullet_item").run(),
      "Mod-Alt-6": ({ editor }) => editor.chain().focus().toggleListItems("numbered_item").run(),
      "Mod-Shift-9": ({ editor }) => editor.chain().focus().toggleListItems("checklist_item").run(),
      "Mod-Shift-8": ({ editor }) => editor.chain().focus().toggleListItems("bullet_item").run(),
      "Mod-Shift-7": ({ editor }) => editor.chain().focus().toggleListItems("numbered_item").run(),
      "Mod-Alt-8": ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
      "Mod-Shift-.": ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
      "Shift-Enter": ({ editor }) => {
        const { $from } = editor.state.selection;
        const inOldItem = $from.depth === 3 && ["listItem", "taskItem"].includes($from.node(2).type.name);
        if ($from.depth === 1 && isItemNode($from.parent)) return editor.commands.setHardBreak();
        if ($from.parent.type.name === "paragraph" && ($from.depth === 1 || inOldItem)) return editor.commands.setHardBreak();
        return true;
      },
      Tab: ({ editor }) => !editor.isActive("table"),
      "Shift-Tab": ({ editor }) => !editor.isActive("table"),
      "Mod-a": ({ editor }) => {
        const { selection } = editor.state;
        const from = selection.$from.start();
        const to = selection.$to.end();
        if (selection.from > from || selection.to < to) {
          return editor.commands.setTextSelection({ from, to });
        }
        return false;
      },
    };
  },
});
