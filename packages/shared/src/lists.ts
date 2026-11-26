/**
 * Lists as one block per item (PLAN.md section 6). An item block's content is its marker and
 * text: `- text`, `3. text` or `- [ ] text` (`- [x] ` when ticked). A line break inside an item
 * is a continuation line indented under the marker. A run of item blocks of one type is drawn
 * as one list; a numbered run counts on from its first item's number, so later items' own
 * numbers are not read (inserting an item never renumbers the others' content).
 *
 * The old list blocks (`bullet_list`, `numbered_list`, `checklist`) hold a whole list; they are
 * no longer written, but are still read, and split here into items. Pure.
 */
import type { BlockType } from "./enums.js";

export const LIST_ITEM_TYPES = ["bullet_item", "numbered_item", "checklist_item"] as const;
export type ListItemType = (typeof LIST_ITEM_TYPES)[number];

export const OLD_LIST_TYPES = ["bullet_list", "numbered_list", "checklist"] as const;
export type OldListType = (typeof OLD_LIST_TYPES)[number];

export const isListItem = (type: BlockType | string | undefined): type is ListItemType =>
  (LIST_ITEM_TYPES as readonly string[]).includes(type ?? "");
export const isOldList = (type: BlockType | string | undefined): type is OldListType =>
  (OLD_LIST_TYPES as readonly string[]).includes(type ?? "");

export const ITEM_TYPE_OF: Record<OldListType, ListItemType> = {
  bullet_list: "bullet_item",
  numbered_list: "numbered_item",
  checklist: "checklist_item",
};
export const LIST_TYPE_OF: Record<ListItemType, OldListType> = {
  bullet_item: "bullet_list",
  numbered_item: "numbered_list",
  checklist_item: "checklist",
};

export const BULLET_RE = /^\s*[-*•]\s+/;
export const NUMBER_RE = /^\s*(\d+)[.)]\s+/;
export const CHECK_RE = /^\s*[-*]\s+\[( |x|X)\]\s?/;

/** The markers of an item's first line, by type. */
const MARKER: Record<ListItemType, RegExp> = { bullet_item: BULLET_RE, numbered_item: NUMBER_RE, checklist_item: CHECK_RE };
/** Does this line start an item of the type (a checklist also takes a plain bullet)? */
const startsItem = (type: ListItemType, line: string) => MARKER[type].test(line) || (type === "checklist_item" && BULLET_RE.test(line));

export interface ParsedItem {
  /** The item's text with its marker taken off; continuation lines joined with `\n`, trimmed. */
  text: string;
  /** A numbered item's own number (1 when it has none). */
  number: number;
  checked: boolean;
}

/** An item block's content read into its parts. Anything before the first marker is text. */
export function parseItem(type: ListItemType, content: string): ParsedItem {
  const [first = "", ...rest] = content.split(/\r?\n/);
  let text = first;
  let number = 1;
  let checked = false;
  const check = CHECK_RE.exec(first);
  const num = NUMBER_RE.exec(first);
  if (type === "checklist_item" && check) {
    checked = check[1]!.toLowerCase() === "x";
    text = first.slice(check[0].length);
  } else if (type === "numbered_item" && num) {
    number = Number(num[1]) || 1;
    text = first.slice(num[0].length);
  } else if (BULLET_RE.test(first)) text = first.replace(BULLET_RE, "");
  return { text: [text, ...rest.map((l) => l.trim())].join("\n"), number, checked };
}

/** An item block's content from its parts, continuation lines indented under the marker. */
export function writeItem(type: ListItemType, item: { text: string; number?: number; checked?: boolean }): string {
  const marker = type === "numbered_item" ? `${item.number ?? 1}. ` : type === "checklist_item" ? `- [${item.checked ? "x" : " "}] ` : "- ";
  const indent = " ".repeat(type === "checklist_item" ? 6 : marker.length);
  return marker + item.text.replace(/\n/g, `\n${indent}`);
}

/** The text of an item without its marker (for a quote or a search). */
export const itemText = (type: ListItemType, content: string) => parseItem(type, content).text;

/**
 * An old list block's content as the item blocks it holds, in order: a line with a marker starts
 * an item, a line without one continues the item above. An empty list is one empty item.
 */
export function splitList(type: OldListType, content: string): Array<{ type: ListItemType; content: string }> {
  const itemType = ITEM_TYPE_OF[type];
  const groups: string[][] = [];
  for (const line of content.split(/\r?\n/)) {
    if (groups.length === 0 || startsItem(itemType, line)) groups.push([line]);
    else groups[groups.length - 1]!.push(line);
  }
  return groups.map((g) => ({ type: itemType, content: writeItem(itemType, parseItem(itemType, g.join("\n"))) }));
}

/**
 * The number each block shows: for a numbered item, its first item's number plus its place in
 * the run of numbered items it is in; null for anything else.
 */
export function itemNumbers(blocks: ReadonlyArray<{ type: BlockType | string; content: string }>): Array<number | null> {
  const out: Array<number | null> = [];
  let next: number | null = null;
  for (const b of blocks) {
    if (b.type !== "numbered_item") {
      next = null;
      out.push(null);
      continue;
    }
    const n: number = next ?? parseItem("numbered_item", b.content).number;
    out.push(n);
    next = n + 1;
  }
  return out;
}

/** Runs of item blocks of one type, joined into one list's markdown each, numbered as shown; other blocks as they are. */
export function joinRuns<B extends { type: BlockType | string; content: string }>(blocks: readonly B[]): Array<{ type: B["type"] | OldListType; content: string; items: B[] }> {
  const numbers = itemNumbers(blocks);
  const out: Array<{ type: B["type"] | OldListType; content: string; items: B[] }> = [];
  blocks.forEach((b, i) => {
    if (!isListItem(b.type)) {
      out.push({ type: b.type, content: b.content, items: [b] });
      return;
    }
    const type = b.type;
    const p = parseItem(type, b.content);
    const line = writeItem(type, { ...p, number: numbers[i] ?? p.number });
    const last = out[out.length - 1];
    if (last && last.type === LIST_TYPE_OF[type] && last.items.length && last.items[last.items.length - 1]!.type === type) {
      last.content += `\n${line}`;
      last.items.push(b);
    } else out.push({ type: LIST_TYPE_OF[type], content: line, items: [b] });
  });
  return out;
}

/** Longest common subsequence of two lists of texts, as matched index pairs in order. */
function commonTexts(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * Which earlier item each item of a list's new version is, by their texts (without markers):
 * items with the same text first, in order; between those, the rest paired up in order (an item
 * edited); what is left is new (no entry) or gone. New index to old index.
 */
export function matchItems(before: readonly string[], after: readonly string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let oi = 0;
  let ni = 0;
  for (const [ao, an] of [...commonTexts(before, after), [before.length, after.length] as [number, number]]) {
    while (oi < ao && ni < an) pairs.set(ni++, oi++);
    oi = ao;
    ni = an;
    if (ao < before.length) pairs.set(ni++, oi++);
  }
  return pairs;
}

/**
 * Whether two contents of an item say the same: the same text and tick. A numbered item's own
 * number only counts when it starts its run (`first`): later items show their place in the run.
 */
export function sameItem(type: ListItemType, a: string, b: string, first: boolean): boolean {
  if (a === b) return true;
  if (type !== "numbered_item" || first) return false;
  const x = parseItem(type, a);
  const y = parseItem(type, b);
  return x.text === y.text;
}
