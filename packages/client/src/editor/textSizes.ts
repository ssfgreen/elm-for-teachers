/**
 * The text sizes a teacher can set on part of the text (Normal is no size: the block's own). Each
 * is a fixed size in points, the same in the editor (where the page's 16px body is 12pt) and in Word.
 */
export const TEXT_SIZES = ["small", "large", "x_large", "huge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Small",
  large: "Large",
  x_large: "Extra large",
  huge: "Huge",
};

export const TEXT_SIZE_POINTS: Record<TextSize, number> = {
  small: 10,
  large: 14,
  x_large: 18,
  huge: 24,
};

export const isTextSize = (s: string | null | undefined): s is TextSize => (TEXT_SIZES as readonly string[]).includes(s ?? "");
