import type { Comment, CommentAnchor, CopyChoice, CopyRequest, Features, FocusPane, Operation, PictureOffer, SpyglassMode, SpyglassResult, Thread, TurnStep } from '@edw/shared';
import type { CanvasChanges } from '../editor/types.js';

export type { CanvasChanges };

/** GET /api/sessions/:id */
export interface SessionInfo {
  session_id: string;
  label: string;
  config: {
    thresholds: { selection_throttle_ms: number; scroll_throttle_ms: number; event_batch_ms: number };
    /** 'bucket': images go straight to the storage bucket; 'inline': they are sent to the server. */
    uploads?: 'bucket' | 'inline';
    /** Interaction logging is on for this workspace (set in /admin): pointer, clicks and layout are logged. */
    interactions?: boolean;
    /** What Spyglass offers (absent: an older server, nothing): `off` hides its toggle and callout. */
    spyglass?: SpyglassMode;
    /** The workspace's feature switches (absent: an older server, read as the defaults). */
    features?: Features;
    /** Agent mode: the models the teacher can pick under the chat box, and the defaults. */
    models?: { id: string; label: string; group?: string; reasoning: boolean }[];
    default_model?: string;
    default_effort?: 'low' | 'medium' | 'high';
  };
}

/** Envelope sent with every participant write that the server logs. */
export interface Envelope {
  client_ts: string;
  focus_pane: FocusPane;
  doc_id: string | null;
  thread_id: string | null;
}

export type ChatReply =
  | {
      ok: true;
      turn_id: string;
      message: string;
      changes: CanvasChanges;
      proposed_block_ids: string[];
      /** Docs the model created this turn, in this thread. */
      created_doc_ids: string[];
      /** For a turn that answered an @model comment: the assistant's reply in that thread. */
      comment?: Comment;
      /** Comments the model added with its tools (new threads and replies). */
      comments?: Comment[];
      steps?: TurnStep[];
      worked_ms?: number;
      /** Pictures put in from ARASAAC, with the others found, which the teacher may swap in. */
      pictures?: PictureOffer[];
      /**
       * Editing mode: blocks the teacher typed in while the turn changed them. Those not in
       * `proposed_block_ids` hold both changes (merged on the server); the rest keep the
       * teacher's text, with the change waiting beside it as a suggestion.
       */
      typed_during?: string[];
      /** Copies not made until the teacher chooses what they are built from (the copy choice). */
      copy_requests?: CopyRequest[];
    }
  | {
      ok: false;
      turn_id: string;
      message: string;
      /** The teacher stopped the turn: nothing was applied; `reply` is the text written so far. */
      stopped?: boolean;
      reply?: string | null;
    };

/** A streamed turn's Stop: abort `signal` to cut it off; `onStart` gets the turn id the stop route names. */
export interface TurnControl {
  signal?: AbortSignal;
  onStart?: (turnId: string) => void;
  /** The chat's files attached to this message with "+" (their ids). */
  attachments?: string[];
  /** The teacher's answer on the copy choice card. */
  copy_choice?: { doc_id: string; choice: CopyChoice };
  /** Spyglass's flags for the turn, which arrive after its result (the stream stays open for them). */
  onSpyglass?: (turnId: string, spyglass: SpyglassResult) => void;
}

/** Agent mode's reply while it runs: its text so far, the edits accepted so far, and what the model is doing (null once writing). */
export interface AgentState {
  text: string;
  operations: Operation[];
  status: string | null;
  /** What the model has thought and done so far (agent mode). */
  steps?: TurnStep[];
}

export interface ChatTurn {
  turn_id: string;
  doc_id: string;
  prompt: string;
  /** The passage the teacher pointed at with @model, when there was one. */
  anchor?: CommentAnchor | null;
  response_text: string | null;
  /** Files attached to the message with "+". */
  attachments?: { id: string; name: string }[];
  /** What the model thought and did on the way to the reply, and how long it took. */
  steps?: TurnStep[];
  worked_ms?: number;
  pictures?: PictureOffer[];
  copy_requests?: CopyRequest[];
  /** Spyglass's flags, when the teacher saw them. */
  spyglass?: SpyglassResult;
  at: string;
}

export type { Thread };

/** Session row as the admin page sees it (server: deps.ts SessionRow, plus the link). */
export interface AdminSessionRow {
  session_id: string;
  label: string;
  participant_token: string;
  /** 'account': made by an invite, reached by signing in; 'link': reached by its link or access code. */
  access: 'link' | 'account';
  /** Null for an account workspace: it is reached by signing in. */
  participant_url: string | null;
  /** Typed at the front door instead of the link, `XXXX-XXXX-XXXX`; null for an account workspace. */
  access_code: string | null;
  /** When the admin closed its link (no link or code opens it); null or absent while it works. */
  link_closed_at?: string | null;
  first_opened_at: string | null;
  /** When the link was last opened (each page load counts); null if never. */
  last_opened_at: string | null;
  /** Interaction logging switched on, and when it stops by itself (null: when turned off). */
  interactions_on: boolean;
  interactions_until: string | null;
  /** On and not yet past its end. */
  interactions_active: boolean;
  /** The feature switches in force (shared/src/features.ts); absent reads as the defaults. */
  features?: Features;
  created_at: string;
  updated_at: string;
}
