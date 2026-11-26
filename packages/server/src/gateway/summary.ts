import type { ChatMessage, Operation, ProviderAdapter, ProviderResult, StoredTurn } from '@edw/shared';

/**
 * The running summary of a thread's older turns (Pi's compaction). Once more than
 * `history.max_turns` turns are past the summary, the oldest are folded into it in one go,
 * leaving the last `keep_turns` verbatim; so the summary changes every few turns, not every
 * turn, and the history in between only grows (which the provider's prompt cache likes).
 *
 * `summariseTurns` asks the model for a structured summary (fixed headings, as Pi's), updating
 * the previous one. `updateRunningSummary` is the deterministic fallback, one line per turn,
 * used when the config says `"summary": "lines"` or when the model call fails.
 */
export const SUMMARY_MAX_CHARS = 2000;
/** A model summary longer than this is cut (it is asked for far less). */
export const MODEL_SUMMARY_MAX_CHARS = 6000;
const SNIPPET_CHARS = 120;
const TURN_CHARS = 1500;
const OP_ORDER: Operation['op'][] = ['insert', 'replace', 'delete', 'move', 'create_doc', 'set_style'];

function snippet(text: string, max = SNIPPET_CHARS): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function opCounts(ops: Operation[]): string {
  const counts = new Map<string, number>();
  for (const o of ops) counts.set(o.op, (counts.get(o.op) ?? 0) + 1);
  const parts = OP_ORDER.filter((k) => counts.has(k)).map((k) => `${k} ${counts.get(k)}`);
  return parts.length ? parts.join(', ') : 'none';
}

export function updateRunningSummary(previous: string | null, trimmedTurns: StoredTurn[]): string | null {
  if (trimmedTurns.length === 0) return previous;
  const lines = previous ? previous.split('\n') : [];
  for (const t of trimmedTurns) {
    lines.push(`Teacher asked: ${snippet(t.prompt)}. Assistant: ${snippet(t.response_text)}; ops: ${opCounts(t.operations)}`);
  }
  while (lines.length > 1 && lines.join('\n').length > SUMMARY_MAX_CHARS) lines.shift();
  return lines.join('\n').slice(-SUMMARY_MAX_CHARS);
}

/** The system prompt of a summary call. Its headings are what the assistant later reads. */
export const SUMMARY_SYSTEM_PROMPT = `You summarise a conversation between a teacher and an assistant that helps them write and adapt classroom documents (worksheets, texts, questions). The summary replaces the older part of the conversation: the assistant will read it, followed by the most recent turns and the documents as they are now, and must be able to carry on as if it remembered everything that matters.

Write the summary in exactly these sections, as Markdown, in this order:

## Teacher's goal
What the teacher is trying to make or achieve, in one to three bullets.

## Class and constraints
The class (year group, subject, topic), learners' needs (reading levels, additional support needs, EAL), and the teacher's preferences and rules about style, length, layout and wording. Keep the teacher's own words for anything they were specific about.

## Done
What has been written or changed, and in which document, as short bullets. Say when the teacher accepted, rejected or reworked a suggestion.

## Open requests
Anything asked for that is not done yet, or that the teacher wants to come back to. Write "None." if there is nothing.

## Key context
Names, terms, examples, facts and decisions that must be kept exactly (e.g. the novel being read, a word list, an agreed format).

Rules: be specific and brief (under 400 words in all). Do not invent anything. Do not copy document text beyond a short phrase; the documents themselves are shown separately. Answer with the summary only.`;

function turnText(t: StoredTurn): string {
  const about = t.anchor ? ` (about the passage "${snippet(t.anchor.quote ?? '', 200)}")` : '';
  const edits = t.operations.length ? `\n[Suggested edits: ${opCounts(t.operations)}]` : '';
  return `Teacher${about}: ${snippet(t.prompt, TURN_CHARS)}\nAssistant: ${snippet(t.response_text, TURN_CHARS)}${edits}`;
}

/** The one user message of a summary call: the previous summary (if any) and the turns to fold in. */
export function summaryMessages(previous: string | null, turns: StoredTurn[]): ChatMessage[] {
  const parts = previous
    ? [
        'Here is the summary of the conversation so far, then the turns that came after it. Update the summary: keep everything in it that still matters, add what the new turns change (move finished requests to Done), and drop nothing the teacher said about their class or preferences.',
        '',
        '<summary>',
        previous,
        '</summary>',
      ]
    : ['Summarise these turns of the conversation.'];
  return [{ role: 'user', content: [...parts, '', '<conversation>', turns.map(turnText).join('\n\n'), '</conversation>'].join('\n') }];
}

/** A model-written summary of `previous` plus `turns`, and the call's result for the gateway log. */
export async function summariseTurns(provider: ProviderAdapter, previous: string | null, turns: StoredTurn[], signal?: AbortSignal): Promise<{ summary: string; raw: ProviderResult; messages: ChatMessage[] }> {
  const messages = summaryMessages(previous, turns);
  const raw = await provider.complete(messages, SUMMARY_SYSTEM_PROMPT, signal);
  const summary = raw.text.trim().slice(0, MODEL_SUMMARY_MAX_CHARS);
  if (!summary) throw new Error('the summary call returned no text');
  return { summary, raw, messages };
}

/**
 * Which turns a call sends verbatim, and which it must first fold into the summary.
 * `covered`: how many of the thread's oldest turns the stored summary already covers.
 */
export function planHistory(history: StoredTurn[], covered: number, maxTurns: number, keepTurns: number): { fold: StoredTurn[]; kept: StoredTurn[]; covered: number } {
  const done = Math.min(Math.max(0, covered), history.length);
  const rest = history.slice(done);
  if (rest.length <= maxTurns) return { fold: [], kept: rest, covered: done };
  const keep = Math.min(Math.max(0, keepTurns), maxTurns);
  const cut = rest.length - keep;
  return { fold: rest.slice(0, cut), kept: rest.slice(cut), covered: done + cut };
}
