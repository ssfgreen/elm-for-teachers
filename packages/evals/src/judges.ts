/**
 * Deterministic checks on an EvalRun (Pi's "deterministic grading"). Each returns a named
 * result; a failed check is data for the report, not a crashed suite. `behaviour` checks say
 * whether the assistant did the right thing; `budget` checks whether it stayed within cost.
 */
import type { DocStyle } from '@edw/shared';
import type { EvalRun } from './harness.js';

export interface CheckResult {
  name: string;
  kind: 'behaviour' | 'budget';
  pass: boolean;
  detail?: string;
}

export type Check = (run: EvalRun) => CheckResult;

const behaviour = (name: string, pass: boolean, detail?: string): CheckResult => ({ name, kind: 'behaviour', pass, ...(detail ? { detail } : {}) });

/* ---------------------------------------------------------------- outcome */

export const succeeded: Check = (r) => behaviour('succeeded', r.ok, r.ok ? undefined : r.message);

export const usedTool = (name: string): Check => (r) => {
  const used = r.toolCalls.filter((c) => c.name === name).length;
  return behaviour(`used ${name}`, used > 0, `${used} call(s)`);
};

export const didNotUseTool = (name: string): Check => (r) => {
  const used = r.toolCalls.filter((c) => c.name === name).length;
  return behaviour(`did not use ${name}`, used === 0, `${used} call(s)`);
};

export const noEdits: Check = (r) => behaviour('made no edits', r.operations.length === 0, `${r.operations.length} operation(s)`);

export const edited: Check = (r) => behaviour('made edits', r.operations.length > 0, `${r.operations.length} operation(s)`);

/** Only these operation kinds, e.g. `['replace']` for a targeted fix. */
export const onlyOps = (...ops: string[]): Check => (r) => {
  const used = [...new Set(r.operations.map((o) => o.op))];
  return behaviour(`only ${ops.join('/')} operations`, used.every((o) => ops.includes(o)), used.join(',') || 'none');
};

export const opsAtMost = (max: number): Check => (r) => behaviour(`at most ${max} operation(s)`, r.operations.length <= max, `${r.operations.length}`);

/** No tool call the harness had to refuse, and nothing dropped when the turn was applied. */
export const noRejectedEdits: Check = (r) => {
  const rejected = r.steps.flatMap((s) => s.tools).filter((t) => t.name === 'edit_document' && /"dropped":\[\{/.test(t.output)).length;
  return behaviour('no edits rejected', rejected === 0 && r.droppedAtApply === 0, `${rejected} call(s) with drops, ${r.droppedAtApply} dropped at apply`);
};

/* ---------------------------------------------------------------- documents */

/** What is in the doc straight after the turn, before any suggestion is accepted (Editing mode). */
export const liveMatches = (name: string, re: RegExp): Check => (r) => behaviour(`“${name}” has ${re} in it at once`, re.test(r.liveAfter[name] ?? ''));

export const liveDoesNotMatch = (name: string, re: RegExp): Check => (r) => behaviour(`“${name}” does not have ${re} in it at once`, !re.test(r.liveAfter[name] ?? ''));

/** Whether the assistant said the teacher asked to revise an earlier suggestion (Editing mode). */
export const marksRevision = (expected: boolean): Check => (r) => {
  const marked = r.operations.filter((o) => 'revises_suggestion' in o && o.revises_suggestion === true).length;
  return behaviour(expected ? 'marked revises_suggestion' : 'did not mark revises_suggestion', expected ? marked > 0 : marked === 0, `${marked} marked`);
};

/** How many blocks still have a suggestion waiting straight after the turn. */
export const waitingAfter = (n: number): Check => (r) => behaviour(`${n} suggestion(s) still waiting`, r.waitingAfter === n, `${r.waitingAfter}`);

const docOf = (r: EvalRun, name: string) => r.after[name] ?? '';

export const docMatches = (name: string, re: RegExp): Check => (r) => behaviour(`“${name}” matches ${re}`, re.test(docOf(r, name)));

export const docDoesNotMatch = (name: string, re: RegExp): Check => (r) => {
  const hits = docOf(r, name).match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) ?? [];
  return behaviour(`“${name}” has no ${re}`, hits.length === 0, hits.length ? `${hits.length} found, e.g. ${JSON.stringify(hits[0])}` : undefined);
};

export const docUnchanged = (name: string): Check => (r) => behaviour(`“${name}” unchanged`, r.before[name] === r.after[name]);

export const docChanged = (name: string): Check => (r) => behaviour(`“${name}” changed`, r.before[name] !== r.after[name]);

/** The doc's first non-empty line matches, e.g. its title. */
export const docStartsWith = (name: string, re: RegExp): Check => (r) => {
  const first = docOf(r, name).split('\n').find((l) => l.trim()) ?? '';
  return behaviour(`“${name}” starts with ${re}`, re.test(first), JSON.stringify(first.slice(0, 80)));
};

/** Lines matching `re` appear in this order (e.g. sections of a reordered doc). */
export const docInOrder = (name: string, res: RegExp[]): Check => (r) => {
  const lines = docOf(r, name).split('\n');
  const at = res.map((re) => lines.findIndex((l) => re.test(l)));
  return behaviour(`“${name}” in order`, at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]!), JSON.stringify(at));
};

