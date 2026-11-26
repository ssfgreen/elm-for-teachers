import { isListItem, itemNumbers, parseItem, writeItem, type Block, type ChatMessage, type Doc, type DocStyle, type StoredTurn } from '@edw/shared';

/**
 * Prompt assembly for one chat turn, scoped to one thread.
 *
 * Layout of one call:
 *   system   : the system prompt, verbatim.
 *   messages : 1. system  "Summary of earlier conversation: ..." (when older turns were folded
 *                         into the running summary).
 *              2. the thread's completed turns after those (service.ts picks them), as user
 *                 (the teacher's prompt) and assistant (`rewritten_assistant_content`) pairs.
 *              3. user    "## Documents", this thread's docs serialised (the open one marked),
 *                         a `---` line, for an @model comment one line naming the block and
 *                         quote, then "Teacher: <currentPrompt>".
 *
 * The docs sit in the final message, next to the prompt, so the model reads the
 * authoritative state last. `history` holds completed turns only, not the one being answered.
 */
export interface BuildPromptInput {
  systemPrompt: string;
  /** This thread's docs and their blocks; nothing from other threads. */
  docs: Doc[];
  blocks: Block[];
  /** The doc the teacher has open. */
  openDocId: string;
  /** The completed turns sent verbatim, oldest first. */
  history: StoredTurn[];
  /** The summary of the turns before `history`, or null when there are none. */
  runningSummary: string | null;
  currentPrompt: string;
  /** The block the teacher's message is about (@model comment), or null. */
  anchor?: { block_id: string; type: string; quote: string | null } | null;
}

export interface BuiltPrompt {
  system: string;
  messages: ChatMessage[];
}

/** Splits history into the turns sent verbatim and the older turns that were trimmed. */
export function splitHistory(history: StoredTurn[], maxTurns: number): { kept: StoredTurn[]; trimmed: StoredTurn[] } {
  const keep = Math.max(0, Math.floor(maxTurns));
  const cut = Math.max(0, history.length - keep);
  return { kept: history.slice(cut), trimmed: history.slice(0, cut) };
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const messages: ChatMessage[] = [];

  if (input.runningSummary) {
    messages.push({ role: 'system', content: `Summary of earlier conversation:\n\n${input.runningSummary}` });
  }
  for (const t of input.history) {
    messages.push({ role: 'user', content: t.prompt });
    messages.push({ role: 'assistant', content: t.rewritten_assistant_content });
  }

  const about = input.anchor
    ? `The teacher is commenting on block [id=${input.anchor.block_id}] (${input.anchor.type})` +
      (input.anchor.quote ? ` and selected the text "${input.anchor.quote}"` : '') +
      `. Make the change there unless they ask otherwise.\n\n`
    : '';
  messages.push({
    role: 'user',
    content: `## Documents\n\n${serializeCanvas(input.blocks, input.docs, input.openDocId)}\n\n---\n\n${about}Teacher: ${input.currentPrompt}`,
  });

  return { system: input.systemPrompt, messages };
}

const INDENT = '   ';

/**
 * Serialises docs and their blocks: the open doc first, then the others oldest first (ties
 * by id). Live blocks, and the model's suggestions the teacher has not yet decided on:
 * a suggested block is marked `[suggested]`, a suggested change to a live block follows it
 * on its own line (`(suggested, not yet accepted: …)`). Rejected and deleted blocks are
 * omitted. Empty docs show `(empty)`. Continuation lines of multi-line content are indented
 * by three spaces. A numbered list item shows the number the teacher sees (its run counts on from
 * its first item). Waiting changes to items next to each other that came from one turn say so
 * (`one suggestion with blocks 3, 4`): a suggestion on a list is on its items. A doc's font and page colour follow its heading when either is set or
 * suggested. Output is deterministic for a given set of inputs.
 */
const styleText = (s: DocStyle) => [s.font && `font=${s.font}`, s.background && `background=${s.background}`].filter(Boolean).join(', ');

/**
 * For each block, the other blocks (indexes) whose waiting change is the same suggestion: list
 * items next to each other with a change waiting (or suggested new) from the same turn.
 */
function oneSuggestion(blocks: readonly Block[]): Array<number[] | undefined> {
  const turnOf = (b: Block) => (b.status === 'live' && b.pending ? b.pending.turn_id : b.status === 'proposed' ? b.origin_turn : null);
  const out: Array<number[] | undefined> = [];
  let run: number[] = [];
  const close = () => {
    const byTurn = new Map<string, number[]>();
    for (const i of run) {
      const t = turnOf(blocks[i]!);
      if (t) (byTurn.get(t) ?? byTurn.set(t, []).get(t)!).push(i);
    }
    for (const group of byTurn.values()) if (group.length > 1) for (const i of group) out[i] = group.filter((k) => k !== i);
    run = [];
  };
  blocks.forEach((b, i) => {
    if (isListItem(b.type)) run.push(i);
    else close();
  });
  close();
  return out;
}

export function serializeCanvas(blocks: Block[], docs: Doc[], openDocId: string): string {
  const ordered = [...docs].sort((a, b) =>
    a.id === openDocId ? -1 : b.id === openDocId ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1,
  );
  const sections: string[] = [];
  for (const d of ordered) {
    const lines = [`## Document: ${d.name} (id: ${d.id}${d.id === openDocId ? '; open' : ''})`];
    if (d.style?.font || d.style?.background) lines.push(`Style: ${styleText(d.style)}`);
    if (d.proposed_style) lines.push(`(suggested style, not yet accepted: ${styleText(d.proposed_style.style)})`);
    const dBlocks = blocks.filter((b) => b.doc_id === d.id && (b.status === 'live' || b.status === 'proposed')).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    if (dBlocks.length === 0) lines.push('(empty)');
    const indent = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').join(`\n${INDENT}`);
    const numbers = itemNumbers(dBlocks);
    const shown = (b: Block, i: number, content: string) => (numbers[i] === null ? content : writeItem('numbered_item', { ...parseItem('numbered_item', content), number: numbers[i]! }));
    const together = oneSuggestion(dBlocks);
    const withOthers = (i: number) => (together[i]?.length ? `one suggestion with blocks ${together[i]!.map((k) => k + 1).join(', ')}` : '');
    dBlocks.forEach((b, i) => {
      const also = withOthers(i);
      const suggested = b.status === 'proposed' ? ` [suggested]${also ? ` (${also})` : ''}` : '';
      lines.push(`${i + 1}. [id=${b.id}] [type=${b.type}]${suggested} ${indent(shown(b, i, b.content))}`);
      if (b.status === 'live' && b.pending) {
        const what = b.pending.op === 'replace' ? `replace with: ${indent(shown(b, i, b.pending.content))}` : b.pending.op === 'delete' ? 'delete this block' : `move after ${b.pending.after}`;
        lines.push(`${INDENT}(suggested, not yet accepted: ${what}${also ? `; ${also}` : ''})`);
      }
    });
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}
