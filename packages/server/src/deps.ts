/**
 * Shared interfaces between server modules. Each module implements its own part;
 * `app.ts` assembles them.
 */
import type { Transaction } from "./db/types.js";
import type { ApplyResult, Block, CanvasState, ClientEvent, CopyChoice, Doc, Event, EventKind, Features, FeaturesPatch, FocusPane, LoadedConfig, Operation, PayloadOfKind, ProviderAdapter, Thread } from "@edw/shared";
import type { StructuralResult } from "./blocks/service.js";
import type { StructuralCommand } from "./blocks/structural.js";
import type { PictureLibrary } from "./pictures/arasaac.js";
import type { Bucket } from "./assets/bucket.js";
import type { Db } from "./db/client.js";
import type { Env } from "./env.js";
import type { LibraryClient } from "./plugins/library-client.js";
import type { AccountStore } from "./accounts/store.js";
import type { ProviderSettings } from "./accounts/providers.js";

/* -------------------------------------------------------------- sessions */

/**
 * A workspace reached through a participant link. When teachers get accounts, a
 * session will belong to an account and the link token becomes one way in; the
 * participant guard (auth.ts) is the only place that resolves who is asking.
 */
export interface SessionRow {
  session_id: string;
  label: string;
  participant_token: string;
  config_hash: string;
  system_prompt_hash: string;
  first_opened_at: string | null;
  created_at: string;
  updated_at: string;
  /** Interaction logging switched on in /admin (sessions/interactions.ts); see `interactions_until`. */
  interactions_on: boolean;
  /** When interaction logging stops by itself; null: when it is turned off. */
  interactions_until: string | null;
  /** 'link': reached by its participant link; 'account': belongs to one signed-in account (accounts/store.ts). */
  access: SessionAccess;
  /** Typed to open a link workspace without its link, as `XXXX-XXXX-XXXX` (access/codes.ts); null for an account workspace or an older one without. */
  access_code: string | null;
  /** When the admin closed its link (no token or code opens it until a new link is issued); null while it works. */
  link_closed_at: string | null;
  /** The feature switches in force (shared/src/features.ts); stored as only those that differ from the defaults. */
  features: Features;
}

export type SessionAccess = "link" | "account";

export interface SessionService {
  /** A new session with one thread holding one blank "Untitled" doc. */
  /** `access` defaults to 'link'; with `tx` it runs inside the caller's transaction. */
  /** `features`: switches to start with (the rest on), logged as `workspace_features_set` with `via` (and `accountId`, the admin's account) when any is off. */
  create(label: string, opts?: { access?: SessionAccess; tx?: Transaction; features?: FeaturesPatch; via?: 'account' | 'password'; accountId?: string }): Promise<{ session: SessionRow; thread: Thread; doc: Doc }>;
  get(sessionId: string): Promise<SessionRow | null>;
  /** Newest first, each with when its link was last opened (its latest `participant_open`). */
  list(): Promise<(SessionRow & { last_opened_at: string | null })[]>;
  /** Resolve a participant token to its session, or null when unknown. */
  byParticipantToken(token: string): Promise<SessionRow | null>;
  /** The link workspace whose access code this is (canonical form, access/codes.ts), or null. */
  byAccessCode(canonical: string): Promise<SessionRow | null>;
  /** Give a link workspace a new access code, replacing any it had; null when there is no such session, 'account' for an account workspace. */
  newAccessCode(sessionId: string): Promise<SessionRow | 'account' | 'closed' | null>;
  /**
   * `replace`: a new link and access code for a link workspace (the old ones stop working);
   * `close`: both stop working and none is issued. Logs `workspace_link`. Null when there is no
   * such session, 'account' for an account workspace.
   */
  setLink(sessionId: string, action: 'replace' | 'close', via: 'account' | 'password'): Promise<SessionRow | 'account' | null>;
  /** The participant opened their link: log `participant_open` (and stamp the first open). */
  recordOpen(sessionId: string): Promise<SessionRow>;
  /** Change the session's name (admin only); null when there is no such session. */
  rename(sessionId: string, label: string): Promise<SessionRow | null>;
  /** Turn interaction logging on (until `until`, or until turned off) or off, and log it; null when there is no such session. */
  setInteractions(sessionId: string, on: boolean, until: string | null): Promise<SessionRow | null>;
  /**
   * Apply `patch` to the workspace's feature switches (keys left out keep their value) and log
   * `workspace_features_set` in the same transaction, naming the admin's account (`accountId`)
   * when signed in with one; null when there is no such session.
   */
  setFeatures(sessionId: string, patch: FeaturesPatch, via: 'account' | 'password', accountId?: string): Promise<SessionRow | null>;
  /**
   * Delete the session and everything in it (threads, docs, blocks, events, chat, images).
   * Returns the ids of its bucket images, which the caller removes from the bucket, or
   * null when there was no such session.
   */
  delete(sessionId: string): Promise<{ bucketAssetIds: string[] } | null>;
}

/* --------------------------------------------------------------- threads */

