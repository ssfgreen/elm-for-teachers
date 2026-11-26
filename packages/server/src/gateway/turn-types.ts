/** The chat service's public types: what a turn takes, what it returns, and what the service needs. */
import type { ChatUsage, Comment, CommentAnchor, CopyChoice, SpyglassResult, CopyRequest, Doc, EditMode, Effort, Features, SuggestView, LoadedConfig, Operation, PictureOffer, ProviderAdapter, StoredTurn, TurnStep } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope, ThreadService } from '../deps.js';
import type { PublicBlock } from '../http/views.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { CommentStore } from '../comments/store.js';
import type { PictureLibrary } from '../pictures/arasaac.js';
import type { DraftChat } from '../plugins/drafts/chat.js';
import type { LibraryClient } from '../plugins/library-client.js';
import type { PluginService } from '../plugins/service.js';
import type { TurnPlugins } from './turn-plugins.js';
import type { ProjectService } from '../projects/service.js';
import type { AgentState } from './agent.js';
import type { StopControl } from './stop.js';
import type { AgentTool } from './tools/types.js';
import type { CommittedTurn } from './turn-checks.js';
import type { WorkingView } from './view.js';
import type { PreferenceService } from '../preferences/service.js';

/** The chat pane's wording for any failed turn. */
export const TURN_FAILED_MESSAGE = "The assistant couldn't respond; please try again";
export const TURN_STOPPED_MESSAGE = 'Stopped';

export interface TurnInput {
  thread_id: string;
  /** The doc the teacher has open; inserts without a `doc` go here. */
  doc_id: string;
  text: string;
  envelope: Omit<ServerEnvelope, 'doc_id' | 'thread_id'>;
  /** The teacher commented on a passage (@model): the block and selection the text is about. */
  anchor?: CommentAnchor;
  /**
   * The teacher's @model comment in a doc's comment thread: the turn answers in that thread
   * (the reply is posted there, not in the chat), with the thread's passage as its anchor.
   */
  comment_id?: string;
  /** The chat's own files attached to this message with "+" (ids). */
  attachments?: string[];
  /** The model picked under the chat box (must be one of the config's) and its effort. */
  model?: string;
  effort?: Effort;
  /** Set under the chat box: the assistant's changes as suggestions (the default) or straight into the doc. */
  edit_mode?: EditMode;
  /** Suggesting turns: how suggestions look to the teacher, logged on chat_prompt. */
  suggest_view?: SuggestView;
  /** The teacher's choice of what a copy of a doc with suggestions waiting is built from (the copy choice card). */
  copy_choice?: { doc_id: string; choice: CopyChoice };
  /** The Spyglass toggle under the chat box. Absent: on (a client without the toggle). */
  spyglass?: boolean;
}

export interface PublicChanges {
  blocks: PublicBlock[];
  docs: Doc[];
  revisions: { block_id: string; version: number }[];
}

export type TurnResult =
  | {
      ok: true;
      turn_id: string;
      message: string;
      operations: Operation[];
      /** Number of operations dropped by validation. */
      dropped: number;
      changes: PublicChanges;
      proposed_block_ids: string[];
      /** Docs the model created this turn (in this thread). */
      created_doc_ids: string[];
      /** The model's reply in the comment thread, for a turn that answered an @model comment. */
      comment?: Comment;
      /** Comments the model added with its tools (new threads and replies). */
      comments?: Comment[];
      /** What the model thought and did on the way (agent mode), and how long it took. */
      steps?: TurnStep[];
      worked_ms?: number;
      /** Pictures put in from ARASAAC, with the others the teacher may swap in. */
      pictures?: PictureOffer[];
      /**
       * Editing mode: blocks the teacher typed in while the turn changed them (typed-during.ts).
       * Those not in `proposed_block_ids` have both changes in; the rest keep the teacher's text,
       * with the change waiting as a suggestion.
       */
      typed_during?: string[];
      /** Copies not made until the teacher chooses what they are built from. */
      copy_requests?: CopyRequest[];
    }
  | {
      ok: false;
      turn_id: string;
      /** TURN_FAILED_MESSAGE, or TURN_STOPPED_MESSAGE when `stopped`. */
      message: string;
      /** The model's chat text, when output was unparseable but carried a non-empty message, or the text so far of a stopped turn. */
      reply: string | null;
      /** The teacher stopped the turn (or the stream was closed): nothing was applied. */
      stopped?: boolean;
    };

