/**
 * Session bundle. `buildBundle` reads everything for one session and returns the file set;
 * `zip.ts` packs it, `rebuild.ts` checks it. Besides the JSON and JSONL files, every doc is
 * rendered to `docs/<nn>-<name>.md` (its live blocks, in order), and the system prompt and
 * config behind each hash the session and its gateway calls name go under `config/`.
 */
import { Block, BlockRevision, createState, docsOf, SessionJson, toMarkdown, type BundleFile, type Event } from '@edw/shared';
import type { AppDeps } from '../deps.js';
import { rowToProject, rowToRevision } from '../db/rows.js';
import { rowToComment } from '../comments/store.js';
import { loadConfigVersions } from '../config-versions.js';
import { loadGatewayCalls, loadTurns } from '../gateway/history.js';
import { notFound } from '../http-error.js';
import { translateListEvents } from './listEvents.js';
import { buildTextEvents } from './textEvents.js';
import { loadBoard } from '../make/store.js';
import { classesForBundle } from '../classes/bundle.js';

export type BundleDeps = Pick<AppDeps, 'db' | 'sessions' | 'threads' | 'events' | 'canvas' | 'env'>;
export interface BundleResult {
  files: Record<string, string | Uint8Array>;
  label: string;
}

const json = (v: unknown): string => JSON.stringify(v, null, 2) + '\n';
const jsonl = (rows: unknown[]): string => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

/** A file-name-safe slug of a doc name. */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

