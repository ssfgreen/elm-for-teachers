/**
 * Layout checks on an EvalRun: the doc after the turn (suggestions accepted) through the same
 * layout check the model is offered (shared/src/layout), so they are deterministic. The model
 * passes when the problems the teacher asked about are gone, without new ones of that kind.
 */
import { checkLayout, isOldList, splitList, type BlockType, type DocFont, type LayoutArea, type LayoutFinding } from '@edw/shared';
import type { BlockFixture } from './harness.js';
import type { Check, CheckResult } from './judges.js';

const behaviour = (name: string, pass: boolean, detail?: string): CheckResult => ({ name, kind: 'behaviour', pass, ...(detail ? { detail } : {}) });

type Plain = { type: BlockType | string; content: string };

/** A fixture's blocks as the harness seeds them: an old-style list as one block per item. */
export function seededBlocks(blocks: readonly BlockFixture[]): Plain[] {
  return blocks.flatMap((b) => (isOldList(b.type) ? splitList(b.type, b.content) : [{ type: b.type, content: b.content }]));
}

/** The layout check's findings for some blocks, in the given areas (all when none are given). */
export function layoutFindings(blocks: readonly Plain[], font: DocFont | null | undefined, areas: readonly LayoutArea[] = []): LayoutFinding[] {
  const result = checkLayout(blocks.map((b, i) => ({ id: `b${i + 1}`, ...b })), font);
  return result.findings.filter((f) => areas.length === 0 || areas.includes(f.area));
}

const shown = (fs: readonly LayoutFinding[]) => fs.map((f) => `[${f.area}, block ${f.blocks.map((i) => i + 1).join(',')}] ${f.text}`).join(' | ').slice(0, 600);

/** The doc has no layout problems of these kinds after the turn. */
export const layoutClean = (doc: string, ...areas: LayoutArea[]): Check => (r) => {
  const blocks = r.afterBlocks[doc];
  if (!blocks) return behaviour(`“${doc}” has no ${areas.join('/')} problems`, false, 'no such doc after the turn');
  const found = layoutFindings(blocks, r.afterStyle[doc]?.font, areas);
  return behaviour(`“${doc}” has no ${areas.join('/')} problems`, found.length === 0, found.length ? shown(found) : undefined);
};

/** No layout problems of these kinds in the blocks whose text matches `re` (the part the teacher pointed at). */
export const layoutCleanWhere = (doc: string, re: RegExp, ...areas: LayoutArea[]): Check => (r) => {
  const name = `“${doc}”: no ${areas.join('/')} problems where ${re}`;
  const blocks = r.afterBlocks[doc];
  if (!blocks) return behaviour(name, false, 'no such doc after the turn');
  if (!blocks.some((b) => re.test(b.content))) return behaviour(name, false, `no block matches ${re} after the turn`);
  const found = layoutFindings(blocks, r.afterStyle[doc]?.font, areas).filter((f) => f.blocks.some((i) => re.test(blocks[i]?.content ?? '')));
  return behaviour(name, found.length === 0, found.length ? shown(found) : undefined);
};

/** No more layout problems of these kinds than the doc had before the turn. */
export const layoutNoWorse = (doc: string, before: readonly BlockFixture[], ...areas: LayoutArea[]): Check => (r) => {
  const name = `“${doc}”: no more ${areas.join('/')} problems than before`;
  const blocks = r.afterBlocks[doc];
  if (!blocks) return behaviour(name, false, 'no such doc after the turn');
  const was = layoutFindings(seededBlocks(before), r.afterStyle[doc]?.font, areas);
  const now = layoutFindings(blocks, r.afterStyle[doc]?.font, areas);
  return behaviour(name, now.length <= was.length, `${was.length} before, ${now.length} after${now.length > was.length ? `: ${shown(now)}` : ''}`);
};

/** The doc prints on at most this many pages. */
export const pagesAtMost = (doc: string, max: number): Check => (r) => {
  const blocks = r.afterBlocks[doc] ?? [];
  const pages = checkLayout(blocks.map((b, i) => ({ id: `b${i + 1}`, ...b })), r.afterStyle[doc]?.font).pages;
  return behaviour(`“${doc}” fits on ${max} page${max === 1 ? '' : 's'}`, blocks.length > 0 && pages <= max, `${pages} page(s)`);
};

/** A page break comes straight before the first block matching `re` (empty paragraphs between allowed). */
export const pageBreakBefore = (doc: string, re: RegExp): Check => (r) => {
  const blocks = r.afterBlocks[doc] ?? [];
  const at = blocks.findIndex((b) => re.test(b.content));
  let i = at - 1;
  while (i >= 0 && blocks[i]!.type === 'paragraph' && blocks[i]!.content.trim() === '') i--;
  return behaviour(`“${doc}” has a page break before ${re}`, at > 0 && blocks[i]?.type === 'page_break', at < 0 ? 'no such block' : `block before is ${blocks[i]?.type ?? 'none'}`);
};

/** Space between two blocks: at least one empty paragraph or divider between them, and nothing else. */
export const gapBetween = (doc: string, first: RegExp, second: RegExp): Check => (r) => {
  const blocks = r.afterBlocks[doc] ?? [];
  const a = blocks.findIndex((b) => first.test(b.content));
  const b = blocks.findIndex((x) => second.test(x.content));
  const between = a >= 0 && b > a ? blocks.slice(a + 1, b) : [];
  const spaceOnly = between.every((x) => x.type === 'divider' || (x.type === 'paragraph' && x.content.trim() === ''));
  return behaviour(`“${doc}” has space between ${first} and ${second}`, between.length > 0 && spaceOnly, a < 0 || b <= a ? 'blocks not found in that order' : `${between.length} block(s) between: ${between.map((x) => x.type).join(', ') || 'none'}`);
};