export interface ChatTurnSummary {
  turn_id: string;
  doc_id: string;
  prompt: string;
  anchor: CommentAnchor | null;
  response_text: string;
  attachments: { id: string; name: string }[];
  steps?: TurnStep[];
  worked_ms?: number;
  pictures?: PictureOffer[];
  copy_requests?: CopyRequest[];
  /** Spyglass's flags, when the teacher saw them. */
  spyglass?: SpyglassResult;
  at: string;
}

export interface TurnOptions {
  /**
   * Called with each piece of the model's raw reply as it streams in (message and
   * operations fence alike). When set, the provider is asked to stream; a provider that
   * cannot (no `stream`, or an HTTP error before any text) is called normally instead.
   */
  onText?: (delta: string) => void;
  /** Agent mode: the reply so far (text, accepted operations, what the model is doing), whole each time it changes. */
  onState?: (state: AgentState) => void;
  /** Told the turn's id before the model is called, so the client can ask to stop it. */
  onStart?: (turn_id: string) => void;
  /** Aborted when the client goes away (the stream closed): the turn stops as if Stop were pressed. */
  signal?: AbortSignal;
  /** Told the result of a turn that worked as soon as it is committed, before Spyglass's checks run. */
  onResult?: (result: TurnResult) => void;
  /** Told the flags the teacher is to see, once the checks are done (not when hidden or none). */
  onSpyglass?: (turn_id: string, spyglass: SpyglassResult) => void;
}

export interface ChatService {
  runTurn(sessionId: string, input: TurnInput, opts?: TurnOptions): Promise<TurnResult>;
  /** A thread's completed turns for the chat pane on reload; never the rewritten content or operations. */
  listTurns(sessionId: string, threadId: string): Promise<ChatTurnSummary[]>;
  /** A thread's tokens so far, and their cost in pounds where the config prices its models. */
  usage(sessionId: string, threadId: string): Promise<ChatUsage>;
  /** Failed gateway calls (provider error or unparseable output). */
  errorCount(sessionId: string): Promise<number>;
}

export interface ChatServiceDeps {
  db: Db;
  events: EventStore;
  canvas: CanvasServiceImpl;
  threads: ThreadService;
  provider: ProviderAdapter;
  loaded: LoadedConfig;
  /** Where search_pictures looks (ARASAAC); none in tests unless given. */
  pictures?: PictureLibrary | null;
  /** The library server for library plugins that name none (env LIBRARY_URL). */
  libraryUrl?: string;
  /** How a library is reached (tests give a fake); default createLibraryClient. */
  libraryClient?: (url: string) => LibraryClient;
  /** The workspace's studio drafts for a turn (#159); none when drafts are off (PLUGIN_STUDIO_URL unset). */
  drafts?: DraftChat;
  /** How long a request may run (env FUNCTION_LIMIT_MS); default turn-checks' FUNCTION_LIMIT_MS. */
  functionLimitMs?: number;
}

/** Who and what a turn is about, settled before the model is called. */
export interface TurnContext {
  sessionId: string;
  thread: { id: string; project_id: string | null; class_id?: string | null; year_group_id?: string | null };
  input: TurnInput;
  envelope: ServerEnvelope;
  turn_id: string;
  /** The passage the turn is about (null when none, or when a comment's block has gone). */
  anchor: CommentAnchor | null;
  /** Files attached with "+", checked to be this chat's own. */
  attachments: { id: string; name: string }[];
  /** The @model comment's thread this turn answers, if any. */
  commentThread: { root: Comment; items: Comment[] } | null;
  /** The workspace's switches (shared/src/features.ts): what is off, the model hears nothing about. */
  features: Features;
}

/** A turn ready for the model: its context, plus what the model is to see. */
export interface PreparedTurn extends TurnContext {
  model: { id: string; effort: 'low' | 'medium' | 'high' | 'none' };
  opts: TurnOptions;
  /** The thread's docs when the turn began. */
  snapshot: WorkingView;
  kept: StoredTurn[];
  /** The summary of the turns before `kept` (null when there are none). */
  runningSummary: string | null;
  anchorInfo: { block_id: string; type: string; quote: string | null } | null;
  /** The teacher's text as the model reads it (wrapped in its comment thread for an @model comment). */
  promptText: string;
  stop: StopControl;
  /** Agent mode: the plugins this turn may use (turn-plugins.ts). */
  plugins: TurnPlugins;
  /** Filled by the commit: what Spyglass's checks need (turn-checks.ts). */
  checks: { committed?: CommittedTurn };
}

/** What the agent and single turns need: the service's deps, and the stores built from them. */
export interface TurnDeps extends ChatServiceDeps {
  comments: CommentStore;
  projects: ProjectService;
  agentTools: AgentTool[];
  plugins: PluginService;
  preferences: PreferenceService;
}
