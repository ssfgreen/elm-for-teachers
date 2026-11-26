/**
 * A document's font and page colour (shared DocStyle): how each is named, drawn in the editor
 * and written to Word. The fonts are ones Word has (Lexend is an Office cloud font), except
 * OpenDyslexic, which the reader installs themselves. In the editor each falls back to a free
 * font with the same letter widths, loaded with the app. The page colours are the pale tints used for pupils with visual stress, drawn from
 * theme tokens (`--paper-cream` and so on, darker in dark mode); Word gets the light ones.
 */
import { DEFAULT_DOC_FONT, DocBackground, DocFont, type DocStyle } from "@edw/shared";

export const DOC_FONTS = DocFont.options;
export const DOC_BACKGROUNDS = DocBackground.options;

/**
 * The fonts offered, under their headings. The others in DocFont are still read but not offered:
 * Century Gothic and Verdana, and Comic Sans (a past study condition).
 */
export const DOC_FONT_GROUPS: ReadonlyArray<{ label: string; fonts: readonly DocFont[] }> = [
  { label: "Sans", fonts: ["lexend", "calibri", "arial", "open_dyslexic"] },
  { label: "Serif", fonts: ["georgia", "cambria", "times_new_roman"] },
];

export const DOC_FONT_LABELS: Record<DocFont, string> = {
  lexend: "Lexend",
  calibri: "Calibri",
  arial: "Arial",
  georgia: "Georgia",
  cambria: "Cambria",
  times_new_roman: "Times New Roman",
  century_gothic: "Century Gothic",
  comic_sans: "Comic Sans",
  verdana: "Verdana",
  open_dyslexic: "OpenDyslexic",
};

/** The font's name in Word. */
export const WORD_FONTS: Record<DocFont, string> = {
  ...DOC_FONT_LABELS,
  comic_sans: "Comic Sans MS",
};

/**
 * In the editor: the Word font first, where the device has it, then its free twin with the same
 * letter widths, bundled with the app (styles/index.css), so text wraps and pages break as in Word.
 */
export const DOC_FONT_STACKS: Record<DocFont, string> = {
  lexend: "Lexend, sans-serif",
  calibri: "Calibri, Carlito, sans-serif",
  arial: "Arial, Arimo, sans-serif",
  georgia: "Georgia, Gelasio, serif",
  cambria: "Cambria, Caladea, serif",
  times_new_roman: "'Times New Roman', Tinos, serif",
  // No longer offered, and no twin: where the device lacks it, Arimo stands in under the font's own
  // name (components/wordPreviewFonts.css, loaded with the app), so narrower than Word sets it.
  century_gothic: "'Century Gothic', Arimo, sans-serif",
  comic_sans: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive",
  // As Century Gothic: Arimo where the device lacks it.
  verdana: "Verdana, Arimo, sans-serif",
  // Not a Word font: bundled with the app, and the Word download warns about it (export/fontNotice.ts).
  open_dyslexic: "OpenDyslexic, sans-serif",
};

export const DOC_BACKGROUND_LABELS: Record<DocBackground, string> = {
  cream: "Cream",
  yellow: "Pale yellow",
  blue: "Pale blue",
  green: "Pale green",
  pink: "Pale pink",
  lilac: "Lilac",
};

/** The page colour in Word, as hex (the same as the light theme's tokens). */
export const WORD_BACKGROUNDS: Record<DocBackground, string> = {
  cream: "FBF3DB",
  yellow: "FFF9C4",
  blue: "DDEBF7",
  green: "E2F0D9",
  pink: "FBE4EC",
  lilac: "ECE6F5",
};

/** The editor page's font and colour, as inline style: no font is the default, as Word prints it; no colour, the app's own. */
export function pageStyle(style: DocStyle | undefined): Record<string, string> {
  return {
    fontFamily: DOC_FONT_STACKS[style?.font ?? DEFAULT_DOC_FONT],
    ...(style?.background ? { backgroundColor: `var(--paper-${style.background})` } : {}),
  };
}
