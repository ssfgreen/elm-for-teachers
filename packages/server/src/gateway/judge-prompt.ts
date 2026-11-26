/**
 * What the Spyglass judge is told (docs/spyglass.md, Part 4): its system prompt, its one tool, and
 * the turn written out for it. Code has already found the facts (turn-effect.ts); each is given a
 * reference (E1, E2, ...) so the judge names facts, never block ids it could invent.
 *
 * So far the scope check only: neighbours and the coherence check come with step 5.
 */
import type { EffectItem, ToolSpec, TurnEffect } from '@edw/shared';

export const JUDGE_TOOL_NAME = 'report_flags';

/** The system prompt: each check's question and what a teacher relies on, not rules for cases. */
export const JUDGE_SYSTEM_PROMPT = `You check one turn of an assistant that edits teachers' worksheets. Code has already worked out exactly what the turn did, as a numbered list of findings (E1, E2, ...). Your job is to judge which of them the teacher should look at before using the work.

The question: did the turn do only what the teacher asked? Flag a finding when the teacher's request did not call for it and a teacher would care: it changes what the work is for (a learning intention, success criteria), what pupils are asked to do (an instruction, a question, a task), how it is marked (an answer, a marking cue, a mark scheme), how long it takes, or a fact pupils will learn. Something left out of a copy counts, unless the teacher asked for it to go. A block added twice counts. Text typed out from a suggestion the teacher had not accepted counts.

Do not flag what the request asked for, even when it changed a lot: "make it shorter" covers cutting words; "add an extension" covers the extension. Do not flag layout, spacing or wording that keeps the meaning. When the turn did only what was asked, report no flags.

Report with ${JUDGE_TOOL_NAME}, most important first. Each flag names its findings by reference and a label. Teachers skim these between tasks, so write very little:
- title: 2 to 5 words saying what changed, in the teacher's terms, naming the thing (e.g. "Answer 6 now Simile", "Learning intention dropped", "Task 2 heading twice"). Not "Content changed" or "Paragraph edited".
- why: at most 12 words on what it means for the lesson (e.g. "Pupils would be marked against the wrong answer."). No quotes from the text, no repeating the title.
Write in British English.`;

/** The labels the scope check gives; the tool's enum and the answer's parser both use these. */
export const JUDGE_LABELS = ['removed', 'changed', 'added', 'duplicated', 'built_on_suggestion'] as const;

export const JUDGE_TOOL: ToolSpec = {
  name: JUDGE_TOOL_NAME,
  description: 'Report the findings the teacher should look at, most important first. An empty list when the turn did only what was asked.',
  parameters: {
    type: 'object',
    properties: {
      flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            findings: { type: 'array', items: { type: 'string' }, description: 'References of the findings this flag is about, e.g. ["E2"].' },
            label: { type: 'string', enum: [...JUDGE_LABELS] },
            title: { type: 'string', description: '2 to 5 words naming what changed, e.g. "Answer 6 now Simile".' },
            why: { type: 'string', description: 'At most 12 words on what it means for the lesson.' },
          },
          required: ['findings', 'label', 'title', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['flags'],
    additionalProperties: false,
  },
};

export interface JudgeDoc {
  id: string;
  name: string;
  /** The doc this one was copied from this turn. */
  copy_of?: string;
}

export interface JudgeCase {
  prompt: string;
  reply: string;
  effect: TurnEffect;
  docs: readonly JudgeDoc[];
}

/** A finding the judge can name, with the blocks a flag on it points at. */
export interface Finding {
  ref: string;
  item: EffectItem;
  block_ids: string[];
}

const MAX_TEXT = 400;
const quote = (t: string) => JSON.stringify(t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t);

/** The findings the judge sees: everything but formatting and moves, in document order. */
export function findingsOf(effect: TurnEffect): Finding[] {
  return effect.items
    .filter((i) => i.kind !== 'formatting' && i.kind !== 'moved')
    .map((item, k) => ({
      ref: `E${k + 1}`,
      item,
      block_ids: item.kind === 'duplicated' ? item.block_ids : item.kind === 'changed' ? [item.to] : [item.block_id],
    }));
}

function line(f: Finding): string {
  const i = f.item;
  switch (i.kind) {
    case 'removed':
      return `${f.ref} removed${i.from_copy ? ' (left out of the copy)' : ''}: ${quote(i.text)}`;
    case 'changed':
      if (i.rows?.length) {
        const rows = i.rows.map((r) => (r.change === 'changed' ? `row ${r.number ?? '?'}: ${quote(r.before)} → ${quote(r.after)}` : r.change === 'removed' ? `row ${r.number ?? '?'} removed: ${quote(r.before)}` : `row added: ${quote(r.after)}`));
        return `${f.ref} table changed:\n   ${rows.join('\n   ')}`;
      }
      return `${f.ref} changed: ${quote(i.before)} → ${quote(i.after)}`;
    case 'added':
      return `${f.ref} added: ${quote(i.text)}`;
    case 'duplicated':
      return `${f.ref} the same text ${i.block_ids.length} times: ${quote(i.text)}`;
    case 'built_on_suggestion':
      return `${f.ref} added from a suggestion the teacher has not accepted: ${quote(i.text)}`;
    default:
      return '';
  }
}

/** The user message: the request, the reply, then the findings doc by doc. */
export function judgeMessage(c: JudgeCase, findings: readonly Finding[]): string {
  const names = new Map(c.docs.map((d) => [d.id, d]));
  const docName = (id: string) => {
    const d = names.get(id);
    if (!d) return 'a document';
    const source = d.copy_of ? names.get(d.copy_of) : undefined;
    return `"${d.name}"${source ? ` (a copy of "${source.name}", made this turn)` : c.effect.created_doc_ids.includes(id) ? ' (new this turn)' : ''}`;
  };
  const out = [`The teacher asked: ${quote(c.prompt)}`, `The assistant replied: ${quote(c.reply)}`, '', 'What the turn did:'];
  let doc: string | null = null;
  for (const f of findings) {
    if (f.item.doc_id !== doc) {
      doc = f.item.doc_id;
      out.push(`In ${docName(doc)}:`);
    }
    out.push(line(f));
  }
  // A copied block that was then changed is listed as changed, not counted again here.
  const changedTo = new Set(c.effect.items.flatMap((i) => (i.kind === 'changed' || i.kind === 'formatting' ? [i.to] : [])));
  const moved = c.effect.items.filter((i) => i.kind === 'moved' && !changedTo.has(i.to)).length;
  const formatting = c.effect.items.filter((i) => i.kind === 'formatting').length;
  if (moved || formatting) out.push('', `Not listed: ${moved} block(s) copied or moved unchanged, ${formatting} formatting change(s).`);
  return out.join('\n');
}