/** Text that must survive the turn, e.g. teacher content an injected instruction asked to delete. */
export const docKeeps = (name: string, ...texts: string[]): Check => (r) => {
  const missing = texts.filter((t) => !docOf(r, name).includes(t));
  return behaviour(`“${name}” keeps its text`, missing.length === 0, missing.length ? `missing: ${missing.map((t) => JSON.stringify(t.slice(0, 40))).join(', ')}` : undefined);
};

export const createdDoc = (re: RegExp = /./): Check => (r) => behaviour(`created a doc ${re}`, r.createdDocs.some((d) => re.test(d)), r.createdDocs.join(', ') || 'none');

/** A doc created this turn whose name matches `name` (the model may name a copy as it likes) has text matching `re`. */
export const createdDocMatches = (name: RegExp, re: RegExp): Check => (r) => {
  const docs = r.createdDocs.filter((d) => name.test(d));
  return behaviour(`a new doc ${name} matches ${re}`, docs.some((d) => re.test(r.after[d] ?? '')), docs.join(', ') || 'no such doc');
};

export const createdNoDoc: Check = (r) => behaviour('created no doc', r.createdDocs.length === 0, r.createdDocs.join(', ') || undefined);

/** The doc's font and page colour after the turn (its suggestion accepted) include these. */
export const docStyled = (name: string, style: DocStyle): Check => (r) => {
  const got = r.afterStyle[name] ?? {};
  const pass = Object.entries(style).every(([k, v]) => got[k as keyof DocStyle] === v);
  return behaviour(`“${name}” styled ${JSON.stringify(style)}`, pass, JSON.stringify(got));
};

/** No font or page colour suggested. */
export const noStyleSuggested: Check = (r) => {
  const n = r.operations.filter((o) => o.op === 'set_style').length;
  return behaviour('suggested no style', n === 0, `${n} set_style`);
};

/** Content written as a markdown table: rows of | cells. */
const pipeRows = (content: string) => content.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l)).length;

/** A table block in the doc whose text matches every `re` (a grid, not text with bars). */
export const docHasTable = (name: string, ...res: RegExp[]): Check => (r) => {
  const tables = (r.afterBlocks[name] ?? []).filter((b) => b.type === 'table');
  return behaviour(`“${name}” has a table matching ${res.join(', ')}`, tables.some((t) => res.every((re) => re.test(t.content))), `${tables.length} table(s)`);
};

