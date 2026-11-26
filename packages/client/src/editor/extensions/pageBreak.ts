/**
 * A forced page break: its own block, shown as a dashed line labelled "Page break". The
 * Word download writes a real page break there (see ../../export/docx.ts), and the preview
 * starts a new page at it. Pages around it are not stored: they depend on the fonts and
 * margins, so the preview works them out each time.
 *
 * Inserted from the toolbar, the "/" menu or Mod-Enter, always between top-level blocks (never
 * inside a list, quote or table), with the cursor in the block after it. Pasted page breaks from
 * Word (`<br style="page-break-before: always">`) and Google Docs (`<hr style="page-break-before:
 * always">`) come in as one.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** A page break after the block the cursor is in. */
      setPageBreak: () => ReturnType;
    };
  }
}

const forcesBreak = (el: HTMLElement) => /page-break-(before|after)\s*:\s*always/i.test(el.getAttribute("style") ?? "");

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [
      { tag: "div[data-page-break]" },
      // Above the horizontal rule's plain `hr`.
      { tag: "hr", priority: 60, getAttrs: (el) => (forcesBreak(el as HTMLElement) ? null : false) },
      { tag: "br", priority: 60, getAttrs: (el) => (forcesBreak(el as HTMLElement) ? null : false) },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "", role: "separator", "aria-label": "Page break" }), ["span", { "aria-hidden": "true" }, "Page break"]];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          // After the top-level block the cursor is in (or before the first block, at its start).
          const top = $from.depth >= 1 ? $from.before(1) : 0;
          const atStart = $from.depth >= 1 && $from.parentOffset === 0 && $from.depth === 1 && $from.parent.content.size > 0;
          const pos = $from.depth === 0 ? $from.pos : atStart ? top : $from.after(1);
          if (!dispatch) return true;
          tr.insert(pos, this.type.create());
          const after = pos + 1;
          if (atStart) {
            tr.setSelection(TextSelection.create(tr.doc, after + 1));
          } else {
            const next = tr.doc.resolve(after).nodeAfter;
            if (!next || !next.isTextblock) tr.insert(after, state.schema.nodes.paragraph!.create());
            tr.setSelection(TextSelection.create(tr.doc, after + 1));
          }
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // As in Word and Google Docs. In a code block Mod-Enter leaves the block, as before.
      "Mod-Enter": ({ editor }) => (editor.isActive("codeBlock") ? false : editor.commands.setPageBreak()),
    };
  },
});