export async function buildBundle(deps: BundleDeps, sessionId: string): Promise<BundleResult> {
  const { db } = deps;
  const session = await deps.sessions.get(sessionId);
  if (!session) throw notFound('session');

  const sessionJson = SessionJson.parse({
    session_id: session.session_id,
    label: session.label,
    tool_version: deps.env.TOOL_VERSION,
    config_hash: session.config_hash,
    system_prompt_hash: session.system_prompt_hash,
    created_at: session.created_at,
    first_opened_at: session.first_opened_at,
    access: session.access,
    features: session.features,
  });

  const events: Event[] = await deps.events.list(sessionId);
  const threads = await deps.threads.list(sessionId);
  // Reference files, deleted ones too (marked), each with its extracted text; the originals stay in the bucket.
  const refRows = await db.execute('SELECT * FROM reference_files WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
  const refPages = await db.execute('SELECT file_id, page, text FROM reference_pages WHERE session_id = ? ORDER BY file_id, page', [sessionId]);
  const references = refRows.rows.map((r) => ({
    ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'storage_key')),
    has_original: r.storage_key != null,
    text: refPages.rows.filter((p) => p.file_id === r.id).map((p) => `[page ${Number(p.page)}]\n${String(p.text)}`).join('\n\n'),
  }));
  const projects = (await db.execute('SELECT * FROM projects WHERE session_id = ? ORDER BY created_at, id', [sessionId])).rows.map(rowToProject);
  // Deleted docs too (marked with deleted_at), with their blocks.
  const snap = await deps.canvas.snapshot(sessionId, undefined, { withDeleted: true });
  const blocks = snap.blocks.map((b) => Block.parse(b)).sort((a, b) => a.id.localeCompare(b.id));
  const state = createState(sessionId, blocks, snap.docs);
  const docs = docsOf(state);

  const revRows = await db.execute(
    `SELECT r.* FROM block_revisions r JOIN blocks b ON b.id = r.block_id
     WHERE b.session_id = ? ORDER BY r.block_id, r.version`,
    [sessionId],
  );
  const revisions = revRows.rows.map((r) => BlockRevision.parse(rowToRevision(r)));
  const calls = (await loadGatewayCalls(db, sessionId)).sort((a, b) => a.at.localeCompare(b.at));
  const turns = await loadTurns(db, sessionId);
  // Every comment, deleted ones too (marked), oldest first.
  const comments = (await db.execute('SELECT * FROM comments WHERE session_id = ? ORDER BY created_at, rowid', [sessionId])).rows.map(rowToComment);
  // Lists split into a block per item: earlier events are written against the items (listEvents.ts).
  // A database from before migration 0019 has no table, and so no splits.
  const hasSplits = (await db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'block_splits'")).rows.length > 0;
  const splitRows = hasSplits
    ? (await db.execute(`SELECT s.list_block_id, s.version, s.item_index, s.item_block_id FROM block_splits s JOIN blocks b ON b.id = s.list_block_id WHERE b.session_id = ?`, [sessionId])).rows
    : [];
  const splits = splitRows.map((r) => ({ list_block_id: String(r.list_block_id), version: Number(r.version), item_index: Number(r.item_index), item_block_id: String(r.item_block_id) }));
  const lists = translateListEvents(events, revisions, blocks, splits, new Map(comments.map((c) => [c.id, c.block_id])));
  const text = buildTextEvents(lists.events, lists.revisions, blocks.filter((b) => !lists.lists.has(b.id)));

  // Typed by BUNDLE_FILES (shared/src/bundle.ts): a file missing here, or not listed there, does not compile.
  const data: Record<Exclude<BundleFile, 'MANIFEST.json'>, string> = {
    'session.json': json(sessionJson),
    'projects.json': json(projects),
    'classes.json': json(await classesForBundle(db, sessionId)),
    'threads.json': json(threads),
    'docs.json': json(docs),
    'blocks.json': json(blocks),
    'revisions.jsonl': jsonl(revisions),
    'events.jsonl': jsonl(lists.events),
    'chat_turns.jsonl': jsonl(turns),
    'gateway_calls.jsonl': jsonl(calls),
    'text_events.jsonl': jsonl(text.lines),
    'comments.jsonl': jsonl(comments),
    'references.jsonl': jsonl(references),
    // The make kit's board: placed feature cards, the teacher's ideas and their feedback on the editor.
    'make_board.json': json(await loadBoard(db, sessionId)),
  };
  const files: Record<string, string> = { ...data };
  docs.forEach((d, i) => {
    files[`docs/${String(i + 1).padStart(2, '0')}-${slug(d.name)}.md`] = `# ${d.name}\n\n${toMarkdown(state, d.id)}`;
  });

  // The exact prompt and config text by hash. A session can outlive a prompt change, so its
  // calls may name more than one system prompt.
  const promptHashes = [...new Set([session.system_prompt_hash, ...calls.map((c) => c.system_prompt_hash)])];
  const versions = await loadConfigVersions(db, [session.config_hash, ...promptHashes]);
  const configFiles: Record<string, string> = {};
  for (const v of versions) {
    const file = v.kind === 'system_prompt' ? `config/system_prompt-${v.hash.slice(0, 12)}.md` : `config/app.config-${v.hash.slice(0, 12)}.json`;
    files[file] = v.content;
    configFiles[v.hash] = file;
  }
  const missing = [session.config_hash, ...promptHashes].filter((h) => !configFiles[h]);
  files['MANIFEST.json'] = json({
    files: [...Object.keys(files), 'MANIFEST.json'].sort(),
    notes: {
      'projects.json': 'Every project, archived ones too (archived_at set). Each thread names its project in project_id (null: not in a project).',
      'classes.json':
        "Schools (by id only: their names stay with the teacher), year groups and classes, archived ones too, each class and year group in a school year (2026-27) and with its notes in full. This file holds no pupil rows (option B, docs/classes.md): each class has pupil_table, the shape of its live table (rows, a count of each need, a sha256 of the contents), which the model was sent in full in that class's chats. The rows themselves are in this bundle all the same, in gateway_calls.jsonl, in the requests of those chats, for every call logged while the config had pupil_rows_in_gateway_log \"full\" (the config behind each call is under config/); with \"shape\" a placeholder with the row count and hash stands in. Each thread names its class or year group in class_id or year_group_id.",
      'references.jsonl': "Every reference file uploaded to a project, deleted ones too (deleted_at set), with its extracted text ([page N] before each page). The originals are not included.",
      'make_board.json': "The make kit's board (/make/<token>): feature cards placed on the editor (placed: card id and place), the teacher's own ideas as the model designed them, and their feedback on parts of the editor, keyed by the part's name. What they did is in events.jsonl as make_action, the model's designs as make_design.",
      'docs/': 'One markdown file per doc: its live blocks in order, under the doc name.',
      'text_events.jsonl':
        "One line per change to block text, CoAuthor-shaped (textDelta.ops over the block markdown, code points). Replaying a block's lines in order gives its stored text.",
      text_events_stats: text.stats,
      ...(lists.stats.lists
        ? {
            list_items:
              "Lists were moved to a block per item (7 Nov 2026 onwards; derived_from on an item names its old list block, now deleted). Earlier events that named a list are written in events.jsonl against the item they touched, keeping their seq and event_id, with payload.split_from naming the list; one that touched several items is one line per item. text_events.jsonl replays the items, not the lists; revisions.jsonl keeps both. list_items_stats.seqs lists the events translated.",
            list_items_stats: lists.stats,
          }
        : {}),
      'config/': 'The system prompt and app config by hash (session.json and gateway_calls.jsonl name them); the file name starts with the hash.',
      config_files: configFiles,
      ...(missing.length
        ? { config_missing: `Not recorded by this server (sessions from before it kept them): ${missing.join(', ')}. Find them in git with: node scripts/find-config-version.mjs <hash>` }
        : {}),
    },
  });
  return { files, label: session.label };
}
