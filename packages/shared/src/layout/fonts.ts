/**
 * How wide text is in Word, from the letter widths of the free fonts the app bundles
 * (fontWidths.ts). Each Word font maps to its twin; where the twin has the same letter widths
 * (Calibri, Arial, Times New Roman, Georgia, Cambria, Lexend, OpenDyslexic) the measure is
 * close to Word's, and a doc with no font is in Calibri (DEFAULT_DOC_FONT). Others are
 * estimates, scaled from the nearest twin: Comic Sans from Comic Neue, Century Gothic and Verdana
 * (no longer offered) from Arimo.
 */
import { DEFAULT_DOC_FONT, type DocFont } from "../enums.js";
import { CHARS, FONT_WIDTHS } from "./fontWidths.js";

export interface Face {
  /** Which bundled font's widths. */
  table: string;
  /** The Word font's width over the twin's (1: the same). */
  scale: number;
  /** True when the widths are an estimate rather than the font's own. */
  estimated: boolean;
  /** The Word font's name, for the report. */
  name: string;
}

const face = (name: string, table: string, scale = 1): Face => ({ name, table, scale, estimated: scale !== 1 });

const FACES: Record<DocFont, Face> = {
  lexend: face("Lexend", "lexend"),
  calibri: face("Calibri", "carlito"),
  arial: face("Arial", "arimo"),
  georgia: face("Georgia", "gelasio"),
  cambria: face("Cambria", "caladea"),
  times_new_roman: face("Times New Roman", "tinos"),
  comic_sans: face("Comic Sans MS", "comic_neue", 1.08),
  century_gothic: face("Century Gothic", "arimo", 1.1),
  verdana: face("Verdana", "arimo", 1.15),
  open_dyslexic: face("OpenDyslexic", "opendyslexic"),
};

export const faceFor = (font: DocFont | null | undefined): Face => FACES[font ?? DEFAULT_DOC_FONT] ?? FACES[DEFAULT_DOC_FONT];

const INDEX = new Map(Array.from(CHARS).map((c, i) => [c, i]));
/** Ballot boxes and ticks come from a symbol font in Word: about this wide, in em. */
const SYMBOL_EM = 0.8;
const SYMBOLS = /[☐-☒✓✔✗✘]/;

/** A lower-case letter's average width: for a character the table lacks. */
const averages = new WeakMap<number[], number>();
function average(widths: number[]): number {
  let avg = averages.get(widths);
  if (avg === undefined) {
    const letters = Array.from("abcdefghijklmnopqrstuvwxyz").map((c) => widths[INDEX.get(c)!]!);
    avg = letters.reduce((a, b) => a + b, 0) / letters.length;
    averages.set(widths, avg);
  }
  return avg;
}

/** The width of `text` in points, set at `size` points. */
export function textWidth(text: string, f: Face, size: number, bold = false): number {
  const table = FONT_WIDTHS[f.table]!;
  const widths = bold ? table.bold : table.regular;
  let total = 0;
  for (const ch of text) {
    const i = INDEX.get(ch);
    const w = i === undefined ? 0 : widths[i]!;
    total += w > 0 ? w : SYMBOLS.test(ch) ? SYMBOL_EM * 1000 : average(widths);
  }
  return (total / 1000) * size * f.scale;
}

/** The height of one line in points: the font's line height at `size`, times Word's line spacing. */
export function lineHeight(f: Face, size: number, multiple: number): number {
  return (FONT_WIDTHS[f.table]!.line / 1000) * size * multiple;
}
