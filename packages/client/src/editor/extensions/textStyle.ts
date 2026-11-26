/**
 * Text colour, font, size and highlight, as marks of their own (written as `<span data-color="…">` and
 * `<mark>` in block content, a font as `<span data-font="…">` and a size as `<span data-size="…">`; see ../inline.ts). Only the colours in ../textColors.ts are kept:
 * text pasted in another colour comes in plain.
 */
import { Mark, mergeAttributes } from "@tiptap/core";
import { DocFont } from "@edw/shared";
import { TEXT_COLORS, type TextColor } from "../textColors.js";
import { DOC_FONT_STACKS } from "../docStyle.js";
import { isTextSize, TEXT_SIZE_POINTS, type TextSize } from "../textSizes.js";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      /** Colours the selection; null takes the colour off. */
      setTextColor: (color: TextColor | null) => ReturnType;
    };
    textFont: {
      /** Sets the selection in a font, over the document's; null gives it back the document's. */
      setTextFont: (font: DocFont | null) => ReturnType;
    };
    textSize: {
      /** Sets the selection in a size; null gives it back the block's own. */
      setTextSize: (size: TextSize | null) => ReturnType;
    };
    highlight: {
      toggleHighlight: () => ReturnType;
    };
  }
}

const known = (c: string | null | undefined): TextColor | null => ((TEXT_COLORS as readonly string[]).includes(c ?? "") ? (c as TextColor) : null);

export const TextColorMark = Mark.create({
  name: "textColor",
  addAttributes() {
    return { color: { default: null } };
  },
  parseHTML() {
    return [
      { tag: "span[data-color]", getAttrs: (el) => (known((el as HTMLElement).dataset.color) ? { color: (el as HTMLElement).dataset.color } : false) },
      // From a Word upload: mammoth gives the colour's character style as a class.
      { tag: "span[class^='edw-color-']", getAttrs: (el) => (known((el as HTMLElement).className.replace("edw-color-", "")) ? { color: (el as HTMLElement).className.replace("edw-color-", "") } : false) },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-color": HTMLAttributes.color as string, class: "text-color" })];
  },
  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          color ? commands.setMark(this.name, { color }) : commands.unsetMark(this.name),
    };
  },
});

const knownFont = (f: string | null | undefined): DocFont | null => ((DocFont.options as readonly string[]).includes(f ?? "") ? (f as DocFont) : null);

/** A font for part of the text, over the document's own (pasted fonts are not kept). */
export const TextFontMark = Mark.create({
  name: "textFont",
  addAttributes() {
    return { font: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-font]", getAttrs: (el) => (knownFont((el as HTMLElement).dataset.font) ? { font: (el as HTMLElement).dataset.font } : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    const font = knownFont(HTMLAttributes.font as string);
    return ["span", mergeAttributes({ "data-font": font ?? undefined, style: font ? `font-family: ${DOC_FONT_STACKS[font]}` : undefined })];
  },
  addCommands() {
    return {
      setTextFont:
        (font) =>
        ({ commands }) =>
          font ? commands.setMark(this.name, { font }) : commands.unsetMark(this.name),
    };
  },
});

/** A size for part of the text, in points (pasted sizes are not kept). */
export const TextSizeMark = Mark.create({
  name: "textSize",
  addAttributes() {
    return { size: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-size]", getAttrs: (el) => (isTextSize((el as HTMLElement).dataset.size) ? { size: (el as HTMLElement).dataset.size } : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    const size = HTMLAttributes.size as string;
    return ["span", mergeAttributes({ "data-size": isTextSize(size) ? size : undefined, style: isTextSize(size) ? `font-size: ${TEXT_SIZE_POINTS[size]}pt` : undefined })];
  },
  addCommands() {
    return {
      setTextSize:
        (size) =>
        ({ commands }) =>
          size ? commands.setMark(this.name, { size }) : commands.unsetMark(this.name),
    };
  },
});

export const HighlightMark = Mark.create({
  name: "highlight",
  parseHTML() {
    return [{ tag: "mark" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", HTMLAttributes, 0];
  },
  addCommands() {
    return {
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleHighlight() };
  },
});