/** Each table in the doc that matches every `re` has a header row and at least `min` columns. */
export const docTableShaped = (name: string, min: number, ...res: RegExp[]): Check => (r) => {
  const tables = (r.afterBlocks[name] ?? []).filter((b) => b.type === 'table' && res.every((re) => re.test(b.content)));
  const shape = (c: string) => {
    const rows = c.split('\n').filter((l) => !/^<!--/.test(l.trim()));
    const header = rows.length > 1 && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(rows[1]!.trim());
    // As the editor draws it: every row as wide as the widest (an empty last cell may be trimmed).
    const cols = Math.max(...rows.filter((_, i) => i !== 1 || !header).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').length));
    return { header, cols };
  };
  const shapes = tables.map((t) => shape(t.content));
  const pass = shapes.length > 0 && shapes.every((s) => s.header && s.cols >= min);
  return behaviour(`“${name}” table has a header row and ${min}+ columns`, pass, JSON.stringify(shapes));
};

/** No table rows written into a block that is not a table (they show as text with bars). */
/** A list is a block per item: the doc has `n` blocks of this item type, and no whole-list block. */
export const listItems = (name: string, type: 'bullet_item' | 'numbered_item' | 'checklist_item', n: number): Check => (r) => {
  const blocks = r.afterBlocks[name] ?? [];
  const got = blocks.filter((b) => b.type === type).length;
  const whole = blocks.filter((b) => ['bullet_list', 'numbered_list', 'checklist'].includes(b.type)).length;
  return behaviour(`“${name}” has ${n} ${type} block(s) and no whole-list block`, got === n && whole === 0, `${got} item(s), ${whole} whole list(s)`);
};

export const noTableAsText = (name: string): Check => (r) => {
  const bad = (r.afterBlocks[name] ?? []).filter((b) => b.type !== 'table' && b.type !== 'code_block' && pipeRows(b.content) >= 2);
  return behaviour(`“${name}” has no table written as text`, bad.length === 0, bad.map((b) => b.type).join(', ') || undefined);
};

/* ---------------------------------------------------------------- comments */

/** New comment threads the model started (with add_comment), at least `min`. */
export const startedComments = (min = 1): Check => (r) => {
  const n = r.modelComments.filter((c) => c.root).length;
  return behaviour(`started at least ${min} comment thread(s)`, n >= min, `${n}`);
};

/** Replies the model wrote in existing threads (its reply to an @model comment counts), at least `min`. */
export const repliedInThreads = (min = 1): Check => (r) => {
  const n = r.modelComments.filter((c) => !c.root).length;
  return behaviour(`replied in at least ${min} thread(s)`, n >= min, `${n}`);
};

export const commentOn = (blockKey: string): Check => (r) => behaviour(`commented on block “${blockKey}”`, r.modelComments.some((c) => c.root && c.onBlock === blockKey), r.modelComments.map((c) => c.onBlock).join(', ') || 'none');

/** How many pictures the turn took from ARASAAC: at least one, or none (it drew instead). */
export const usedLibraryPicture: Check = (r) => behaviour('used a picture from ARASAAC', r.pictures > 0, `${r.pictures}`);
export const noLibraryPicture: Check = (r) => behaviour('used no picture from ARASAAC', r.pictures === 0, `${r.pictures}`);

export const noModelComments: Check = (r) => behaviour('wrote no comments', r.modelComments.length === 0, `${r.modelComments.length}`);

/* ---------------------------------------------------------------- the summary */

/** Older turns were folded into the summary by a model call that worked, and the summary says what `re` looks for. */
export const summaryMatches = (re: RegExp): Check => (r) =>
  behaviour(`summary matches ${re}`, r.summaryCall?.error === null && re.test(r.summary ?? ''), r.summaryCall ? (r.summaryCall.error ?? JSON.stringify((r.summary ?? '').slice(0, 160))) : 'no summary call');

/* ---------------------------------------------------------------- the reply */

export const messageMatches = (re: RegExp): Check => (r) => behaviour(`reply matches ${re}`, re.test(r.message), JSON.stringify(r.message.slice(0, 120)));

/** The reply cites a pedagogy claim (`[[clm-…]]`) whose id matches; the server has already taken out any not retrieved. */
export const citesClaim = (re: RegExp = /^clm-/): Check => (r) => {
  const ids = [...r.message.matchAll(/\[\[(clm-[A-Za-z0-9-]+)\]\]/g)].map((m) => m[1]!);
  return behaviour(`cites a claim ${re}`, ids.some((id) => re.test(id)), ids.join(', ') || 'none');
};

/** Some doc, after the turn, has this font or page colour (a new doc's name is the model's choice). */
export const someDocStyled = (style: DocStyle): Check => (r) => {
  const pass = Object.values(r.afterStyle).some((got) => Object.entries(style).every(([k, v]) => got[k as keyof DocStyle] === v));
  return behaviour(`a doc styled ${JSON.stringify(style)}`, pass, JSON.stringify(r.afterStyle));
};

/** No doc made or changed this turn matches. */
export const noChangedDocMatches = (re: RegExp): Check => (r) => {
  const hits = Object.entries(r.after).filter(([name, text]) => r.before[name] !== text && re.test(text)).map(([name]) => name);
  return behaviour(`no changed doc matches ${re}`, hits.length === 0, hits.join(', ') || undefined);
};

export const messageDoesNotMatch = (re: RegExp): Check => (r) => behaviour(`reply has no ${re}`, !re.test(r.message), JSON.stringify(r.message.slice(0, 120)));

/** A clarifying question: the reply asks something and nothing is edited. */
export const asksQuestion: Check = (r) => behaviour('asks a question instead of editing', r.message.includes('?') && r.operations.length === 0, JSON.stringify(r.message.slice(0, 120)));

/* ---------------------------------------------------------------- budgets */

export interface Budget {
  /** Model calls for the message. */
  steps?: number;
  /** Input tokens not served from the cache, summed over the calls. */
  uncachedInput?: number;
  output?: number;
  latencyMs?: number;
}

/** Defaults sized from the replay of a real workshop (17 messages: at most 3 calls, ~2k uncached input). */
export const DEFAULT_BUDGET: Required<Budget> = { steps: 3, uncachedInput: 6000, output: 3000, latencyMs: 45_000 };

export function budgetChecks(budget: Budget = {}): Check[] {
  const b = { ...DEFAULT_BUDGET, ...budget };
  const check = (name: string, value: (r: EvalRun) => number, max: number): Check => (r) => {
    const v = value(r);
    return { name: `${name} ≤ ${max}`, kind: 'budget', pass: v <= max, detail: `${v}` };
  };
  return [
    check('model calls', (r) => r.steps.length, b.steps),
    check('uncached input tokens', (r) => r.usage.uncached, b.uncachedInput),
    check('output tokens', (r) => r.usage.output, b.output),
    check('time ms', (r) => r.latencyMs, b.latencyMs),
  ];
}
