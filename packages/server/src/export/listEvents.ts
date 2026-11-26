/**
 * Earlier events that name an old list block, written against the item blocks it was split into
 * (PLAN.md section 6, L.4; block_splits from lists/migrate.ts). The event log in the database is
 * not changed: this is how the export reads it, so the bundle is in the new format throughout.
 *
 * Each translated event keeps its seq, event_id and time and gains `split_from` (the list's id) in
 * its payload; an event that touched several items becomes one per item:
 *  - keystroke_batch: one per item the batch changed (from the list version it caused to the one
 *    before), each with one edit, the item's text before to after (a batch is at most half a
 *    second of typing), and the item's content_after. A batch that accepted a waiting suggestion
 *    by typing caused two versions, the model's then the teacher's: it is the teacher's;
 *  - block_revision: one per item revision the list revision became;
 *  - proposal_accept: one per item the accept changed, or every item when it changed no text;
 *  - proposal_reject, proposal_shown, block_structure: every item of the list as it then was
 *    (a split names the last item, as the new block came after it; a merge into the list too);
 *  - comment_create: the item the comment was moved to;
 *  - selection, focus, block_visible, paste, picture_choose and an @model anchor: the list's
 *    first item then.
 * The list's own revisions are left out of the text events: its items' revisions stand for them.
 */
import { diffText, splitList, type Block, type BlockRevision, type Event, type OldListType } from '@edw/shared';

export interface SplitRowLite {
  list_block_id: string;
  version: number;
  item_index: number;
  item_block_id: string;
}

export interface ListTranslation {
  events: Event[];
  /** Revisions without the split lists' own. */
  revisions: BlockRevision[];
  /** The split lists' ids. */
  lists: Set<string>;
  stats: {
    lists: number;
    /** Events that named a list, by kind. */
    translated: Record<string, number>;
    /** The events they became. */
    written: number;
    /** Keystroke batches on a list that caused no revision of it (nothing changed), left out. */
    left_out: number;
    /** Seqs of the events translated. */
    seqs: number[];
  };
}

interface ListInfo {
  list: Block;
  /** Version → item ids in order. */
  items: Map<number, string[]>;
  /** Version → the list's content then. */
  content: Map<number, string>;
  /** Version → seq of its cause (or by time), ascending versions. */
  versions: Array<{ version: number; seq: number; cause: string }>;
  /** Version → the list's revision. */
  revs: Map<number, BlockRevision>;
}

