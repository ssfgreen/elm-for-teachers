/**
 * Moves every workspace's old list blocks to a block per item (PLAN.md section 6, L.4), one
 * workspace per transaction. `dryRun` writes nothing and reports what it would change. Lists
 * already split (they have block_splits rows) are left alone, so it can be run again.
 *
 * Besides what split.ts plans for each list, per doc the blocks are numbered again in order with
 * the items in each list's place, and comments on a list move to the item holding their quote
 * (the root's, for a whole thread); a quote edited since goes to the item sharing most of its
 * words, and one sharing none to the first item.
 *
 * `createTable`, for a dry run only on a database from before migration 0019, makes the
 * block_splits table inside each rolled-back transaction, so the report can be read first.
 *
 * The event log is not rewritten: it is the record. The export reads block_splits to write
 * earlier events against the items (export/listEvents.ts).
 */
import { isOldList, newUlid, nowIso, parseItem, type Block, type ListItemType } from '@edw/shared';
import type { Transaction } from '../db/types.js';
import type { Db } from '../db/client.js';
import { blockToRow, revisionToRow, rowToBlock, rowToRevision } from '../db/rows.js';
import { splitListBlock, type ListSplit } from './split.js';

export interface SplitReport {
  dry_run: boolean;
  sessions: number;
  lists: number;
  items: number;
  /** Items that only existed in an earlier version (their blocks are deleted). */
  ended_items: number;
  versions: number;
  /** Version changes that read as an item removed and another added (rewritten past recognition). */
  replaced_by_new: number;
  pending: { replace: number; delete: number; move: number };
  comments_moved: number;
  /** Comments whose quote was in no item word for word (edited since), put on the item sharing most of its words. */
  comments_by_shared_words: number;
  /** Comments whose quote shared no word with any item, put on the first item. */
  comments_on_first_item: number;
  /** Blocks given a new order because items took a list's place. */
  reordered: number;
}

const UPSERT_BLOCK = `INSERT INTO blocks (id, session_id, doc_id, type, content, origin, origin_turn, status, version,
  derived_from, "order", pending, created_at, updated_at)
  VALUES (:id, :session_id, :doc_id, :type, :content, :origin, :origin_turn, :status, :version,
  :derived_from, :order, :pending, :created_at, :updated_at)
  ON CONFLICT(id) DO UPDATE SET status = excluded.status, "order" = excluded."order", pending = excluded.pending, updated_at = excluded.updated_at`;
const INSERT_REVISION = `INSERT INTO block_revisions (block_id, version, actor, before, after, cause_event_id, at)
  VALUES (:block_id, :version, :actor, :before, :after, :cause_event_id, :at)`;
const INSERT_SPLIT = `INSERT INTO block_splits (list_block_id, version, item_index, item_block_id, first_line, line_count) VALUES (?, ?, ?, ?, ?, ?)`;

/** Migration 0019's table, for a dry run before it. */
const SPLITS_TABLE = [
  `CREATE TABLE block_splits (list_block_id TEXT NOT NULL REFERENCES blocks(id), version INTEGER NOT NULL, item_index INTEGER NOT NULL,
    item_block_id TEXT NOT NULL REFERENCES blocks(id), first_line INTEGER NOT NULL, line_count INTEGER NOT NULL, PRIMARY KEY (list_block_id, version, item_index))`,
];

/** Plain words of markdown, near enough to find a comment's quote in an item. */
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\*\*|\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

export async function splitLists(db: Db, o: { dryRun: boolean; sessionId?: string; now?: string; createTable?: boolean } = { dryRun: true }): Promise<SplitReport> {
  if (o.createTable && !o.dryRun) throw new Error('createTable is for a dry run only: run the migrations before writing');
  const report: SplitReport = { dry_run: o.dryRun, sessions: 0, lists: 0, items: 0, ended_items: 0, versions: 0, replaced_by_new: 0, pending: { replace: 0, delete: 0, move: 0 }, comments_moved: 0, comments_by_shared_words: 0, comments_on_first_item: 0, reordered: 0 };
  const now = o.now ?? nowIso();
  const sessions = o.sessionId
    ? [o.sessionId]
    : (await db.execute(`SELECT DISTINCT session_id FROM blocks WHERE type IN ('bullet_list', 'numbered_list', 'checklist')`)).rows.map((r) => String(r.session_id));
  for (const sid of sessions) {
    const changed = await db.transaction(async (tx) => {
      if (o.createTable) for (const sql of SPLITS_TABLE) await tx.execute(sql);
      const did = await splitSession(tx, sid, now, report);
      if (o.dryRun) throw new DryRun();
      return did;
    }).catch((err: unknown) => {
      if (err instanceof DryRun) return true;
      throw err;
    });
    if (changed) report.sessions += 1;
  }
  return report;
}

