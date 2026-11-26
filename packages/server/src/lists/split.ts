/**
 * One old list block (`bullet_list`, `numbered_list`, `checklist`) as a block per item, with its
 * history (PLAN.md section 6, L.4). Pure: the caller loads the rows and writes the plan.
 *
 *  - History: the list's versions are replayed and each version's items matched to the one
 *    before (`matchItems`, as the server matches the model's rewrites), so each list revision
 *    becomes revisions of the items it changed (an item edited or added), with the original
 *    actor, cause event and time. An item a version left out ends there: its block is deleted.
 *  - Blocks: each item becomes a block of the item type, `derived_from` the list, with the list's
 *    origin; its status is the list's (an item that ended earlier is deleted). The list block
 *    itself is marked deleted (when it was live or a suggestion), not removed.
 *  - A suggestion waiting on the list becomes suggestions on the items it changes: a replace is
 *    matched item by item (a changed item gets a replace, a new one is a suggested new block, a
 *    missing one a suggested deletion); a delete or a move applies to every item.
 *  - `splits`: for every version, which item block each item went to and which lines it held.
 *
 * Earlier versions are read as lists even if the block was then another type (a paragraph made
 * into a list): revisions do not record the type.
 */
import { ITEM_TYPE_OF, LIST_TYPE_OF, matchItems, parseItem, sameItem, splitList, type Block, type BlockRevision, type ListItemType, type OldListType } from '@edw/shared';

export interface SplitRow {
  list_block_id: string;
  version: number;
  item_index: number;
  item_block_id: string;
  first_line: number;
  line_count: number;
}

export interface ListSplit {
  /** The list block after: deleted when it was live or a suggestion, otherwise as it was. */
  list: Block;
  /** Every item block, in doc order: the visible ones (with any suggested new items among them), then those that ended earlier. */
  items: Block[];
  revisions: BlockRevision[];
  splits: SplitRow[];
  stats: {
    versions: number;
    /** Items in the list now. */
    items: number;
    /** Items that existed in an earlier version only. */
    ended: number;
    /** Version changes where an item went and another came in its place: an item rewritten past recognition reads as one removed and one added. */
    replaced_by_new: number;
    /** A waiting suggestion on the list, now on its items. */
    pending: 'replace' | 'delete' | 'move' | null;
  };
}

export interface SplitOptions {
  newId: () => string;
  now: string;
  /** The event that caused a turn's suggestions (its chat_response), for a suggested new item's first revision. */
  causeOfTurn?: (turnId: string) => string | undefined;
}

