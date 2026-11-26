/**
 * Pictures the assistant draws. It writes an image block's content as an SVG drawing (see the
 * system prompts); before the operations are applied, each drawing is cleaned (shared svg.ts),
 * saved as an image asset like a teacher's upload, and the content becomes the usual
 * `![alt](asset:<id>)`, so the editor, the history and the Word file treat it as any picture.
 * validate.ts has already dropped drawings that cannot be kept.
 */
import { cleanSvg, type Operation } from '@edw/shared';

/** Saves a cleaned drawing and returns its asset id. */
export type SaveDrawing = (svg: string, alt: string) => Promise<string>;

export async function storeDrawings(operations: Operation[], imageBlockIds: ReadonlySet<string>, save: SaveDrawing): Promise<Operation[]> {
  const out: Operation[] = [];
  for (const op of operations) {
    const drawing =
      (op.op === 'insert' && op.type === 'image') || (op.op === 'replace' && imageBlockIds.has(op.id)) ? cleanSvg(op.content.includes('<svg') ? op.content : '') : null;
    if (!drawing || (op.op !== 'insert' && op.op !== 'replace')) {
      out.push(op);
      continue;
    }
    const id = await save(drawing.svg, drawing.alt);
    out.push({ ...op, content: `![${drawing.alt}](asset:${id})` });
  }
  return out;
}
