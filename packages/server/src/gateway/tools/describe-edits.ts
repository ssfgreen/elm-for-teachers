/**
 * A teacher-readable account of one edit_document call, one line per operation, for the
 * chat's step card ("Added a picture of a zoo"). The raw arguments stay in the step for anyone
 * who wants them; this is what the card shows first. Pure: block ids are looked up in the
 * blocks given, and temp_ids from the same call resolve to the text they were given.
 */
import type { Block, Doc, DroppedOp } from '@edw/shared';

const TYPE_NAMES: Record<string, string> = {
  heading: 'heading',
  paragraph: 'paragraph',
  bullet_list: 'bulleted list',
  numbered_list: 'numbered list',
  checklist: 'checklist',
  bullet_item: 'bullet point',
  numbered_item: 'numbered item',
  checklist_item: 'checklist item',
  quote: 'quote',
  code_block: 'code block',
  divider: 'divider',
  page_break: 'page break',
  image: 'picture',
  table: 'table',
};

const DROP_REASONS: Record<DroppedOp['reason'], string> = {
  unknown_block_id: 'it named a part of the document that is not there',
  unknown_doc: 'it named a document that is not there',
  schema_invalid: 'it was not written correctly',
  duplicate_temp_id: 'it reused a name from an earlier change',
  moves_across_docs: 'it tried to move text to another document',
  invalid_image: 'the picture could not be used',
  no_style: 'it did not say which font or colour',
  table_needs_table_block: 'it was not a proper table',
  needs_copy_choice: 'the teacher has to choose what the copy is made from first',
};

/** Up to `n` characters of a block's text as one line, without markdown marks. */
export function excerpt(content: string, n = 60): string {
  const image = /!\[([^\]]*)\]\([^)]*\)/.exec(content);
  if (image) return image[1] ? `picture of ${image[1]}` : 'picture';
  const line = content
    .replace(/^\s*(#+|[-*]|\d+\.|>|\[[ x]\])\s+/gm, '')
    .replace(/[*_`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return line.length > n ? `${line.slice(0, n - 1).trimEnd()}…` : line;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const named = (type: string): string => TYPE_NAMES[type] ?? 'block';
const quoted = (content: string): string => `“${excerpt(content)}”`;

function describeOne(op: Record<string, unknown>, find: (id: string) => { type: string; content: string } | undefined, docName: (id: string) => string | undefined): string {
  const target = find(str(op.id));
  const what = target ? (target.type === 'image' ? `the ${excerpt(target.content)}` : quoted(target.content)) : 'a part of the document';
  switch (op.op) {
    case 'insert': {
      const type = str(op.type);
      const content = str(op.content);
      if (type === 'image') return `Added a ${excerpt(content)}`;
      if (!content.trim()) return `Added a ${named(type)}`;
      return `Added a ${named(type)}: ${quoted(content)}`;
    }
    case 'replace':
      return target?.type === 'image' ? `Swapped ${what} for a ${excerpt(str(op.content))}` : `Rewrote ${what} as ${quoted(str(op.content))}`;
    case 'delete':
      return `Removed ${what}`;
    case 'move':
      return `Moved ${what}`;
    case 'create_doc': {
      if (!op.copy_of) return `Started a new document, “${str(op.name)}”`;
      const source = docName(str(op.copy_of));
      return `Copied ${source ? `“${source}”` : 'a document'} as “${str(op.name)}”`;
    }
    case 'set_style': {
      const parts = [op.font ? `the font to ${str(op.font).replace(/_/g, ' ')}` : '', op.background ? `the page colour to ${str(op.background)}` : ''].filter(Boolean);
      return parts.length ? `Set ${parts.join(' and ')}` : 'Changed the look of the document';
    }
    default:
      return 'Made a change it could not describe';
  }
}

/**
 * One line per operation; a dropped one says it was not made, and why. A copied block
 * (`<temp_id>/<source id>`) is described by the text of the block it copies.
 */
export function describeEdits(
  operations: unknown[],
  dropped: readonly Pick<DroppedOp, 'index' | 'reason'>[],
  blocks: readonly Pick<Block, 'id' | 'type' | 'content'>[],
  docs: readonly Pick<Doc, 'id' | 'name'>[] = [],
): string[] {
  const byId = new Map<string, { type: string; content: string }>(blocks.map((b) => [b.id, b]));
  const find = (id: string) => byId.get(id) ?? byId.get(id.slice(id.lastIndexOf('/') + 1));
  const docName = (id: string) => docs.find((d) => d.id === id)?.name;
  const why = new Map(dropped.map((d) => [d.index, d.reason]));
  return operations.map((raw, i) => {
    const op = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const line = describeOne(op, find, docName);
    if (op.op === 'insert' && str(op.temp_id)) byId.set(str(op.temp_id), { type: str(op.type), content: str(op.content) });
    const reason = why.get(i);
    return reason ? `Not made: ${line[0]!.toLowerCase()}${line.slice(1)} (${DROP_REASONS[reason]})` : line;
  });
}