interface Track {
  id: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const textOf = (type: ListItemType, content: string) => parseItem(type, content).text.trim();

/** A version's items with the lines each holds. */
function itemsOf(type: OldListType, content: string): Array<{ content: string; first_line: number; line_count: number }> {
  let line = 0;
  const groups: number[] = [];
  const lines = content.split(/\r?\n/);
  const items = splitList(type, content);
  // splitList groups lines in order, a line starting an item or continuing the one above.
  for (const item of items) {
    const count = item.content.split('\n').length;
    groups.push(line);
    line += count;
  }
  if (line !== lines.length) throw new Error(`list lines do not add up (${line} of ${lines.length})`);
  return items.map((it, i) => ({ content: it.content, first_line: groups[i]!, line_count: it.content.split('\n').length }));
}

export function splitListBlock(list: Block, revisions: readonly BlockRevision[], o: SplitOptions): ListSplit {
  const type = list.type as OldListType;
  const itemType = ITEM_TYPE_OF[type];
  const revs = [...revisions].sort((a, b) => a.version - b.version);
  const states = revs.length ? revs.map((r) => ({ version: r.version, content: r.after.content, rev: r as BlockRevision | null })) : [{ version: list.version, content: list.content, rev: null }];

  const out: ListSplit = {
    list,
    items: [],
    revisions: [],
    splits: [],
    stats: { versions: states.length, items: 0, ended: 0, replaced_by_new: 0, pending: list.status === 'live' && list.pending ? list.pending.op : null },
  };
  let current: Track[] = [];
  const ended: Track[] = [];
  for (const state of states) {
    const next = itemsOf(type, state.content);
    const pairs = matchItems(
      current.map((t) => textOf(itemType, t.content)),
      next.map((n) => textOf(itemType, n.content)),
    );
    const at = state.rev?.at ?? list.updated_at;
    const kept = new Set(pairs.values());
    const tracks = next.map((item, i): Track => {
      const o0 = pairs.get(i);
      const t = o0 === undefined ? { id: o.newId(), content: '', version: 0, created_at: at, updated_at: at } : current[o0]!;
      if (state.rev && (o0 === undefined || t.content !== item.content)) {
        out.revisions.push({ block_id: t.id, version: t.version + 1, actor: state.rev.actor, before: o0 === undefined ? null : { content: t.content }, after: { content: item.content }, cause_event_id: state.rev.cause_event_id, at });
        t.version += 1;
        t.updated_at = at;
      }
      t.content = item.content;
      out.splits.push({ list_block_id: list.id, version: state.version, item_index: i, item_block_id: t.id, first_line: item.first_line, line_count: item.line_count });
      return t;
    });
    const gone = current.filter((_t, k) => !kept.has(k));
    if (gone.length && tracks.length > kept.size) out.stats.replaced_by_new += 1;
    ended.push(...gone);
    current = tracks;
  }

  const visible = list.status === 'live' || list.status === 'proposed';
  const block = (t: Track, over: Partial<Block> = {}): Block => ({
    id: t.id,
    session_id: list.session_id,
    doc_id: list.doc_id,
    type: itemType,
    content: t.content,
    origin: list.origin,
    origin_turn: list.origin_turn,
    status: list.status,
    version: t.version,
    derived_from: list.id,
    order: list.order,
    pending: null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    ...over,
  });
  const items = current.map((t) => block(t));
  out.items = withPending(list, items, current, itemType, o, out, revs.at(-1)?.cause_event_id);
  out.items.push(...ended.map((t) => block(t, { status: 'deleted' })));
  out.stats.items = current.length;
  out.stats.ended = ended.length;
  if (visible) out.list = { ...list, status: 'deleted', pending: null, updated_at: o.now };
  return out;
}

/** The list's waiting suggestion put on its items; suggested new items placed among them. */
function withPending(list: Block, items: Block[], tracks: Track[], itemType: ListItemType, o: SplitOptions, out: ListSplit, lastCause: string | undefined): Block[] {
  const p = list.status === 'live' ? list.pending : null;
  if (!p) return items;
  if (p.op === 'delete') return items.map((b) => ({ ...b, pending: { op: 'delete', turn_id: p.turn_id } }));
  if (p.op === 'move') return items.map((b, i) => ({ ...b, pending: { op: 'move', turn_id: p.turn_id, after: i === 0 ? p.after : items[i - 1]!.id } }));
  const wanted = splitList(LIST_TYPE_OF[itemType], p.content);
  const pairs = matchItems(
    tracks.map((t) => textOf(itemType, t.content)),
    wanted.map((w) => textOf(itemType, w.content)),
  );
  const paired = new Set(pairs.values());
  const ordered: Block[] = [];
  let next = 0; // the next existing item not yet placed
  wanted.forEach((w, i) => {
    const k = pairs.get(i);
    if (k === undefined) {
      const id = o.newId();
      // Its turn's response, or else the list's last change, so every block has a first revision.
      const cause = o.causeOfTurn?.(p.turn_id) ?? lastCause;
      ordered.push({ ...items[0]!, id, content: w.content, origin: 'model', origin_turn: p.turn_id, status: 'proposed', version: cause ? 1 : 0, pending: null, created_at: list.updated_at, updated_at: list.updated_at });
      if (cause) out.revisions.push({ block_id: id, version: 1, actor: 'model', before: null, after: { content: w.content }, cause_event_id: cause, at: list.updated_at });
      return;
    }
    while (next <= k) {
      const b = items[next]!;
      ordered.push(next === k ? (sameItem(itemType, b.content, w.content, i === 0) ? b : { ...b, pending: { op: 'replace', turn_id: p.turn_id, content: w.content } }) : { ...b, pending: { op: 'delete', turn_id: p.turn_id } });
      next++;
    }
  });
  for (; next < items.length; next++) ordered.push(paired.has(next) ? items[next]! : { ...items[next]!, pending: { op: 'delete', turn_id: p.turn_id } });
  return ordered;
}
