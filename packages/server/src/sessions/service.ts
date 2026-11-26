/**
 * Sessions: a workspace reached through a participant link. Creating one makes its
 * first thread and that thread's blank doc in the same transaction.
 */
import { randomBytes } from 'node:crypto';
import type { Executor, Row, Transaction } from '../db/types.js';
import { FEATURE_NAMES, newUlid, nowIso, resolveFeatures, storedFeatures, type LoadedConfig } from '@edw/shared';
import { recordConfigVersions } from '../config-versions.js';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope, SessionRow, SessionService, ThreadService } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { isLastAdminWorkspace } from '../accounts/admins.js';
import { referenceBucketId } from '../references/service.js';
import { formatCode, newCode } from '../access/codes.js';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function rowToSession(row: Row): SessionRow {
  return {
    session_id: String(row.session_id),
    label: String(row.label),
    participant_token: String(row.participant_token),
    config_hash: String(row.config_hash),
    system_prompt_hash: String(row.system_prompt_hash),
    first_opened_at: str(row.first_opened_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    interactions_on: Number(row.interactions_on ?? 0) === 1,
    interactions_until: str(row.interactions_until),
    access: row.access === 'account' ? 'account' : 'link',
    access_code: row.access_code ? formatCode(String(row.access_code)) : null,
    link_closed_at: str(row.link_closed_at),
    // A database from before migration 0034 has no column: all on.
    features: resolveFeatures(row.features ?? null),
  };
}

/** Every table with a session_id, children first; `sessions` itself last. delete.test.ts checks the list against the database. */
export const SESSION_TABLES = [
  'sign_ins',
  'accounts',
  'account_invites',
  'preferences',
  'plugin_drafts',
  'plugin_grants',
  'plugin_settings',
  'reader_ask_texts',
  'reader_asks',
  'reader_highlights',
  'reading_prompts',
  'readings',
  'reader_prompts',
  'make_boards',
  'reference_pages',
  'reference_files',
  'comments',
  'blocks',
  'chat_turns',
  'gateway_calls',
  'budget_topups',
  'assets',
  'events',
  'docs',
  'threads',
  'pupil_adaptations',
  'class_curriculum',
  'class_members',
  'class_codes',
  'pupil_logins',
  'removed_pupils',
  'class_pupils',
  'classes',
  'year_groups',
  'schools',
  'projects',
  'sessions',
] as const;

/** A participant token: the secret in a workspace's link. */
const newToken = (): string => randomBytes(32).toString('base64url');

const SERVER: Omit<ServerEnvelope, 'client_ts'> = { focus_pane: 'none', doc_id: null, thread_id: null };

export function createSessionService(db: Db, loaded: LoadedConfig, events: EventStore, threads: ThreadService): SessionService {
  async function load(x: Executor, sessionId: string): Promise<SessionRow | null> {
    const r = await x.execute({ sql: 'SELECT * FROM sessions WHERE session_id = ?', args: [sessionId] });
    return r.rows[0] ? rowToSession(r.rows[0]) : null;
  }

  return {
    async create(label, opts = {}) {
      const access = opts.access ?? 'link';
      const run = async (tx: Transaction) => {
        const now = nowIso();
        const session: SessionRow = {
          session_id: newUlid(),
          label,
          participant_token: newToken(),
          config_hash: loaded.config_hash,
          system_prompt_hash: loaded.system_prompt_hash,
          first_opened_at: null,
          created_at: now,
          updated_at: now,
          interactions_on: false,
          interactions_until: null,
          access,
          access_code: null,
          link_closed_at: null,
          features: resolveFeatures(opts.features ?? null),
        };
        const stored = storedFeatures(session.features);
        // A link workspace gets an access code; an account workspace never does.
        const code = access === 'link' ? newCode() : null;
        if (code) session.access_code = formatCode(code);
        await tx.execute({
          sql: `INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, first_opened_at, created_at, updated_at, access, access_code, features)
                VALUES (:session_id, :label, :participant_token, :config_hash, :system_prompt_hash, :first_opened_at, :created_at, :updated_at, :access, :access_code, :features)`,
          args: { session_id: session.session_id, label, participant_token: session.participant_token, config_hash: session.config_hash, system_prompt_hash: session.system_prompt_hash, first_opened_at: null, created_at: now, updated_at: now, access, access_code: code, features: stored ? JSON.stringify(stored) : null },
        });
        // Starting with a switch away from its default (one off, or pupils on) is logged as the admin's change, so the research log always says when one changed.
        if (stored) {
          const changed = FEATURE_NAMES.filter((n) => n in stored);
          await events.appendServer(session.session_id, 'workspace_features_set', { features: session.features, changed, via: opts.via ?? 'password', ...(opts.accountId ? { account_id: opts.accountId } : {}) }, { ...SERVER, client_ts: now }, tx);
        }
        await recordConfigVersions(tx, loaded);
        const { thread, doc } = await threads.create(session.session_id, { ...SERVER, client_ts: now }, tx);
        return { session, thread, doc };
      };
      // Inside the caller's transaction (an invite claim makes the account with it), else its own.
      return opts.tx ? run(opts.tx) : db.transaction(run);
    },

    async get(sessionId) {
      return load(db.client, sessionId);
    },

    async list() {
      const r = await db.execute(
        `SELECT s.*, (SELECT MAX(e.server_ts) FROM events e WHERE e.session_id = s.session_id AND e.kind = 'participant_open') AS last_opened_at
         FROM sessions s ORDER BY s.created_at DESC, s.session_id`,
      );
      return r.rows.map((row) => ({ ...rowToSession(row), last_opened_at: str(row.last_opened_at) }));
    },

    async byParticipantToken(token) {
      if (!token) return null;
      // A closed link opens nothing (setLink also changes its token, so the old one is gone either way).
      const r = await db.execute('SELECT * FROM sessions WHERE participant_token = ? AND link_closed_at IS NULL', [token]);
      return r.rows[0] ? rowToSession(r.rows[0]) : null;
    },

    async byAccessCode(canonical) {
      if (!canonical) return null;
      const r = await db.execute("SELECT * FROM sessions WHERE access_code = ? AND access = 'link' AND link_closed_at IS NULL", [canonical]);
      return r.rows[0] ? rowToSession(r.rows[0]) : null;
    },

    async newAccessCode(sessionId) {
      return db.transaction(async (tx) => {
        const s = await load(tx, sessionId);
        if (!s) return null;
        if (s.access === 'account') return 'account';
        if (s.link_closed_at) return 'closed';
        await tx.execute({ sql: 'UPDATE sessions SET access_code = ?, updated_at = ? WHERE session_id = ?', args: [newCode(), nowIso(), sessionId] });
        return load(tx, sessionId);
      });
    },

    async setLink(sessionId, action, via) {
      return db.transaction(async (tx) => {
        const s = await load(tx, sessionId);
        if (!s) return null;
        if (s.access === 'account') return 'account';
        const now = nowIso();
        // Closing changes the token too, so nothing that checks only the token can open it.
        await tx.execute({
          sql: 'UPDATE sessions SET participant_token = ?, access_code = ?, link_closed_at = ?, updated_at = ? WHERE session_id = ?',
          args: [newToken(), action === 'replace' ? newCode() : null, action === 'close' ? now : null, now, sessionId],
        });
        await events.appendServer(sessionId, 'workspace_link', { action, via }, { ...SERVER, client_ts: now }, tx);
        return load(tx, sessionId);
      });
    },

    async recordOpen(sessionId) {
      return db.transaction(async (tx) => {
        const s = await load(tx, sessionId);
        if (!s) throw notFound('session');
        const now = nowIso();
        const first = s.first_opened_at === null;
        if (first) {
          await tx.execute({ sql: 'UPDATE sessions SET first_opened_at = ?, updated_at = ? WHERE session_id = ?', args: [now, now, sessionId] });
        }
        await events.appendServer(sessionId, 'participant_open', { first }, { ...SERVER, client_ts: now }, tx);
        return (await load(tx, sessionId)) as SessionRow;
      });
    },

    async rename(sessionId, label) {
      await db.execute('UPDATE sessions SET label = ?, updated_at = ? WHERE session_id = ?', [label, nowIso(), sessionId]);
      return load(db.client, sessionId);
    },

    async setInteractions(sessionId, on, until) {
      return db.transaction(async (tx) => {
        if (!(await load(tx, sessionId))) return null;
        const now = nowIso();
        const end = on ? until : null;
        await tx.execute({ sql: 'UPDATE sessions SET interactions_on = ?, interactions_until = ?, updated_at = ? WHERE session_id = ?', args: [on ? 1 : 0, end, now, sessionId] });
        await events.appendServer(sessionId, 'interaction_logging_set', { on, until: end }, { ...SERVER, client_ts: now }, tx);
        return load(tx, sessionId);
      });
    },

    async setFeatures(sessionId, patch, via, accountId) {
      return db.transaction(async (tx) => {
        const before = await load(tx, sessionId);
        if (!before) return null;
        const features = { ...before.features, ...patch };
        const changed = FEATURE_NAMES.filter((n) => features[n] !== before.features[n]);
        const stored = storedFeatures(features);
        const now = nowIso();
        await tx.execute({ sql: 'UPDATE sessions SET features = ?, updated_at = ? WHERE session_id = ?', args: [stored ? JSON.stringify(stored) : null, now, sessionId] });
        // Logged even when nothing changed: the admin pressed it, and the set in force is on record.
        await events.appendServer(sessionId, 'workspace_features_set', { features, changed, via, ...(accountId ? { account_id: accountId } : {}) }, { ...SERVER, client_ts: now }, tx);
        return load(tx, sessionId);
      });
    },

    async delete(sessionId) {
      return db.transaction(async (tx) => {
        if (!(await load(tx, sessionId))) return null;
        // Its account goes with it (SESSION_TABLES): never the only admin's.
        if (await isLastAdminWorkspace(tx, sessionId)) throw conflict('the last admin cannot be removed', 'last_admin');
        const assets = await tx.execute({ sql: "SELECT asset_id FROM assets WHERE session_id = ? AND storage = 'bucket'", args: [sessionId] });
        // Reference originals live in the bucket under the same scheme (bucketKey with ref_<id>).
        const refs = await tx.execute({ sql: 'SELECT id FROM reference_files WHERE session_id = ? AND storage_key IS NOT NULL', args: [sessionId] });
        // Children before parents: foreign keys are enforced.
        await tx.execute({ sql: 'DELETE FROM block_splits WHERE list_block_id IN (SELECT id FROM blocks WHERE session_id = ?)', args: [sessionId] });
        await tx.execute({ sql: 'DELETE FROM block_revisions WHERE block_id IN (SELECT id FROM blocks WHERE session_id = ?)', args: [sessionId] });
        for (const table of SESSION_TABLES) await tx.execute({ sql: `DELETE FROM ${table} WHERE session_id = ?`, args: [sessionId] });
        return { bucketAssetIds: [...assets.rows.map((r) => String(r.asset_id)), ...refs.rows.map((r) => referenceBucketId(String(r.id)))] };
      });
    },
  };
}
