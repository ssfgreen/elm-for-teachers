/**
 * A turn's docs as the model saw them (a gateway call's `serialized_canvas`, gateway/prompt.ts)
 * back into blocks and docs: the state a turn started from, for the turn's effect. Suggestions
 * come back as an earlier turn's (`t_earlier`): a block marked `[suggested]` is a proposed block,
 * and a `(suggested, not yet accepted: ...)` line is the waiting change on the block above it.
 */
import { BlockType, DocStyle, type Block, type Doc } from '@edw/shared';

export const EARLIER_TURN = 't_earlier';
const AT = '2026-11-01T00:00:00.000Z';
const INDENT = '   ';

function styleOf(text: string): DocStyle {
  const style: Record<string, string> = {};
  for (const part of text.split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (k && v) style[k] = v;
  }
  return DocStyle.parse(style);
}

const unbracket = (text: string) => text.replace(/(?:; one suggestion with blocks [\d, ]+)?\)$/, '');

export function parseSnapshot(text: string, sessionId: string, threadId: string): { blocks: Block[]; docs: Doc[]; openDocId: string | null } {
  const blocks: Block[] = [];
  const docs: Doc[] = [];
  let openDocId: string | null = null;
  let doc: Doc | null = null;
  /** The field continuation lines add to: the last block's content, or its waiting replacement. */
  let into: { block: Block; pending: boolean } | null = null;
  for (const line of text.split('\n')) {
    const d = /^## Document: (.*) \(id: ([^;)]+)(; open)?\)$/.exec(line);
    if (d) {
      doc = { id: d[2]!, session_id: sessionId, thread_id: threadId, name: d[1]!, created_by: 'teacher', created_at: new Date(Date.parse(AT) + docs.length).toISOString() };
      docs.push(doc);
      if (d[3]) openDocId = doc.id;
      into = null;
      continue;
    }
    if (!doc) continue;
    const style = /^Style: (.*)$/.exec(line);
    if (style) {
      doc.style = styleOf(style[1]!);
      continue;
    }
    const proposed = /^\(suggested style, not yet accepted: (.*)\)$/.exec(line);
    if (proposed) {
      doc.proposed_style = { style: styleOf(proposed[1]!), turn_id: EARLIER_TURN };
      continue;
    }
    const b = /^\d+\. \[id=([^\]]+)\] \[type=([^\]]+)\]( \[suggested\](?: \(one suggestion with blocks [\d, ]+\))?)? ?(.*)$/.exec(line);
    if (b) {
      const suggested = !!b[3];
      const block: Block = {
        id: b[1]!,
        session_id: sessionId,
        doc_id: doc.id,
        type: BlockType.parse(b[2]),
        content: b[4]!,
        origin: suggested ? 'model' : 'teacher',
        origin_turn: suggested ? EARLIER_TURN : null,
        status: suggested ? 'proposed' : 'live',
        version: 1,
        derived_from: null,
        order: blocks.filter((x) => x.doc_id === doc!.id).length,
        pending: null,
        created_at: AT,
        updated_at: AT,
      };
      blocks.push(block);
      into = { block, pending: false };
      continue;
    }
    const pending = /^ {3}\(suggested, not yet accepted: (replace with: |delete this block|move after )(.*)$/.exec(line);
    if (pending && into) {
      const [, what, rest] = pending;
      into.block.pending = what === 'replace with: ' ? { op: 'replace', turn_id: EARLIER_TURN, content: rest! } : what === 'move after ' ? { op: 'move', turn_id: EARLIER_TURN, after: unbracket(rest!) } : { op: 'delete', turn_id: EARLIER_TURN };
      into = { block: into.block, pending: what === 'replace with: ' };
      continue;
    }
    if (line.startsWith(INDENT) && into) {
      const more = `\n${line.slice(INDENT.length)}`;
      if (into.pending && into.block.pending?.op === 'replace') into.block.pending.content += more;
      else into.block.content += more;
    }
  }
  // The "(suggested, ...)" bracket closes at the very end of a waiting replacement's last line.
  for (const block of blocks) if (block.pending?.op === 'replace') block.pending.content = unbracket(block.pending.content);
  return { blocks, docs, openDocId };
}
