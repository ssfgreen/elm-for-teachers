import { cleanSvg, copyTempId, Operation, type BlockType, type DroppedOp } from '@edw/shared';

/**
 * Validates raw model operations against the current thread's docs. Every op is checked
 * independently; a drop never aborts the rest of the list.
 *
 * Rules, with the drop reason each produces:
 * - Must parse with the shared `Operation` schema: `schema_invalid`.
 * - `replace`, `delete`, `move`: `id` must be a live block in one of this thread's docs:
 *   `unknown_block_id`.
 * - `insert.doc`: omitted (= the open doc), a doc of this thread, or the `temp_id` of a
 *   `create_doc` accepted earlier in the same list: `unknown_doc`.
 * - `insert.after`: `start`, a live block in the insert's own doc, or the `temp_id` of an
 *   insert accepted earlier in the list into the same doc: `unknown_block_id`.
 * - `insert.temp_id`: unused so far in the list (by an insert or a `create_doc`), not
 *   `start`, and not an existing id: `duplicate_temp_id`.
 * - `move.after`: `start` or a live block (`unknown_block_id`) in the same doc as the moved
 *   block (`moves_across_docs`).
 * - `create_doc`: a `temp_id` already used earlier in the list, equal to `start`, or equal to
 *   an existing doc id is `duplicate_temp_id`.
 * - `set_style.doc`: omitted, a doc of this thread or a `create_doc` temp_id from earlier in the
 *   list: `unknown_doc`. It must name a font or a background from the toolbar's lists (the
 *   schema checks which): `no_style` when it names neither.
 * - A markdown table (rows of | cells with a | --- | line) inserted as a block that is not a
 *   table, or put by a replace into a block that is not one, shows as text with bars:
 *   `table_needs_table_block`. Code blocks may hold one.
 * - `create_doc.copy_of`: a doc in `copies` (`unknown_doc`) whose copy does not wait on the
 *   teacher's choice (`needs_copy_choice`). Its blocks are then named `<temp_id>/<source id>`, and
 *   `replace`, `delete`, `move` and an insert's `after` and `from` may use those names like ids.
 * - `insert.from`: a block the model may name, or a copied block: `unknown_block_id`.
 * - A drawing (SVG) as the content of an inserted image block, or of a replace on one, must
 *   hold an <svg> element of a sensible size: `invalid_image` (see drawings.ts).
 *
 * Insert ordering convention: inserts land in list order. Consecutive inserts sharing the same
 * (doc, after) anchor are placed one after another after that anchor, so a whole new document
 * is a list of inserts that all say `"after": "start"`; an insert may instead go after an
 * earlier insert's `temp_id`.
 */
export interface ValidationContext {
  /** Blocks of this thread's docs the model may name: live ones and its suggestions not yet accepted. */
  liveBlockIds: ReadonlySet<string>;
  /** Block id -> doc id, for at least every block in `liveBlockIds`. */
  blockDoc: ReadonlyMap<string, string>;
  /** This thread's doc ids. */
  docIds: ReadonlySet<string>;
  /** The doc the teacher has open; where inserts without `doc` go. */
  openDocId: string;
  /** Which of `liveBlockIds` are image blocks (a replace on one may be a new drawing). */
  imageBlockIds?: ReadonlySet<string>;
  /** Block id -> its type, for at least every block in `liveBlockIds` (a replace keeps the type). */
  blockTypes?: ReadonlyMap<string, BlockType>;
  /**
   * Doc id -> the blocks a copy of it is made of (`copySource`), or null when suggestions wait
   * there and the teacher has not chosen. Without it, `copy_of` names nothing.
   */
  copies?: ReadonlyMap<string, readonly string[] | null>;
}

/** Content written as a markdown table: two or more rows of cells and a header line. */
const looksLikeTable = (content: string) => {
  const lines = content.split('\n').map((l) => l.trim());
  return lines.filter((l) => /^\|.*\|$/.test(l)).length >= 2 && lines.some((l) => /^\|?\s*:?-{3,}:?\s*\|/.test(l));
};
const holdsTables = (type: BlockType | undefined) => type === undefined || type === 'table' || type === 'code_block';

