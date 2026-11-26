/** Test-only helpers: a migrated temp-file database, the real config, and a ready-made workspace. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newUlid, nowIso, type Block, type ClientEvent, type Doc, type LoadedConfig, type ProviderAdapter, type Thread } from '@edw/shared';
import { loadAppConfig } from '@edw/shared/node';
import { createCanvasService, type CanvasServiceImpl } from './blocks/index.js';
import { findRepoRoot, type Env } from './env.js';
import { openDb, type Db } from './db/client.js';
import { migrate } from './db/migrate.js';
import type { AppDeps, ServerEnvelope, SessionRow } from './deps.js';
import { createEventStore } from './events/store.js';
import { MockProvider } from './gateway/mock.js';
import { serialiseTransactions } from './serial-db.js';
import { createSessionService } from './sessions/service.js';
import { createThreadService } from './threads/service.js';

export interface TempDb {
  db: Db;
  cleanup(): void;
}

export async function tempDb(): Promise<TempDb> {
  const dir = mkdtempSync(path.join(tmpdir(), 'edw-srv-'));
  const db = serialiseTransactions(openDb({ url: `file:${path.join(dir, 'test.db')}` }));
  await migrate(db);
  return {
    db,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const ADMIN_PASSWORD = 'admin-secret';

export function testEnv(overrides: Partial<Env> = {}): Env {
  const root = findRepoRoot();
  return {
    DATABASE_URL: 'file::memory:',
    PROVIDER: 'mock',
    ELM_PROXY_CHAT_PATH: '/chat/completions',
    ELM_PROXY_RESPONSES_PATH: '/responses',
    ADMIN_PASSWORD,
    PORT: 0,
    HOST: '127.0.0.1',
    CONFIG_DIR: path.join(root, 'config'),
    TOOL_VERSION: 'test',
    PUBLIC_BASE_URL: 'http://localhost:5173',
    REPO_ROOT: root,
    ...overrides,
  };
}

let cachedLoaded: LoadedConfig | null = null;
/** The repo's real `config/` directory, loaded once per test file. */
export function testLoaded(): LoadedConfig {
  cachedLoaded ??= loadAppConfig(testEnv().CONFIG_DIR);
  return cachedLoaded;
}

/** The full dependency graph over a temp database, with the mock provider unless one is given. */
export function testDeps(db: Db, provider: ProviderAdapter = new MockProvider('mock-model', 1)): AppDeps & { canvas: CanvasServiceImpl } {
  const loaded = testLoaded();
  const events = createEventStore(db);
  const canvas = createCanvasService(db, events);
  const threads = createThreadService(db, canvas, events);
  const sessions = createSessionService(db, loaded, events, threads);
  return { env: testEnv(), db, loaded, provider, events, canvas, threads, sessions };
}

/** A session with its first thread and that thread's blank doc. */
export async function newWorkspace(deps: Pick<AppDeps, 'sessions'>, label = 'Teacher A'): Promise<{ session: SessionRow; thread: Thread; doc: Doc }> {
  return deps.sessions.create(label);
}

/** A server-side envelope with the given doc and thread open. */
export function envelopeFor(doc: Pick<Doc, 'id'> | null, thread: Pick<Thread, 'id'> | null, focus: ServerEnvelope['focus_pane'] = 'canvas'): ServerEnvelope {
  return { client_ts: nowIso(), focus_pane: focus, doc_id: doc?.id ?? null, thread_id: thread?.id ?? null };
}

/** A client event with a fresh id and the given context. */
export function clientEvent(kind: ClientEvent['kind'], payload: unknown, ctx: { doc_id?: string | null; thread_id?: string | null } = {}): ClientEvent {
  return {
    event_id: newUlid(),
    client_ts: nowIso(),
    focus_pane: 'canvas',
    doc_id: ctx.doc_id ?? null,
    thread_id: ctx.thread_id ?? null,
    kind,
    payload,
  } as ClientEvent;
}

export function focusEvent(ctx: { doc_id?: string | null; thread_id?: string | null } = {}): ClientEvent {
  return clientEvent('focus', { pane: 'canvas', block_id: null }, ctx);
}

/**
 * A line of the teacher's own in the doc. A blank doc takes the assistant's turn straight in
 * (shared canvas/newDocs.ts), so a test of suggestions starts with this.
 */
export async function typeLine(deps: Pick<AppDeps, 'canvas'>, sessionId: string, doc: Pick<Doc, 'id'>, thread: Pick<Thread, 'id'>, content = 'Notes for the lesson.'): Promise<Block> {
  const out = await deps.canvas.structural(sessionId, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content }, envelopeFor(doc, thread));
  return out.block!;
}
