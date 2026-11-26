/**
 * The model writes lists as it always has, one item per line; the doc holds a block per item
 * (PLAN.md section 6). This turns the model's validated operations into item operations before
 * they are applied, so the system prompt changes little:
 *
 *  - an insert of a list (`bullet_list`, `numbered_list`, `checklist`, or an item type holding
 *    several items) becomes one insert per item, in order; its temp_id names the last item, so
 *    a later insert after it goes after the whole list;
 *  - a replace of an item with several items is either
 *    - a rewrite of the run of items it is in, when one of the new items is word for word
 *      another item of that run, or the turn also deletes another item of it: matched item by item, so an unchanged item keeps its block, id
 *      and any waiting suggestion, a changed one gets a replace, a new one is inserted in its
 *      place and one left out is suggested for deletion (other ops this turn on that run are
 *      dropped, as the rewrite already says what happens to each item); or
 *    - otherwise, the item replaced by the first new item, the rest inserted after it (also for
 *      an item copied this turn, named `<temp_id>/<source id>`).
 *
 * Pure.
 */
import { isListItem, isOldList, LIST_TYPE_OF, matchItems, parseItem, sameItem, splitList, type Block, type ListItemType, type Operation } from '@edw/shared';

type Item = { type: ListItemType; content: string };

/** The items a list's content holds, for an old list type or an item type. */
function itemsOf(type: string, content: string): Item[] | null {
  if (isOldList(type)) return splitList(type, content);
  if (isListItem(type)) return splitList(LIST_TYPE_OF[type], content);
  return null;
}

const textOf = (i: { type: string; content: string }) => (isListItem(i.type) ? parseItem(i.type, i.content).text.trim() : i.content.trim());

/** The run of same-type items around `id` in its doc, as shown, and the block before the run. */
function runOf(blocks: readonly Block[], id: string): { run: Block[]; before: string } | null {
  const target = blocks.find((b) => b.id === id);
  if (!target || !isListItem(target.type)) return null;
  const doc = blocks
    .filter((b) => b.doc_id === target.doc_id && (b.status === 'live' || b.status === 'proposed'))
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  let start = doc.findIndex((b) => b.id === id);
  let end = start;
  while (start > 0 && doc[start - 1]!.type === target.type) start--;
  while (end < doc.length - 1 && doc[end + 1]!.type === target.type) end++;
  return { run: doc.slice(start, end + 1), before: start === 0 ? 'start' : doc[start - 1]!.id };
}

export function expandListOps(operations: readonly Operation[], blocks: readonly Block[]): Operation[] {
  // A block copied this turn (copy_of) is named `<temp_id>/<source id>`: its type is the source's,
  // and its doc the copy's temp_id. Its items are all suggestions, so it is split item by item.
  const copyDocs = new Set(operations.flatMap((o) => (o.op === 'create_doc' && o.copy_of ? [o.temp_id] : [])));
  const copied = (id: string): { type: Block['type']; doc_id: string } | undefined => {
    const at = id.lastIndexOf('/');
    const source = at > 0 && copyDocs.has(id.slice(0, at)) ? blocks.find((b) => b.id === id.slice(at + 1)) : undefined;
    return source ? { type: source.type, doc_id: id.slice(0, at) } : undefined;
  };
  const used = new Set(operations.flatMap((o) => ('temp_id' in o && o.temp_id ? [o.temp_id] : [])));
  let n = 0;
  const tempId = () => {
    let t: string;
    do t = `item_${++n}`;
    while (used.has(t));
    used.add(t);
    return t;
  };

  // First, which replaces rewrite a whole run, so other ops on that run can be dropped.
  const rewrites = new Map<Operation, { run: Block[]; before: string; items: Item[] }>();
  const claimed = new Set<string>();
  for (const op of operations) {
    if (op.op !== 'replace' || claimed.has(op.id)) continue;
    const type = blocks.find((b) => b.id === op.id)?.type;
    const items = type && isListItem(type) ? itemsOf(type, op.content) : null;
    if (!items || items.length < 2) continue;
    const r = runOf(blocks, op.id);
    if (!r) continue;
    const others = r.run.filter((b) => b.id !== op.id);
    const texts = new Set(others.map(textOf));
    const deletesOne = operations.some((o) => o.op === 'delete' && others.some((b) => b.id === o.id));
    if (!deletesOne && !items.some((i) => texts.has(textOf(i)))) continue;
    rewrites.set(op, { ...r, items });
    r.run.forEach((b) => claimed.add(b.id));
  }

  const out: Operation[] = [];
  for (const op of operations) {
    const rewrite = rewrites.get(op);
    if (rewrite) {
      out.push(...rewriteRun(rewrite, op.op === 'replace' ? op.revises_suggestion : undefined, tempId));
      continue;
    }
    if ((op.op === 'replace' || op.op === 'delete' || op.op === 'move') && claimed.has(op.id)) continue;

    if (op.op === 'insert') {
      const items = itemsOf(op.type, op.content);
      if (!items || (items.length < 2 && isListItem(op.type))) {
        out.push(items ? { ...op, type: items[0]!.type, content: items[0]!.content } : op);
        continue;
      }
      items.forEach((item, i) => {
        const { temp_id, ...rest } = op;
        const last = i === items.length - 1;
        out.push({ ...rest, type: item.type, content: item.content, ...(last && temp_id !== undefined ? { temp_id } : {}) });
      });
      continue;
    }

    if (op.op === 'replace') {
      const target = blocks.find((b) => b.id === op.id) ?? copied(op.id);
      const items = target && isListItem(target.type) ? itemsOf(target.type, op.content) : null;
      if (!target || !items || items.length < 2) {
        out.push(op);
        continue;
      }
      out.push({ ...op, content: items[0]!.content });
      for (const item of items.slice(1)) out.push({ op: 'insert', doc: target.doc_id, after: op.id, type: item.type, content: item.content });
      continue;
    }
    out.push(op);
  }
  return out;
}

/** A run rewritten as one list: each new item matched to an old one where it can be. */
function rewriteRun(r: { run: Block[]; before: string; items: Item[] }, revises: boolean | undefined, tempId: () => string): Operation[] {
  const { run, before, items } = r;
  const doc = run[0]!.doc_id;
  const flag = revises ? { revises_suggestion: true } : {};
  const shownContent = (b: Block) => (b.status === 'live' && b.pending?.op === 'replace' ? b.pending.content : b.content);
  // Same text first; between those, the rest paired up in order (an edited item), then the
  // remaining new items are inserted and the remaining old ones deleted.
  const pairOf = matchItems(
    run.map((b) => textOf({ type: b.type, content: shownContent(b) })),
    items.map(textOf),
  );
  const kept = new Set(pairOf.values());
  const out: Operation[] = [];
  let prev = before;
  items.forEach((item, i) => {
    const o = pairOf.get(i);
    if (o === undefined) {
      const temp_id = tempId();
      out.push({ op: 'insert', doc, after: prev, type: item.type, content: item.content, temp_id });
      prev = temp_id;
      return;
    }
    const b = run[o]!;
    // A later numbered item's own number is not read, so a new number alone is no change.
    if (!sameItem(item.type, shownContent(b), item.content, i === 0)) out.push({ op: 'replace', id: b.id, content: item.content, ...flag });
    prev = b.id;
  });
  run.forEach((b, o) => {
    if (!kept.has(o)) out.push({ op: 'delete', id: b.id, ...flag });
  });
  return out;
}
