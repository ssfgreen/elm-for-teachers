/** What a layout check reports: a problem, the blocks it is in, and what would fix it. */
export type LayoutArea = "lines" | "tables" | "spacing" | "pages";

export interface LayoutFinding {
  area: LayoutArea;
  /** Indexes of the blocks it is about, from 0. */
  blocks: number[];
  /** One or two sentences for the model: what is wrong, and the fix where there is a clear one. */
  text: string;
}

/** A percentage, rounded. */
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Points as editor pixels, the unit of a colwidths line. */
export const px = (pt: number) => Math.round(pt / 0.75);

/** "a", "a and b", "a, b and c". */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The start of a line, shortened, for quoting. */
export function quoteStart(text: string, max = 40): string {
  const t = text.replace(/_{3,}/g, "___").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
