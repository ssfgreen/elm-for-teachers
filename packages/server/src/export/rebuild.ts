/** Bundle checks: rebuild the docs from a bundle and replay revisions. */
import { Block, BlockRevision, Doc, createState, docsOf, toMarkdown, type BlockContent, type CanvasState } from '@edw/shared';

type Files = Record<string, string | Uint8Array>;

function text(files: Files, name: string): string {
  const v = files[name];
  if (v === undefined) throw new Error(`bundle is missing ${name}`);
  return typeof v === 'string' ? v : new TextDecoder().decode(v);
}
const parseLines = (s: string): unknown[] => s.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));

/** The canvas state and each doc's markdown, rebuilt from blocks.json and docs.json alone. */
export function rebuildFromBundle(files: Files): { state: CanvasState; markdown: Map<string, string> } {
  const session = JSON.parse(text(files, 'session.json')) as { session_id: string };
  const blocks = (JSON.parse(text(files, 'blocks.json')) as unknown[]).map((b) => Block.parse(b));
  const docs = (JSON.parse(text(files, 'docs.json')) as unknown[]).map((d) => Doc.parse(d));
  const state = createState(session.session_id, blocks, docs);
  return { state, markdown: new Map(docsOf(state).map((d) => [d.id, toMarkdown(state, d.id)])) };
}

/** Apply revisions.jsonl in version order; throws unless each block ends at the content in blocks.json. */
export function replayRevisions(files: Files): Map<string, BlockContent> {
  const revs = parseLines(text(files, 'revisions.jsonl'))
    .map((r) => BlockRevision.parse(r))
    .sort((a, b) => (a.block_id < b.block_id ? -1 : a.block_id > b.block_id ? 1 : a.version - b.version));
  const out = new Map<string, BlockContent>();
  for (const r of revs) {
    const prev = out.get(r.block_id) ?? null;
    if (r.before !== null && (prev === null || JSON.stringify(prev) !== JSON.stringify(r.before))) {
      throw new Error(`revision ${r.block_id}@${r.version}: before does not match the replayed content`);
    }
    out.set(r.block_id, r.after);
  }
  for (const raw of JSON.parse(text(files, 'blocks.json')) as unknown[]) {
    const b = Block.parse(raw);
    const got = out.get(b.id);
    if (!got || got.content !== b.content) throw new Error(`block ${b.id}: replayed content differs from blocks.json`);
  }
  return out;
}
