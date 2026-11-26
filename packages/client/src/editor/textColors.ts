/**
 * The text colours a teacher can pick, and how each is written. The editor draws them from
 * theme tokens (`--text-red` and so on, lighter in dark mode); the Word file uses Word's own
 * standard colours, with a darker yellow so yellow text can still be read on white paper.
 */
export const TEXT_COLORS = ["red", "yellow", "green", "blue", "teal", "purple"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export const TEXT_COLOR_LABELS: Record<TextColor, string> = {
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  teal: "Teal",
  purple: "Purple",
};

/** In the Word file, as hex. */
export const WORD_TEXT_COLORS: Record<TextColor, string> = {
  red: "C00000",
  yellow: "BF8F00",
  green: "00B050",
  blue: "0070C0",
  teal: "008080",
  purple: "7030A0",
};

/** The Word character style for each colour, so an upload reads the colour back. */
export const wordColorStyle = (c: TextColor) => `Text${c[0]!.toUpperCase()}${c.slice(1)}`;
export const wordColorStyleName = (c: TextColor) => `Text ${TEXT_COLOR_LABELS[c]}`;

/** A table header row in a colour, in the Word file: the colour at 18% on white, as the editor draws it (table.css). */
export function wordHeaderFill(c: TextColor): string {
  const hex = WORD_TEXT_COLORS[c];
  return [0, 2, 4]
    .map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * 0.18))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
