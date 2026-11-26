/**
 * `text_events.jsonl`: one line per change to a block's text, in the shape of the
 * CoAuthor dataset (Lee et al., CHI 2022) so the same replay and analysis code
 * applies: `eventName`, `eventSource`, `eventTimestamp` (epoch ms), `eventNum`,
 * `textDelta.ops` (retain/insert/delete over the block's markdown, counted in code
 * points). Unlike CoAuthor the document is a set of blocks, so every line names
 * its `block_id` and `doc_id` and deltas are relative to that block.
 *
 * Sources, merged in log order:
 *  - teacher typing: each edit inside a canvas `keystroke_batch`;
 *  - everything else that changes text (inserts, splits, merges, retypes, model
 *    proposals, accepted replacements, version copies): the stored revision,
 *    as a delta from the replayed text to the revision's text;
 *  - `block_structure` events, as `block-<action>` lines with no delta.
 * Revisions a keystroke batch caused and the teacher authored are not repeated:
 * the batch's edits already carry them. The exception is typing inside the assistant's
 * suggested change to a block (a batch with `live_after`, from 7 Nov 2026): its edits are over
 * the suggested text, not the block's own, so the block's live revision is the line instead.
 *
 * The replay is checked as it is built. If a batch's edits do not reproduce its
 * `content_after` (or a batch predates per-edit logging), a `text-resync` line
 * with the correcting delta follows, so replaying the file always ends on the
 * stored text; the counts go in MANIFEST.json.
 */
import {
  applyText,
  diffText,
  TextOpError,
  textEventName,
  type Block,
  type BlockContent,
  type BlockRevision,
  type Event,
  type TextOp,
} from '@edw/shared';

export interface TextEventLine {
  eventNum: number;
  eventName: string;
  eventSource: 'user' | 'model' | 'system';
  eventTimestamp: number;
  /** Event-log sequence number this line belongs to. */
  seq: number;
  /** The thread the teacher had open when the change happened (null if unknown). */
  thread_id: string | null;
  block_id: string;
  doc_id: string | null;
  textDelta?: { ops: TextOp[] };
    /** Revision-derived lines: who wrote it and what caused it. */
  actor?: string;
  cause?: string;
  /** block-* lines: the structure payload. */
  detail?: unknown;
}

export interface TextEventStats {
  lines: number;
  /** Batches whose edits did not reproduce content_after (or had none) and were corrected. */
  resyncs: number;
  /** Revisions whose cause event is not in the log (structural changes before 29 Oct 2026), placed by time. */
  unresolved_causes: number;
  /** Blocks whose replayed text differs from the stored block at the end. Should be 0. */
  final_mismatches: number;
}

type Content = { content: string };
const EMPTY: Content = { content: '' };

const sourceOf = (actor: string): 'user' | 'model' => (actor === 'teacher' ? 'user' : 'model');

