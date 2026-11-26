/**
 * A writing line: a line pupils write on, from where it sits to the right margin. Written in
 * block content as `<line/>` (../inline.ts). On a line of its own (a paragraph, or a list item's
 * continuation line after a line break) it runs the full width; after text ("The door creaked
 * like <line/>") it fills the rest of that line. In Word it is a tab to a right tab stop at the
 * margin with an underline leader (../../export/writingLines.ts), so Word draws it to the margin
 * in any font. Teachers add one from the "/" menu; the assistant writes `<line/>`.
 *
 * The browser cannot make an inline element fill the rest of a line, so each line is sized
 * after every change and when the page is resized: to the margin from where it starts, or the
 * whole width when too little is left (it then wraps to a line of its own, as Word's does).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    writingLine: {
      /** A writing line at the cursor. */
      insertWritingLine: () => ReturnType;
    };
  }
}

/** Less room than this (in pixels) and the line takes a line of its own. */
const MIN_PX = 40;

/** Sizes every writing line under `root` to reach the right edge of its block's text. */
export function fitWritingLines(root: HTMLElement): void {
  const lines = Array.from(root.querySelectorAll<HTMLElement>("span[data-writing-line]"));
  for (const el of lines) el.style.width = `${MIN_PX}px`;
  for (const el of lines) {
    const block = el.parentElement;
    if (!block) continue;
    const box = block.getBoundingClientRect();
    const cs = getComputedStyle(block);
    const left = box.left + (Number.parseFloat(cs.paddingLeft) || 0);
    const right = box.right - (Number.parseFloat(cs.paddingRight) || 0);
    if (right <= left) continue;
    const room = right - el.getBoundingClientRect().left - 1;
    el.style.width = `${Math.floor(room >= MIN_PX ? room : right - left - 1)}px`;
  }
}

export const WritingLine = Node.create({
  name: "writingLine",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  marks: "",

  parseHTML() {
    return [{ tag: "span[data-writing-line]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-writing-line": "", role: "img", "aria-label": "Writing line" })];
  },

  renderText() {
    return "________";
  },

  addCommands() {
    return {
      insertWritingLine:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          const fit = () => fitWritingLines(view.dom as HTMLElement);
          const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
          observer?.observe(view.dom);
          fit();
          return { update: fit, destroy: () => observer?.disconnect() };
        },
      }),
    ];
  },
});