export interface ThreadService {
  /** Every thread, those in deleted projects too (the research export). */
  list(sessionId: string): Promise<Thread[]>;
  /** The threads the teacher sees: none in a deleted project. */
  listForTeacher(sessionId: string): Promise<Thread[]>;
  get(sessionId: string, threadId: string, tx?: Transaction): Promise<Thread | null>;
  /**
   * A new thread with one blank doc, both logged (`thread_create`, `doc_create`). `place` (a
   * project id, or a project, class or year group, at most one) must be this session's and not
   * archived; the chat belongs to it.
   */
  create(sessionId: string, envelope: ServerEnvelope, tx?: Transaction, place?: string | null | { project_id?: string | null; class_id?: string | null; year_group_id?: string | null }): Promise<{ thread: Thread; doc: Doc }>;
  setTitle(threadId: string, title: string, tx: Transaction): Promise<void>;
  /** The teacher names a thread; logged as `thread_rename`. Null when the thread is not this session's. */
  /** `auto`: named by the model (the wand), not typed. */
  /** With `ifTitle`, renames only a thread still called that, and otherwise returns it as it is. */
  rename(sessionId: string, threadId: string, title: string, envelope: ServerEnvelope, auto?: boolean, ifTitle?: string): Promise<Thread | null>;
  runningSummary(threadId: string, tx?: Transaction): Promise<string | null>;
  /** The summary and how many of the thread's oldest chat turns it covers (null: not recorded, an older thread). */
  summaryState(threadId: string, tx?: Transaction): Promise<{ summary: string | null; turns: number | null }>;
  setRunningSummary(threadId: string, summary: string | null, tx?: Transaction, turns?: number | null): Promise<void>;
}

/* ---------------------------------------------------------------- events */

export interface ServerEnvelope {
  client_ts: string;
  focus_pane: FocusPane;
  /** The doc and thread the teacher had open (null when not applicable). */
  doc_id: string | null;
  thread_id: string | null;
  /**
   * Use this event id instead of a fresh one: a structural command's revisions cite
   * their cause before the event is written, so the event must carry that id.
   */
  event_id?: string;
}

export type EventHook = (event: Event, tx: Transaction) => Promise<void>;

export interface EventStore {
  /**
   * Append client events in order. Assigns seq and server_ts, drops events whose
   * event_id already exists (beacon duplicates) and runs the registered hooks for
   * each stored event inside the same transaction.
   */
  appendClient(sessionId: string, events: ClientEvent[]): Promise<{ accepted: number; last_seq: number; stored: Event[] }>;
  /** Append a server-originated event (block_revision, block_structure, chat_response, ...). */
  appendServer<K extends EventKind>(sessionId: string, kind: K, payload: PayloadOfKind<K>, envelope: ServerEnvelope, tx?: Transaction): Promise<Event>;
  list(sessionId: string, opts?: { fromSeq?: number; toSeq?: number; kinds?: EventKind[] }): Promise<Event[]>;
  lastSeq(sessionId: string): Promise<number>;
  /** How many events of this kind the session has with server_ts after `since` (for rate limits). */
  countSince(sessionId: string, kind: EventKind, since: string): Promise<number>;
  /** Hooks run for every stored client event, in registration order, inside the append transaction. */
  addHook(hook: EventHook): void;
}

/* ---------------------------------------------------------------- canvas */

export interface CanvasSnapshot {
  blocks: Block[];
  docs: Doc[];
}

export interface CanvasService {
  /** The live docs and their blocks; `withDeleted` adds deleted docs (marked) and theirs, for the export. */
  snapshot(sessionId: string, tx?: Transaction, opts?: { withDeleted?: boolean }): Promise<CanvasSnapshot>;
  loadState(sessionId: string, tx?: Transaction): Promise<CanvasState>;
  /** Model operations (already validated) become proposals; with `direct` (Editing mode) they go straight in, as they do into a doc the turn made or a blank doc. */
  applyTurn(
    sessionId: string,
    p: { operations: Operation[]; turn_id: string; cause_event_id: string; thread_id: string; default_doc_id: string; direct?: boolean; hold?: readonly string[]; copy_choices?: Readonly<Record<string, CopyChoice>> },
    opts: { tx?: Transaction; envelope: ServerEnvelope },
  ): Promise<ApplyResult & { new_ids: string[]; /** Blocks taken in because they are in a doc the turn made, or one that was blank (Suggesting mode). */
    new_doc_block_ids: string[];
    /** Docs that were blank, where the turn's changes went straight in for that reason (Suggesting mode). */
    blank_doc_ids: string[] }>;
  /** Teacher structural commands from the REST routes. */
  structural(sessionId: string, cmd: StructuralCommand, envelope: ServerEnvelope): Promise<StructuralResult>;
}

/* ------------------------------------------------------------------ deps */

export interface AppDeps {
  env: Env;
  db: Db;
  loaded: LoadedConfig;
  provider: ProviderAdapter;
  sessions: SessionService;
  /** Teacher accounts and invites (accounts/store.ts); built from `db` and `sessions` when not given. */
  accounts?: AccountStore;
  /** Sign-in providers (accounts/providers.ts); from the environment when not given. `fetch` replaces fetch to the issuers (tests). */
  signIn?: { providers?: ProviderSettings[]; fetch?: typeof fetch };
  threads: ThreadService;
  events: EventStore;
  canvas: CanvasService;
  /** Where images go when a bucket is configured; null keeps them in the database. */
  bucket?: Bucket | null;
  /** The picture library the assistant searches and the teacher picks from (ARASAAC); none in tests unless given. */
  pictures?: PictureLibrary | null;
  /** How a library server is reached (tests give a fake); default createLibraryClient. */
  libraryClient?: (url: string) => LibraryClient;
  /** How the plugin studio is reached to read a draft's name (tests give a fake); default fetch. */
  studioFetch?: typeof fetch;
}

export const PARTICIPANT_TOKEN_QUERY = "token";
