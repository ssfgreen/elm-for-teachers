/**
 * A block's inline markdown as runs of plain text (bold or not, and any size the teacher set),
 * and those runs wrapped into lines the width Word gives them.
 */
import { textWidth, type Face } from "./fonts.js";

export interface Run {
  text: string;
  bold: boolean;
  /** Points, from a `data-size` span; null for the block's own size. */
  size: number | null;
}

/** `data-size` values in points (client/src/editor/textSizes.ts). */
const SIZES: Record<string, number> = { small: 10, large: 14, x_large: 18, huge: 24 };

/** Stands for a writing line (`<line/>`) in a run: it fills the rest of its line. */
export const FILL = "\uE001";
/** Less room than this (points) and a writing line takes a line of its own, as in the editor. */
const MIN_FILL = 30;

const TOKEN = /\*\*|\*|<span\b[^>]*>|<\/span>|<\/?[a-z][^>]*>|!?\[([^\]]*)\]\([^)]*\)|\\([\\`*_[\]#|>-])|`/g;

/** The runs of one block's inline markdown: markup taken off, links as their text. */
export function inlineRuns(md: string, bold = false): Run[] {
  const runs: Run[] = [];
  const sizes: Array<number | null> = [];
  let b = bold;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const size = [...sizes].reverse().find((s) => s !== null) ?? null;
    const prev = runs[runs.length - 1];
    if (prev && prev.bold === b && prev.size === size) prev.text += text;
    else runs.push({ text, bold: b, size });
  };
  for (const m of md.matchAll(TOKEN)) {
    push(md.slice(last, m.index));
    last = m.index + m[0].length;
    const t = m[0];
    if (t === "**") b = !b;
    else if (t.startsWith("<span")) sizes.push(SIZES[/data-size="(\w+)"/.exec(t)?.[1] ?? ""] ?? null);
    else if (t === "</span>") sizes.pop();
    else if (t === "<line/>") push(FILL);
    else if (m[1] !== undefined && !t.startsWith("!")) push(m[1]);
    else if (m[2] !== undefined) push(m[2]);
  }
  push(md.slice(last));
  return runs;
}

export interface Line {
  text: string;
  /** Points used, trailing spaces left out. */
  width: number;
  /** The largest size on the line, in points. */
  size: number;
  /** The underscores the line ends with (a writing line or a blank), and their width. */
  blankChars: number;
  blankWidth: number;
  /** The line began because the one before was full (not at the start or after a line break). */
  wrapped: boolean;
  /** It ends with a writing line (`<line/>`), so it reaches the right margin. */
  fill: boolean;
}

/** A line with nothing on it but a writing line or underscores: space for pupils to write. */
export const blankOnly = (l: Line) => (l.fill && l.text.trim() === "") || (l.blankChars > 0 && l.text.trim().length === l.blankChars);

interface Piece {
  text: string;
  run: Run;
}

/**
 * Wraps runs into lines of at most `avail` points, as Word does: at spaces, a word that does not
 * fit going to the next line, and a word longer than a whole line broken where it runs out.
 * A "\n" is a line break. A writing line fills the rest of its line (or the next whole one, when
 * too little is left) and ends it.
 */
export function wrap(runs: readonly Run[], avail: number, f: Face, size: number): Line[] {
  const lines: Line[] = [];
  let pieces: Piece[] = [];
  let wrapped = false;
  let fill = false;
  const width = (ps: readonly Piece[]) => ps.reduce((w, p) => w + (p.text === FILL ? 0 : textWidth(p.text, f, p.run.size ?? size, p.run.bold)), 0);
  const end = () => {
    while (pieces.length && /^\s+$/.test(pieces[pieces.length - 1]!.text)) pieces.pop();
    const text = pieces.map((p) => p.text).join("").replace(FILL, "");
    const blank = /_+$/.exec(text)?.[0] ?? "";
    const blankRun = pieces[pieces.length - 1]?.run;
    lines.push({
      text,
      width: fill ? avail : width(pieces),
      size: Math.max(size, ...pieces.map((p) => p.run.size ?? size)),
      blankChars: blank.length,
      blankWidth: blank ? textWidth(blank, f, blankRun?.size ?? size, blankRun?.bold) : 0,
      wrapped,
      fill,
    });
    pieces = [];
    fill = false;
  };
  // Words (with the runs they span) and the spaces between them, line break by line break.
  const words: Array<Piece[] | "\n"> = [];
  let word: Piece[] = [];
  for (const run of runs) {
    for (const part of run.text.split(new RegExp(`(\\n|\\s+|${FILL})`))) {
      if (!part) continue;
      if (part === "\n" || part === FILL || /^\s+$/.test(part)) {
        if (word.length) words.push(word);
        word = [];
        words.push(part === "\n" ? "\n" : [{ text: part === FILL ? FILL : " ", run }]);
      } else word.push({ text: part, run });
    }
  }
  if (word.length) words.push(word);

  for (const w of words) {
    if (w === "\n") {
      end();
      wrapped = false;
      continue;
    }
    const isSpace = w.length === 1 && w[0]!.text === " ";
    if (isSpace) {
      if (pieces.length && !fill) pieces.push(w[0]!);
      continue;
    }
    if (w.length === 1 && w[0]!.text === FILL) {
      if (fill || (pieces.length && avail - width(pieces) < MIN_FILL)) {
        end();
        wrapped = true;
      }
      pieces.push(w[0]!);
      fill = true;
      continue;
    }
    // Nothing follows a writing line on its line.
    if (fill) {
      end();
      wrapped = true;
    }
    if (pieces.length && width([...pieces, ...w]) > avail) {
      end();
      wrapped = true;
    }
    // A word longer than a whole line: break it where the line runs out.
    for (const p of w) {
      let rest = p.text;
      while (rest && width([...pieces, { text: rest, run: p.run }]) > avail) {
        let n = rest.length - 1;
        while (n > 1 && width([...pieces, { text: rest.slice(0, n), run: p.run }]) > avail) n--;
        pieces.push({ text: rest.slice(0, n), run: p.run });
        end();
        wrapped = true;
        rest = rest.slice(n);
      }
      if (rest) pieces.push({ text: rest, run: p.run });
    }
  }
  end();
  return lines;
}