/** The item sharing most words with a quote (the first of equals), or undefined when none shares one. */
function closestByWords(quote: string, items: Block[], texts: string[]): Block | undefined {
  const words = (t: string) => new Set(plain(t).toLowerCase().match(/[\p{L}\p{N}’']+/gu) ?? []);
  const q = words(quote);
  let best = -1;
  let most = 0;
  texts.forEach((t, i) => {
    const n = [...words(t)].filter((w) => q.has(w)).length;
    if (n > most) [best, most] = [i, n];
  });
  return best < 0 ? undefined : items[best];
}

/** Rolls a dry run's transaction back. */
class DryRun extends Error {}

async function splitSession(tx: Transaction, sid: string, now: string, report: SplitReport): Promise<boolean> {
  const blocks = (await tx.execute({ sql: 'SELECT * FROM blocks WHERE session_id = ?', args: [sid] })).rows.map(rowToBlock);
  const done = new Set((await tx.execute({ sql: 'SELECT DISTINCT s.list_block_id AS id FROM block_splits s JOIN blocks b ON b.id = s.list_block_id WHERE b.session_id = ?', args: [sid] })).rows.map((r) => String(r.id)));
  const lists = blocks.filter((b) => isOldList(b.type) && !done.has(b.id));
  if (!lists.length) return false;

  const revRows = await tx.execute({ sql: `SELECT r.* FROM block_revisions r JOIN blocks b ON b.id = r.block_id WHERE b.session_id = ? AND b.type IN ('bullet_list', 'numbered_list', 'checklist')`, args: [sid] });
  const revisions = revRows.rows.map(rowToRevision);
  const responses = new Map<string, string>();
  for (const r of (await tx.execute({ sql: "SELECT event_id, payload FROM events WHERE session_id = ? AND kind = 'chat_response'", args: [sid] })).rows) {
    const turn = (JSON.parse(String(r.payload)) as { turn_id?: string }).turn_id;
    if (turn) responses.set(turn, String(r.event_id));
  }

  const splits = new Map<string, ListSplit>();
  for (const list of lists) {
    const s = splitListBlock(list, revisions.filter((r) => r.block_id === list.id), { newId: newUlid, now, causeOfTurn: (t) => responses.get(t) });
    splits.set(list.id, s);
    report.lists += 1;
    report.items += s.stats.items;
    report.ended_items += s.stats.ended;
    report.versions += s.stats.versions;
    report.replaced_by_new += s.stats.replaced_by_new;
    if (s.stats.pending) report.pending[s.stats.pending] += 1;
  }

  // Each doc in order again, with the items in their list's place. Lists and items are always written.
  const written = new Set([...splits.values()].flatMap((x) => [x.list.id, ...x.items.map((i) => i.id)]));
  const writes: Block[] = [];
  for (const docId of new Set(lists.map((l) => l.doc_id))) {
    const inDoc = blocks.filter((b) => b.doc_id === docId).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    const ordered = inDoc.flatMap((b) => {
      const x = splits.get(b.id);
      return x ? [x.list, ...x.items] : [b];
    });
    ordered.forEach((b, i) => {
      const moved = b.order !== i && !written.has(b.id);
      if (moved) report.reordered += 1;
      if (moved || written.has(b.id)) writes.push({ ...b, order: i });
    });
  }
  for (const b of writes) await tx.execute({ sql: UPSERT_BLOCK, args: blockToRow(b) });
  for (const x of splits.values()) {
    for (const r of x.revisions) await tx.execute({ sql: INSERT_REVISION, args: revisionToRow(r) });
    for (const row of x.splits) await tx.execute({ sql: INSERT_SPLIT, args: [row.list_block_id, row.version, row.item_index, row.item_block_id, row.first_line, row.line_count] });
  }

  // Comments on a list go to the item with their thread's quote.
  const comments = (await tx.execute({ sql: `SELECT id, root_id, block_id, quote FROM comments WHERE session_id = ? AND block_id IN (${lists.map(() => '?').join(', ')})`, args: [sid, ...lists.map((l) => l.id)] })).rows;
  const quoteOf = new Map(comments.map((c) => [String(c.id), c.quote === null ? null : String(c.quote)]));
  for (const c of comments) {
    const s = splits.get(String(c.block_id))!;
    const shown = s.items.filter((b) => b.status !== 'deleted' || s.items.every((x) => x.status === 'deleted'));
    const quote = quoteOf.get(String(c.root_id ?? c.id)) ?? (c.quote === null ? null : String(c.quote));
    const texts = shown.map((b) => plain(parseItem(b.type as ListItemType, b.content).text));
    const exact = quote ? shown[texts.findIndex((t) => t.includes(plain(quote)))] : undefined;
    const closest = quote && !exact ? closestByWords(quote, shown, texts) : undefined;
    const to = exact ?? closest ?? shown[0] ?? s.items[0];
    if (!to) continue;
    if (closest) report.comments_by_shared_words += 1;
    else if (!exact && quote) report.comments_on_first_item += 1;
    report.comments_moved += 1;
    await tx.execute({ sql: 'UPDATE comments SET block_id = ? WHERE id = ?', args: [to.id, String(c.id)] });
  }
  return true;
}
