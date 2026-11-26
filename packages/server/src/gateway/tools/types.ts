/**
 * Agent tools (agent mode), shaped like Pi's `AgentTool`: a name and description the model
 * sees, JSON Schema parameters, a label for the chat pane, and `execute`. A tool never writes
 * to the database: it reads the turn's view, and edits come back as operations that the turn
 * applies as proposals in its one transaction. New tools (comments, reference documents, web
 * search, skills) are one file each, added to the registry in index.ts and switched on with
 * config `agent.tools`.
 */
import type { Block, Comment, CopyChoice, CopyRequest, Doc, DroppedOp, Operation, ReferenceFile, Skill } from '@edw/shared';
import type { PictureLibrary, PictureOption } from '../../pictures/arasaac.js';
import type { PedagogyFocus } from '../../classes/context.js';
import type { CollectionSource } from '../../pedagogy/source.js';
import type { LibraryClient } from '../../plugins/library-client.js';
import type { ReferenceReader } from '../../references/reader.js';
import type { ValidationContext } from '../validate.js';

/** The docs the model may read and edit this turn (this thread's), and what edits are checked against; a doc opened from a reference file mid-turn is added. */
export interface AgentView {
  docs: Doc[];
  blocks: Block[];
  ctx: ValidationContext;
  /** The live comments on these docs (roots and replies). */
  comments: Comment[];
}

/** A comment a tool asks for: a new thread on a block, or a reply (root_id). Written when the turn is applied. */
export interface CommentDraft {
  doc_id: string;
  block_id: string;
  root_id: string | null;
  quote: string | null;
  body: string;
}

/** What a tool can see of the turn. */
export interface ToolContext {
  view: AgentView;
  openDocId: string;
  /** Operations accepted so far this turn (earlier calls), in order. */
  accepted: readonly Operation[];
  /** Comments asked for so far this turn. */
  comments: readonly CommentDraft[];
  /** For a turn answering an @model comment: its thread, which the turn's message already replies to. */
  commentThread: string | null;
  /** Config `agent.max_read_chars`: the most of a document, or of any output, one call returns. */
  maxReadChars: number;
  /** The skills on offer (config `agent.skills`). */
  skills: readonly Skill[];
  /** The chat's project's reference files, when it is in a project that has any. */
  references: ReferenceReader | null;
  /**
   * Copies an editable reference file into the chat as a live doc, at once, and adds it to
   * `view` (open_reference_as_doc). Absent where the turn can't write docs (evals, tests).
   */
  openReference?: (file: ReferenceFile, name: string) => Promise<Doc>;
  /** The picture library search_pictures looks in (ARASAAC); absent where there is none (tests). */
  pictures?: PictureLibrary | null;
  /** The libraries on offer this turn (plugins not Off, with a server), for the library_* tools. */
  libraries?: readonly LibraryOnOffer[];
  /** Plugins on offer that are Ask first and not yet allowed in this chat: a tool for one asks instead (askFirstResult). */
  askFirst?: ReadonlySet<string>;
  /** The teacher's choice of what a copy of one doc is built from (ChatBody.copy_choice). */
  copyChoice?: { doc_id: string; choice: CopyChoice };
  /** In a class chat with the pedagogy library on offer: where it is, the class's facets, and the claims the reply may cite (tools add to it). */
  pedagogy?: TurnPedagogy;
}

export interface TurnPedagogy {
  source: CollectionSource;
  focus: PedagogyFocus;
  citable: Set<string>;
}

/** A library plugin as the library_* tools use it. */
export interface LibraryOnOffer {
  id: string;
  name: string;
  description: string;
  collection: string;
  client: LibraryClient;
  /** A studio draft (#159): always Ask first. */
  draft?: boolean;
  /** A draft the studio could not give for this turn: its tools say so. */
  unavailable?: boolean;
}

/** A search_pictures call's finds: the turn keeps them, so the teacher can swap the one used for another. */
export interface PictureSearch {
  query: string;
  options: PictureOption[];
}

export interface ToolResult {
  /** What the model is told (JSON or text). */
  output: string;
  /** The call failed; `output` says why, so the model can correct it. */
  isError?: boolean;
  /** Operations this call adds to the turn's proposals, and those it dropped (for the log). */
  operations?: Operation[];
  dropped?: DroppedOp[];
  /** What the call did in plain words, one line each, for the chat's step card. */
  summary?: string[];
  /** Comments this call adds to the turn. */
  comments?: CommentDraft[];
  /** Pictures this call found (search_pictures). */
  pictures?: PictureSearch;
  /** An Ask first plugin this call wanted (its id): the turn records the request and the teacher is offered Allow. */
  request?: string;
  /** Copies not made because the teacher must choose what they are built from (edit_document). */
  copyRequests?: CopyRequest[];
  /**
   * Hint that the turn can end after this batch of calls without another model call (Pi's
   * `terminate`): honoured only when every call in the batch sets it.
   */
  terminate?: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** What the chat pane says while the call runs, e.g. `Reading “Similes”`. */
  label(args: Record<string, unknown>, ctx: ToolContext): string;
  execute(args: Record<string, unknown>, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

export const toolError = (message: string, extra: Record<string, unknown> = {}): ToolResult => ({ output: JSON.stringify({ error: message, ...extra }), isError: true });

/** What a tool for an Ask first plugin returns until the teacher allows it in the chat. */
export const askFirstResult = (pluginId: string, name: string): ToolResult => ({
  output: JSON.stringify({
    needs_permission: name,
    note: `The teacher has set ${name} to Ask first and has not allowed it in this chat yet, so nothing was searched. Carry on without it, and say in your reply what you would look for in ${name} and why; the teacher is shown a button to allow it.`,
  }),
  request: pluginId,
});
