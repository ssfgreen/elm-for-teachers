import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, nowIso, type Block, type Doc, type Event } from '@edw/shared';
import { openDb, type Db } from './client.js';
import { migrate } from './migrate.js';
import { rowToSession } from '../sessions/service.js';
import { blockToRow, docToRow, eventToRow, revisionToRow, rowToBlock, rowToDoc, rowToEvent, rowToRevision } from './rows.js';

// Every migration in the directory, in the order `migrate` applies them (by name).
const ALL_MIGRATIONS = readdirSync(new URL('./migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();

let dir: string;
let db: Db;
const now = nowIso();
const S = 'S1';
const T = newUlid();
const D = newUlid();

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'edw-db-'));
  db = openDb({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  await db.execute(
    `INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at) VALUES (?, 'A', ?, 'h', 'h', ?, ?)`,
    [S, `tok-${S}`, now, now],
  );
  await db.execute(`INSERT INTO threads (id, session_id, title, created_at) VALUES (?, ?, 'New chat', ?)`, [T, S, now]);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeEvent(seq: number, event_id = newUlid()): Event {
  return { session_id: S, seq, event_id, kind: 'doc_open', payload: { doc_id: D }, client_ts: now, server_ts: now, focus_pane: 'canvas', doc_id: D, thread_id: T } as Event;
}
async function insertEvent(e: Event) {
  await db.execute(
    `INSERT INTO events (session_id, seq, event_id, kind, client_ts, server_ts, focus_pane, doc_id, thread_id, payload)
     VALUES (:session_id, :seq, :event_id, :kind, :client_ts, :server_ts, :focus_pane, :doc_id, :thread_id, :payload)`,
    eventToRow(e),
  );
}

describe('migrate', () => {
  it('finds the migrations, starting from the editor schema', () => {
    expect(ALL_MIGRATIONS[0]).toBe('0004_editor.sql');
    expect(ALL_MIGRATIONS).toContain('0045_readings.sql');
  });

  it('is idempotent and reports only the editor schema on a fresh database', async () => {
    expect((await migrate(db)).applied).toEqual([]);
    const fresh = openDb({ url: `file:${path.join(dir, 'fresh.db')}` });
    expect((await migrate(fresh)).applied).toEqual(ALL_MIGRATIONS);
    const tables = (await fresh.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map((r) => r.name);
    expect(tables).toEqual([
      'account_invites',
      'accounts',
      'assets',
      'block_revisions',
      'block_splits',
      'blocks',
      'budget_topups',
      'chat_turns',
      'class_codes',
      'class_curriculum',
      'class_members',
      'class_pupils',
      'classes',
      'comments',
      'config_versions',
      'content_packs',
      'docs',
      'events',
      'gateway_calls',
      'jobs',
      'make_boards',
      'moderation_checks',
      'needs_group_adaptations',
      'needs_group_classes',
      'needs_groups',
      'plugin_drafts',
      'plugin_grants',
      'plugin_settings',
      'preferences',
      'projects',
      'pupil_adaptations',
      'pupil_logins',
      'pupil_sign_ins',
      'pupils',
      'reader_ask_texts',
      'reader_asks',
      'reader_highlights',
      'reader_prompts',
      'reading_prompts',
      'readings',
      'reference_files',
      'reference_pages',
      'removed_pupils',
      'schema_migrations',
      'schools',
      'sessions',
      'sign_ins',
      'threads',
      'year_groups',
    ]);
    fresh.close();
  });

  it('drops the study tables from a database that had them', async () => {
    const old = openDb({ url: `file:${path.join(dir, 'old.db')}` });
    await old.execute('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
    await old.execute("INSERT INTO schema_migrations VALUES ('0001_init.sql', 'x'), ('0002_assets.sql', 'x'), ('0003_repair_retyped_blocks.sql', 'x')");
    await old.execute('CREATE TABLE versions (id TEXT)');
    await old.execute('CREATE TABLE phase_timings (session_id TEXT)');
    await old.execute('CREATE TABLE sessions (session_id TEXT, participant_code TEXT)');
    expect((await migrate(old)).applied).toEqual(ALL_MIGRATIONS);
    const tables = (await old.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
    expect(tables).not.toContain('versions');
    expect(tables).not.toContain('phase_timings');
    const cols = (await old.execute('PRAGMA table_info(sessions)')).rows.map((r) => String(r.name));
    expect(cols).toContain('label');
    old.close();
  });
});

describe('migration 0005', () => {
  it('keeps images already in the database, as ready database images', async () => {
    const before = openDb({ url: `file:${path.join(dir, 'before5.db')}` });
    const sql = readFileSync(new URL('./migrations/0004_editor.sql', import.meta.url), 'utf8');
    for (const stmt of sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((x) => x.trim()).filter(Boolean)) await before.execute(stmt);
    await before.execute('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
    await before.execute("INSERT INTO schema_migrations VALUES ('0004_editor.sql', 'x')");
    await before.execute("INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at) VALUES ('S', 'x', 't', 'h', 'h', 'n', 'n')");
    await before.execute("INSERT INTO assets (asset_id, session_id, mime, bytes, filename, data, created_at) VALUES ('ast_1', 'S', 'image/png', 3, 'a.png', X'010203', 'n')");
    expect((await migrate(before)).applied).toEqual(ALL_MIGRATIONS.filter((f) => f !== '0004_editor.sql'));
    const row = (await before.execute('SELECT * FROM assets')).rows[0]!;
    expect({ storage: row.storage, status: row.status, bytes: row.bytes }).toEqual({ storage: 'db', status: 'ready', bytes: 3 });
    expect(Buffer.from(row.data as ArrayBuffer)).toEqual(Buffer.from([1, 2, 3]));
    before.close();
  });
});

describe('rows', () => {
  it('round-trips an event, a doc, a block with pending, and a revision', async () => {
    const e = makeEvent(1);
    await insertEvent(e);
    expect(rowToEvent((await db.execute('SELECT * FROM events')).rows[0]!)).toEqual(e);

    const doc: Doc = { id: D, session_id: S, thread_id: T, name: 'Untitled', created_by: 'teacher', created_at: now };
    await db.execute('INSERT INTO docs (id, session_id, thread_id, name, created_by, created_at) VALUES (:id, :session_id, :thread_id, :name, :created_by, :created_at)', docToRow(doc));
    expect(rowToDoc((await db.execute('SELECT * FROM docs')).rows[0]!)).toEqual(doc);

    const block: Block = {
      id: newUlid(), session_id: S, doc_id: D, type: 'paragraph', content: 'Hi', origin: 'model', origin_turn: 't', status: 'live',
      version: 1, derived_from: null, order: 0, pending: { op: 'replace', turn_id: 't', content: 'Hello' }, created_at: now, updated_at: now,
    };
    await db.execute(
      `INSERT INTO blocks (id, session_id, doc_id, type, content, origin, origin_turn, status, version, derived_from, "order", pending, created_at, updated_at)
       VALUES (:id, :session_id, :doc_id, :type, :content, :origin, :origin_turn, :status, :version, :derived_from, :order, :pending, :created_at, :updated_at)`,
      blockToRow(block),
    );
    expect(rowToBlock((await db.execute('SELECT * FROM blocks')).rows[0]!)).toEqual(block);

    const rev = { block_id: block.id, version: 1, actor: 'model' as const, before: null, after: { content: 'Hi' }, cause_event_id: e.event_id, at: now };
    await db.execute('INSERT INTO block_revisions (block_id, version, actor, before, after, cause_event_id, at) VALUES (:block_id, :version, :actor, :before, :after, :cause_event_id, :at)', revisionToRow(rev));
    expect(rowToRevision((await db.execute('SELECT * FROM block_revisions')).rows[0]!)).toEqual(rev);
  });
});

describe('constraints', () => {
  it('rejects a duplicate (session_id, seq) and a duplicate event_id', async () => {
    const e = makeEvent(1);
    await insertEvent(e);
    await expect(insertEvent(makeEvent(1))).rejects.toThrow();
    await expect(insertEvent(makeEvent(2, e.event_id))).rejects.toThrow();
  });

  it('rejects an unknown origin or status and a doc in no thread', async () => {
    await expect(
      db.execute(`INSERT INTO docs (id, session_id, thread_id, name, created_by, created_at) VALUES (?, ?, ?, 'x', 'injector', ?)`, [newUlid(), S, T, now]),
    ).rejects.toThrow(/CHECK|constraint/i);
    await expect(
      db.execute(
        `INSERT INTO blocks (id, session_id, doc_id, type, content, origin, status, version, "order", created_at, updated_at) VALUES (?, ?, ?, 'paragraph', '', 'injected', 'live', 1, 0, ?, ?)`,
        [newUlid(), S, D, now, now],
      ),
    ).rejects.toThrow(/CHECK|constraint/i);
  });
});

describe('transaction', () => {
  it('commits on success and rolls back when the callback throws', async () => {
    expect(await db.transaction(async (tx) => (await tx.execute({ sql: "UPDATE threads SET title = 'A' WHERE id = ?", args: [T] }), 7))).toBe(7);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute({ sql: "UPDATE threads SET title = 'B' WHERE id = ?", args: [T] });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await db.execute('SELECT title FROM threads')).rows[0]?.title).toBe('A');
  });
});

describe('sessions.features (0034)', () => {
  it('reads a workspace with no stored switches as the defaults (all on but pupils), and stored ones as stored', async () => {
    const all = (await db.execute('SELECT * FROM sessions WHERE session_id = ?', [S])).rows[0]!;
    expect(all.features).toBeNull();
    expect(rowToSession(all).features).toEqual({ classes: true, needs_groups: true, curriculum: true, pedagogy: true, preferences: true, spyglass: true, plugins: true, pupils: false });
    await db.execute('UPDATE sessions SET features = ? WHERE session_id = ?', ['{"spyglass":false,"classes":false}', S]);
    const some = (await db.execute('SELECT * FROM sessions WHERE session_id = ?', [S])).rows[0]!;
    expect(rowToSession(some).features).toMatchObject({ spyglass: false, classes: false, curriculum: true });
  });
});