export function translateListEvents(events: readonly Event[], revisions: readonly BlockRevision[], blocks: readonly Block[], splits: readonly SplitRowLite[], commentBlocks: ReadonlyMap<string, string>): ListTranslation {
  const lists = new Set(splits.map((s) => s.list_block_id));
  const stats: ListTranslation['stats'] = { lists: lists.size, translated: {}, written: 0, left_out: 0, seqs: [] };
  if (!lists.size) return { events: [...events], revisions: [...revisions], lists, stats };

  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const seqOf = new Map(ordered.map((e) => [e.event_id, e.seq]));
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const info = new Map<string, ListInfo>();
  for (const id of lists) {
    const list = byId.get(id);
    if (!list) continue;
    const items = new Map<number, string[]>();
    for (const s of splits.filter((x) => x.list_block_id === id).sort((a, b) => a.version - b.version || a.item_index - b.item_index)) {
      (items.get(s.version) ?? items.set(s.version, []).get(s.version)!).push(s.item_block_id);
    }
    const revs = revisions.filter((r) => r.block_id === id).sort((a, b) => a.version - b.version);
    const bySeq = (r: BlockRevision) => seqOf.get(r.cause_event_id) ?? ordered.find((e) => Date.parse(e.server_ts) >= Date.parse(r.at))?.seq ?? Number.MAX_SAFE_INTEGER;
    info.set(id, {
      list,
      items,
      content: new Map(revs.map((r) => [r.version, r.after.content])),
      revs: new Map(revs.map((r) => [r.version, r])),
      versions: revs.length ? revs.map((r) => ({ version: r.version, seq: bySeq(r), cause: r.cause_event_id })) : [...items.keys()].map((v) => ({ version: v, seq: 0, cause: '' })),
    });
  }
  // Item revisions by the cause they share with the list's (`itemRevs`), and by the list revision
  // they came from (`fromRev`: same cause, actor and time, as one event can cause two list versions).
  const itemRevs = new Map<string, BlockRevision[]>();
  const fromRev = new Map<string, BlockRevision[]>();
  const add = (m: Map<string, BlockRevision[]>, key: string, r: BlockRevision) => (m.get(key) ?? m.set(key, []).get(key)!).push(r);
  const revKey = (list: string, r: BlockRevision) => `${list}:${r.cause_event_id}:${r.actor}:${r.at}`;
  const itemOf = new Map(splits.map((s) => [s.item_block_id, s.list_block_id]));
  for (const r of revisions) {
    const list = itemOf.get(r.block_id);
    if (!list) continue;
    add(itemRevs, `${list}:${r.cause_event_id}`, r);
    add(fromRev, revKey(list, r), r);
  }

  /** The list's version current at an event: the last one caused at or before it. */
  const versionAt = (l: ListInfo, seq: number) => {
    let v = l.versions[0]?.version ?? 0;
    for (const x of l.versions) if (x.seq <= seq) v = x.version;
    return v;
  };
  const itemsAt = (l: ListInfo, seq: number) => l.items.get(versionAt(l, seq)) ?? [];
  const contentOf = (l: ListInfo, version: number, itemId: string): string => {
    const ids = l.items.get(version) ?? [];
    const i = ids.indexOf(itemId);
    const content = l.content.get(version);
    return i < 0 || content === undefined ? '' : (splitList(l.list.type as OldListType, content)[i]?.content ?? '');
  };

  const out: Event[] = [];
  const revisionsOut = revisions.filter((r) => !lists.has(r.block_id));
  for (const e of ordered) {
    const made = translate(e);
    if (made === null) {
      out.push(e);
      continue;
    }
    stats.translated[e.kind] = (stats.translated[e.kind] ?? 0) + 1;
    stats.seqs.push(e.seq);
    stats.written += made.length;
    out.push(...made);
  }
  return { events: out, revisions: revisionsOut, lists, stats };

  /** The events `e` becomes, or null when it names no split list. */
  function translate(e: Event): Event[] | null {
    const p = e.payload as Record<string, unknown>;
    const as = (payload: Record<string, unknown>, list: string) => ({ ...e, payload: { ...payload, split_from: list } }) as unknown as Event;
    const listOf = (id: unknown) => (typeof id === 'string' ? info.get(id) : undefined);

    switch (e.kind) {
      case 'keystroke_batch': {
        const target = p.target as { kind: string; block_id?: string };
        const l = listOf(target.block_id);
        if (target.kind !== 'block' || !l) return null;
        const v = l.versions.filter((x) => x.cause === e.event_id).at(-1)?.version;
        if (v === undefined) {
          stats.left_out += 1;
          return [];
        }
        const prev = l.versions.filter((x) => x.version < v).at(-1)?.version;
        const edits = (p.edits as Array<{ t: number }> | undefined) ?? [];
        const t = edits.at(-1)?.t ?? Date.parse(String(p.batch_end_ts));
        return (l.items.get(v) ?? []).flatMap((id) => {
          const before = prev === undefined ? '' : contentOf(l, prev, id);
          const after = contentOf(l, v, id);
          if (before === after) return [];
          const changed: Record<string, unknown> = { ...p, target: { kind: 'block', block_id: id }, edits: [{ t, ops: diffText(before, after) }], content_after: { content: after } };
          if (p.live_after) changed.live_after = { content: after };
          return [as(changed, l.list.id)];
        });
      }
      case 'block_revision': {
        const l = listOf(p.block_id);
        if (!l) return null;
        const rev = l.revs.get(Number(p.version));
        return (rev ? (fromRev.get(revKey(l.list.id, rev)) ?? []) : []).map((r) => as({ ...p, block_id: r.block_id, version: r.version }, l.list.id));
      }
      case 'proposal_accept':
      case 'proposal_reject': {
        const l = listOf(p.block_id);
        if (!l) return null;
        const changed = e.kind === 'proposal_accept' ? (itemRevs.get(`${l.list.id}:${e.event_id}`) ?? []).map((r) => r.block_id) : [];
        const ids = changed.length ? [...new Set(changed)] : itemsAt(l, e.seq);
        return ids.map((id) => as({ ...p, block_id: id }, l.list.id));
      }
      case 'proposal_shown': {
        const ids = (p.block_ids as string[]) ?? [];
        const hit = ids.map(listOf).find(Boolean);
        if (!hit) return null;
        return [as({ ...p, block_ids: ids.flatMap((id) => (listOf(id) ? itemsAt(listOf(id)!, e.seq) : [id])) }, hit.list.id)];
      }
      case 'block_structure': {
        const action = p.action as string;
        const l = listOf(p.block_id) ?? listOf(p.new_block_id) ?? listOf(p.merged_into);
        if (!l) return null;
        const ids = itemsAt(l, e.seq);
        const at = (key: string, id: string) => as({ ...p, [key]: id }, l.list.id);
        if (action === 'split' && listOf(p.new_block_id)) return [at('new_block_id', (listOf(p.new_block_id)!.items.get(listOf(p.new_block_id)!.versions[0]?.version ?? 0) ?? [])[0] ?? String(p.new_block_id))];
        if (action === 'split') return [at('block_id', ids.at(-1) ?? String(p.block_id))];
        if (action === 'merge' && listOf(p.merged_into)) return [at('merged_into', ids.at(-1) ?? String(p.merged_into))];
        return ids.map((id) => at('block_id', id));
      }
      case 'comment_create': {
        const l = listOf(p.block_id);
        if (!l) return null;
        return [as({ ...p, block_id: commentBlocks.get(String(p.comment_id)) ?? itemsAt(l, e.seq)[0] ?? p.block_id }, l.list.id)];
      }
      case 'selection':
      case 'focus':
      case 'block_visible':
      case 'picture_choose': {
        const l = listOf(p.block_id);
        if (!l) return null;
        return [as({ ...p, block_id: itemsAt(l, e.seq)[0] ?? p.block_id }, l.list.id)];
      }
      case 'paste': {
        const target = p.target as { kind: string; block_id?: string };
        const l = listOf(target.block_id);
        if (!l) return null;
        return [as({ ...p, target: { kind: 'block', block_id: itemsAt(l, e.seq)[0] ?? target.block_id } }, l.list.id)];
      }
      case 'chat_prompt': {
        const anchor = p.anchor as { block_id?: string } | null | undefined;
        const l = listOf(anchor?.block_id);
        if (!anchor || !l) return null;
        return [as({ ...p, anchor: { ...anchor, block_id: itemsAt(l, e.seq)[0] ?? anchor.block_id } }, l.list.id)];
      }
      default:
        return null;
    }
  }
}
