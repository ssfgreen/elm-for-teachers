/**
 * A fixture block as the rows it is stored as. A list written the short way (`ol`, `ul`, a
 * `numbered_list` block) is a block per item, as the editor stores lists (PLAN.md section 6): the
 * first item takes the list's key and item n also `<key>#n`. A suggestion waiting on the list is
 * put on the items it changes, as the migration of old lists does: a changed item gets a replace,
 * a missing one a deletion, and a new one is a suggested block.
 */
import { isOldList, LIST_TYPE_OF, matchItems, parseItem, sameItem, splitList, type BlockType, type ListItemType } from '@edw/shared';

export interface SeedRow {
  type: BlockType;
  content: string;
  status: 'live' | 'proposed';
  origin: 'teacher' | 'model';
  /** The waiting suggestion, as stored. */
  pending: string | null;
  keys: string[];
}

const TURN = 't_earlier';
const text = (type: ListItemType, content: string) => parseItem(type, content).text.trim();

export function seedRows(b: { type: BlockType; content: string; key?: string; suggested?: string }): SeedRow[] {
  const replace = (content: string) => JSON.stringify({ op: 'replace', turn_id: TURN, content });
  if (!isOldList(b.type)) return [{ type: b.type, content: b.content, status: 'live', origin: 'teacher', pending: b.suggested === undefined ? null : replace(b.suggested), keys: b.key ? [b.key] : [] }];
  const items = splitList(b.type, b.content);
  const keysOf = (i: number) => (b.key ? [...(i === 0 ? [b.key] : []), `${b.key}#${i + 1}`] : []);
  const rows: SeedRow[] = items.map((it, i) => ({ type: it.type, content: it.content, status: 'live', origin: 'teacher', pending: null, keys: keysOf(i) }));
  if (b.suggested === undefined) return rows;
  const type = items[0]!.type;
  const wanted = splitList(LIST_TYPE_OF[type], b.suggested);
  const pairs = matchItems(items.map((it) => text(type, it.content)), wanted.map((w) => text(type, w.content)));
  const out: SeedRow[] = [];
  let next = 0;
  wanted.forEach((w, i) => {
    const k = pairs.get(i);
    if (k === undefined) {
      out.push({ type, content: w.content, status: 'proposed', origin: 'model', pending: null, keys: [] });
      return;
    }
    for (; next <= k; next++) {
      const row = rows[next]!;
      out.push(next < k ? { ...row, pending: JSON.stringify({ op: 'delete', turn_id: TURN }) } : sameItem(type, row.content, w.content, i === 0) ? row : { ...row, pending: replace(w.content) });
    }
  });
  for (; next < rows.length; next++) out.push({ ...rows[next]!, pending: JSON.stringify({ op: 'delete', turn_id: TURN }) });
  return out;
}
