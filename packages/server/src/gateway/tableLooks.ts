import type { Block, Operation } from '@edw/shared';

/**
 * A table's header colour is the document's, set by the teacher (or asked for): a model rewriting
 * the table, for its widths or its rows, often leaves the `<!-- header: ... -->` line out, and
 * the colour went. Here the commit carries it over to the new content, for a replace of the table
 * and for a new table made from it (`from`), unless the model wrote a colour itself or the new
 * table has no header row to colour.
 */
const HEADER_LINE = /^<!--\s*header:\s*[a-z]+\s*-->$/m;
const SEP_LINE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/m;

export function keepHeaderColours(operations: readonly Operation[], blocks: readonly Block[]): Operation[] {
  const colourOf = (id: string | undefined) => {
    const b = id ? blocks.find((x) => x.id === id) : undefined;
    return b?.type === 'table' ? (HEADER_LINE.exec(b.content)?.[0] ?? null) : null;
  };
  const withColour = (content: string, line: string | null) => (line && SEP_LINE.test(content) && !HEADER_LINE.test(content) ? `${content.trimEnd()}\n${line}` : content);
  return operations.map((op) => {
    if (op.op === 'replace') {
      const content = withColour(op.content, colourOf(op.id));
      return content === op.content ? op : { ...op, content };
    }
    if (op.op === 'insert' && op.type === 'table') {
      const content = withColour(op.content, colourOf(op.from));
      return content === op.content ? op : { ...op, content };
    }
    return op;
  });
}
