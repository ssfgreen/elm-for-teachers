/**
 * Contract between the workspace screen and the block editor.
 *
 * The screen owns the canvas state (`PublicBlock[]` and `Doc[]`, as returned by
 * GET /api/sessions/:id/canvas). The editor renders one doc of it and reports
 * changes back through the callbacks below. The editor never calls the network
 * itself except through `structural`, which the screen supplies.
 */
import type { CommentMark } from "./extensions/commentMarks.js";
import type { Block, BlockContent, BlockType, CommentAnchor, DecisionPart, Doc, DocStyle, ProposalMode } from "@edw/shared";
import type { EventLogger } from "../events/logger.js";

/** What participants receive: a block without provenance. */
export type PublicBlock = Omit<Block, "origin" | "origin_turn">;

export interface CanvasSnapshot {
  blocks: PublicBlock[];
  docs: Doc[];
}

/** Server-side structural commands (POST /api/sessions/:id/blocks/:command). */
export type StructuralCommand =
  | { command: "insert"; id?: string; doc_id: string; after: string; type: BlockType; content?: string }
  | { command: "split"; block_id: string; first: BlockContent; second: BlockContent; second_type?: BlockType; second_id?: string }
  | { command: "merge"; block_id: string; merged_into: string; after: BlockContent }
  | { command: "delete"; block_id: string }
  | { command: "move"; block_id: string; after: string }
  | { command: "retype"; block_id: string; type: BlockType; after?: BlockContent }
  | { command: "doc_create"; thread_id: string; name: string; id?: string }
  | { command: "doc_rename"; doc_id: string; name: string; auto?: boolean }
  | { command: "doc_style"; doc_id: string; style: DocStyle }
  /** The teacher accepted or rejected the assistant's suggested font or page colour. */
  | { command: "doc_style_decision"; doc_id: string; accept: boolean }
  | { command: "doc_delete"; doc_id: string }
  | { command: "doc_duplicate"; doc_id: string; name: string; id?: string }
  | {
      command: "doc_import";
      thread_id: string;
      name: string;
      id?: string;
      blocks: Array<{ type: BlockType; content: string }>;
      source: { kind: "docx"; filename: string; bytes: number };
    };

export interface CanvasChanges {
  blocks: PublicBlock[];
  docs: Doc[];
  revisions?: Array<{ block_id: string; version: number }>;
}

export interface StructuralResponse {
  changes: CanvasChanges;
  block: PublicBlock | null;
  doc: Doc | null;
}

/**
 * The edit was typed inside one of the assistant's suggestions, which stays waiting for a
 * decision (as in Word). For a suggested edit to a block, `live` is the block's own text after it.
 */
export interface InSuggestion {
  live?: BlockContent;
}

export interface Decision {
  decision: "accept" | "reject";
  /** One block, or null with an `_all` mode for the whole doc. */
  block_id: string | null;
  doc_id: string | null;
  mode: ProposalMode;
  /** One change inside a suggested edit to the block, decided on its own. */
  part?: DecisionPart;
}

export interface CanvasProps {
  /** Doc to display; the editor filters `blocks` by it. */
  docId: string;
  blocks: PublicBlock[];
  readOnly: boolean;
  /**
   * The assistant is writing into the doc (a live preview): the teacher cannot edit and
   * the accept and reject marks are hidden until the turn ends.
   */
  busy?: boolean;
  logger: EventLogger;
  /** Runs a structural command on the server and merges its changes into screen state; returns the response. */
  structural: (cmd: StructuralCommand) => Promise<StructuralResponse>;
  /** Content of a block changed locally (fired on each keystroke-batch flush, after the event is logged). */
  onLocalEdit: (blockId: string, content: BlockContent, inSuggestion?: InSuggestion) => void;
  /** Uploads an image for an image block; absent when uploads are not available. */
  uploadImage?: (file: File) => Promise<{ asset_id: string }>;
  /** Turns an image block's `asset:<id>` source into a URL the browser can load. */
  resolveAssetUrl?: (src: string) => string;
  /**
   * A background structural command was refused or failed. The editor has already
   * dropped its queue; the screen should reload the canvas from the server.
   */
  onSyncError?: (err: unknown, cmd: StructuralCommand) => void;
  /** The teacher chose "@model" on a selection: the chat should take the next message as a comment on it. */
  onAskModel?: (anchor: CommentAnchor) => void;
  /**
   * Typed "@model" with a prompt: send it to the chat as a comment on this block. Called
   * once the block is saved on the server, so the anchor always resolves.
   */
  onSendComment?: (anchor: CommentAnchor, text: string) => void;
  /** Comment threads to highlight, and the one selected. */
  comments?: CommentMark[];
  activeComment?: string | null;
  /** The teacher chose "Comment" on a selection: start a thread on it. */
  onComment?: (anchor: CommentAnchor) => void;
  /** A highlight was clicked: select its thread. */
  onCommentSelect?: (id: string) => void;
  /**
   * Filled with a function that sends everything the editor still holds (typing not yet
   * batched, queued commands, events) and resolves once the server has it.
   */
  flushRef?: { current: (() => Promise<void>) | null };
  /** Test hook: receives the Tiptap editor once created. */
  onEditorReady?: (editor: import("@tiptap/core").Editor) => void;
  /** The document's font and page colour; with `onDocStyle`, the toolbar sets them. */
  docStyle?: DocStyle;
  onDocStyle?: (style: DocStyle) => void;
}
