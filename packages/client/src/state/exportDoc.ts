/**
 * A doc as a file the teacher can download. Only the doc's accepted text is written:
 * suggestions still awaiting accept or reject are left out (a pending change keeps the
 * text it would replace).
 */
import { createState, liveBlocks, toMarkdown, type Block, type BlockType, type Doc } from '@edw/shared';
import type { CanvasSnapshot } from '../editor/types.js';

/** `docx` is written by ../export/docx.ts (loaded on first use); the others here. */
export type ExportFormat = 'docx' | 'markdown' | 'json';
export type TextFormat = Exclude<ExportFormat, 'docx'>;

export interface DocJson {
  format: 'edw-doc';
  version: 1;
  id: string;
  name: string;
  exported_at: string;
  blocks: Array<{ id: string; type: BlockType; content: string }>;
}

function stateOf(snap: CanvasSnapshot) {
  return createState(
    'export',
    snap.blocks.map((b): Block => ({ ...b, origin: 'teacher', origin_turn: null })),
    snap.docs,
  );
}

export function docMarkdown(snap: CanvasSnapshot, docId: string): string {
  return toMarkdown(stateOf(snap), docId);
}

export function docJson(snap: CanvasSnapshot, doc: Doc, now = new Date()): DocJson {
  return {
    format: 'edw-doc',
    version: 1,
    id: doc.id,
    name: doc.name,
    exported_at: now.toISOString(),
    blocks: liveBlocks(stateOf(snap), doc.id).map((b) => ({ id: b.id, type: b.type, content: b.content })),
  };
}

/** The file for a format: its contents, MIME type and extension. */
export function exportFile(snap: CanvasSnapshot, doc: Doc, format: TextFormat): { text: string; mime: string; ext: string } {
  if (format === 'markdown') return { text: docMarkdown(snap, doc.id), mime: 'text/markdown;charset=utf-8', ext: 'md' };
  return { text: `${JSON.stringify(docJson(snap, doc), null, 2)}\n`, mime: 'application/json', ext: 'json' };
}