/** Content that means to be a drawing but is not one that can be kept. */
const badDrawing = (content: string) => content.includes('<svg') && !cleanSvg(content);

export interface ValidationResult {
  operations: Operation[];
  dropped: DroppedOp[];
}

export function validateOperations(raw: unknown[] | null, ctx: ValidationContext): ValidationResult {
  const operations: Operation[] = [];
  const dropped: DroppedOp[] = [];
  if (!raw) return { operations, dropped };

  const tempDocs = new Set<string>();
  /** Insert temp_id → the doc it went into. */
  const tempBlocks = new Map<string, string>();
  /** A copied block's name -> the new doc it is in (its create_doc's temp_id). */
  const copied = new Map<string, string>();
  const known = (id: string) => ctx.liveBlockIds.has(id) || copied.has(id);
  const docOf = (id: string) => copied.get(id) ?? ctx.blockDoc.get(id);
  const usedTemp = (id: string) => tempDocs.has(id) || tempBlocks.has(id) || id === 'start' || ctx.docIds.has(id) || ctx.liveBlockIds.has(id);

  raw.forEach((candidate, index) => {
    const drop = (reason: DroppedOp['reason']) => dropped.push({ index, op: candidate, reason });
    const parsed = Operation.safeParse(candidate);
    if (!parsed.success) return drop('schema_invalid');
    const op = parsed.data;

    switch (op.op) {
      case 'replace':
        if (!known(op.id)) return drop('unknown_block_id');
        if (ctx.imageBlockIds?.has(op.id) && badDrawing(op.content)) return drop('invalid_image');
        if (!holdsTables(ctx.blockTypes?.get(op.id)) && looksLikeTable(op.content)) return drop('table_needs_table_block');
        break;

      case 'delete':
        if (!known(op.id)) return drop('unknown_block_id');
        break;

      case 'move': {
        if (!known(op.id)) return drop('unknown_block_id');
        if (op.after !== 'start') {
          if (!known(op.after)) return drop('unknown_block_id');
          if (docOf(op.after) !== docOf(op.id)) return drop('moves_across_docs');
        }
        break;
      }

      case 'insert': {
        const doc = op.doc ?? ctx.openDocId;
        const isNew = tempDocs.has(doc);
        if (!isNew && !ctx.docIds.has(doc)) return drop('unknown_doc');
        const afterOk =
          op.after === 'start' || tempBlocks.get(op.after) === doc || copied.get(op.after) === doc || (!isNew && ctx.liveBlockIds.has(op.after) && ctx.blockDoc.get(op.after) === doc);
        if (!afterOk) return drop('unknown_block_id');
        if (op.from !== undefined && !known(op.from)) return drop('unknown_block_id');
        if (op.type === 'image' && badDrawing(op.content)) return drop('invalid_image');
        if (!holdsTables(op.type) && looksLikeTable(op.content)) return drop('table_needs_table_block');
        if (op.temp_id !== undefined) {
          if (usedTemp(op.temp_id)) return drop('duplicate_temp_id');
          tempBlocks.set(op.temp_id, doc);
        }
        break;
      }

      case 'set_style': {
        const doc = op.doc ?? ctx.openDocId;
        if (!tempDocs.has(doc) && !ctx.docIds.has(doc)) return drop('unknown_doc');
        if (!op.font && !op.background) return drop('no_style');
        break;
      }

      case 'create_doc': {
        if (usedTemp(op.temp_id)) return drop('duplicate_temp_id');
        if (op.copy_of !== undefined) {
          const source = ctx.docIds.has(op.copy_of) ? ctx.copies?.get(op.copy_of) : undefined;
          if (source === undefined) return drop('unknown_doc');
          if (source === null) return drop('needs_copy_choice');
          for (const id of source) copied.set(copyTempId(op.temp_id, id), op.temp_id);
        }
        tempDocs.add(op.temp_id);
        break;
      }
    }
    operations.push(op);
  });

  return { operations, dropped };
}