export function buildTextEvents(events: Event[], revisions: BlockRevision[], blocks: Block[]): { lines: TextEventLine[]; stats: TextEventStats } {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const byId = new Map(ordered.map((e) => [e.event_id, e]));
  const docOf = new Map(blocks.map((b) => [b.id, b.doc_id]));
  const lastSeq = ordered.at(-1)?.seq ?? 0;

  // Revisions grouped under the seq of the event that caused them.
  let unresolved = 0;
  const revsAt = new Map<number, { rev: BlockRevision; cause: Event | undefined }[]>();
  for (const rev of revisions) {
    const cause = byId.get(rev.cause_event_id);
    let seq: number;
    if (cause) seq = cause.seq;
    else {
      unresolved++;
      // The cause was written in the same transaction, just after its revisions.
      const at = Date.parse(rev.at);
      seq = ordered.find((e) => Date.parse(e.server_ts) >= at)?.seq ?? lastSeq + 1;
    }
    const list = revsAt.get(seq) ?? [];
    list.push({ rev, cause });
    revsAt.set(seq, list);
  }
  for (const list of revsAt.values()) list.sort((a, b) => a.rev.block_id.localeCompare(b.rev.block_id) || a.rev.version - b.rev.version);

  const state = new Map<string, Content>();
  const lines: TextEventLine[] = [];
  let resyncs = 0;
  const push = (l: Omit<TextEventLine, 'eventNum'>) => lines.push({ eventNum: lines.length + 1, ...l });

  const applyRevisions = (seq: number, threadId: string | null) => {
    for (const { rev, cause } of revsAt.get(seq) ?? []) {
      // The teacher's own typing is already in the batch's edits.
      if (cause?.kind === 'keystroke_batch' && rev.actor === 'teacher' && !inSuggestedChange(cause)) continue;
      const cur = state.get(rev.block_id) ?? EMPTY;
      const ops = diffText(cur.content, rev.after.content);
      const line: Omit<TextEventLine, 'eventNum'> = {
        eventName: textEventName(ops),
        eventSource: sourceOf(rev.actor),
        eventTimestamp: Date.parse(rev.at),
        seq,
        thread_id: cause?.thread_id ?? threadId,
        block_id: rev.block_id,
        doc_id: docOf.get(rev.block_id) ?? null,
        textDelta: { ops },
        actor: rev.actor,
        cause: cause?.kind ?? 'unresolved',
      };
      push(line);
      state.set(rev.block_id, { ...rev.after });
    }
  };

  for (const e of ordered) {
    if (e.kind === 'block_structure') {
      const p = e.payload as { block_id?: string; action?: string };
      push({
        eventName: `block-${p.action ?? 'change'}`,
        eventSource: 'user',
        eventTimestamp: Date.parse(e.client_ts ?? e.server_ts),
        seq: e.seq,
        thread_id: e.thread_id,
        block_id: p.block_id ?? '',
        doc_id: p.block_id ? (docOf.get(p.block_id) ?? null) : null,
        detail: e.payload,
      });
    }
    // Model revisions a batch caused (accepting a pending replace by typing) come before its edits.
    applyRevisions(e.seq, e.thread_id);

    if (e.kind !== 'keystroke_batch') continue;
    const p = e.payload as { target: { kind: string; block_id?: string }; edits?: { t: number; ops: TextOp[] }[]; content_after?: BlockContent };
    if (p.target.kind !== 'block' || !p.target.block_id || !p.content_after || inSuggestedChange(e)) continue;
    const id = p.target.block_id;
    const s: Content = { ...(state.get(id) ?? EMPTY) };
    let broken = !p.edits;
    for (const edit of p.edits ?? []) {
      try {
        s.content = applyText(s.content, edit.ops);
      } catch (err) {
        if (!(err instanceof TextOpError)) throw err;
        broken = true;
        break;
      }
      const line: Omit<TextEventLine, 'eventNum'> = {
        eventName: textEventName(edit.ops),
        eventSource: 'user',
        eventTimestamp: edit.t,
        seq: e.seq,
        thread_id: e.thread_id,
        block_id: id,
        doc_id: docOf.get(id) ?? null,
        textDelta: { ops: edit.ops },
      };
      push(line);
    }
    const want = p.content_after;
    if (broken || s.content !== want.content) {
      resyncs++;
      // `s` is the text after the last edit that applied, which is what the lines written so far replay to.
      push({
        eventName: 'text-resync',
        eventSource: 'system',
        eventTimestamp: Date.parse(p.edits ? e.client_ts : e.server_ts),
        seq: e.seq,
        thread_id: e.thread_id,
        block_id: id,
        doc_id: docOf.get(id) ?? null,
        textDelta: { ops: diffText(s.content, want.content) },
      });
    }
    state.set(id, { ...want });
  }
  // Revisions placed after the last event.
  applyRevisions(lastSeq + 1, null);

  let final_mismatches = 0;
  // A pending replace is not a revision, so the stored content is still the one to match.
  for (const b of blocks) {
    const s = state.get(b.id) ?? EMPTY;
    if (s.content !== b.content) final_mismatches++;
  }
  return { lines, stats: { lines: lines.length, resyncs, unresolved_causes: unresolved, final_mismatches } };
}

/** Replay a text_events stream to the text of every block: what an analysis script does. */
export function replayTextEvents(lines: TextEventLine[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of lines) {
    if (!l.textDelta) continue;
    out.set(l.block_id, applyText(out.get(l.block_id) ?? '', l.textDelta.ops));
  }
  return out;
}

/** A batch typed inside a suggested change to a block: its edits are over the suggested text. */
function inSuggestedChange(e: Event): boolean {
  return e.kind === 'keystroke_batch' && !!(e.payload as { live_after?: unknown }).live_after;
}
