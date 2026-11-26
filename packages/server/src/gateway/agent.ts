/**
 * Agent mode (config `mode: "agent"`): one teacher message runs as a loop of model calls
 * through the provider's `respond` (the Responses API on ELM). The model sees the open doc in
 * full and the thread's other docs as an outline, and the tools config `agent.tools` names
 * (tools/: read_document, edit_document, ...). A tool's result goes back to the model; edits
 * come back as operations, checked at once so the model can correct what was dropped.
 *
 * Accepted operations are collected, not applied: service.ts applies them as proposals in
 * the turn's one write transaction, revalidating them there, exactly as in `single` mode.
 * Each model call is one step (one gateway call row). A step with no tool calls ends the
 * turn, as does a batch of calls that all ask to end it (`terminate`); the last allowed step
 * is asked for an answer with no tools.
 */
import { thinkingStep, type AgentStep, type Block, type Doc, type DroppedOp, type Operation, type Project, type ProviderAdapter, type ReferenceBlock, type ReferenceFile, type Skill, type StoredTurn, type TurnStep, type CopyRequest } from '@edw/shared';
import type { PictureLibrary } from '../pictures/arasaac.js';
import type { ReferenceReader } from '../references/reader.js';
import { ProviderError } from './errors.js';
import { serializeCanvas } from './prompt.js';
import { commentsText } from './tools/comments-text.js';
import { REFERENCE_TOOLS } from './tools/index.js';
import { pageBlocks, pageNote, truncateOutput } from './tools/truncate.js';
import { toolError, type AgentTool, type AgentView, type CommentDraft, type LibraryOnOffer, type PictureSearch, type ToolContext, type ToolResult, type TurnPedagogy } from './tools/types.js';
import { attachedNote, libraryCatalogue, projectMessage, referenceCatalogue, teacherMessage } from './context-messages.js';
import { LIBRARY_TOOLS } from './tools/library.js';
import { PEDAGOGY_TOOLS } from './tools/pedagogy.js';

export type { AgentView } from './tools/types.js';

/** What the chat pane shows while the turn runs (sent whole each time it changes). */
export interface AgentState {
  text: string;
  operations: Operation[];
  /** What the model is doing, e.g. `Reading “Similes”`; null once it is writing text. */
  status: string | null;
  /** What it has thought and done so far, in order (see TurnStep). */
  steps: TurnStep[];
}

export interface AgentStepRecord {
  step: number;
  result: AgentStep;
  latency_ms: number;
  tool_calls: { name: string; arguments: string; output: string; is_error?: boolean }[];
  /** Operations accepted, and dropped, in this step's edit_document calls. */
  operations: Operation[];
  dropped: DroppedOp[];
}

export interface AgentOutcome {
  message: string;
  operations: Operation[];
  /** Comments the model asked for (new threads and replies), in order. */
  comments: CommentDraft[];
  /** What search_pictures found, call by call. */
  pictures: PictureSearch[];
  /** Ask first plugins the model wanted (ids, once each): the turn records them so the teacher is offered Allow. */
  requests: string[];
  /** Copies the teacher must choose about, one per doc. */
  copy_requests: CopyRequest[];
  steps: AgentStepRecord[];
  /** The steps as the chat shows them, and how long the turn took. */
  trace: TurnStep[];
  worked_ms: number;
  /** Docs opened from reference files this turn (already written, live). */
  opened: { doc: Doc; blocks: Block[] }[];
}

/** A failed (or stopped) step: the steps that finished before it, for the gateway log, and the text shown so far. */
export class AgentTurnError extends Error {
  constructor(
    readonly cause: unknown,
    readonly steps: AgentStepRecord[],
    readonly latency_ms: number,
    readonly text = '',
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'AgentTurnError';
  }
}

export interface AgentTurnInput {
  provider: ProviderAdapter;
  instructions: string;
  /** The tools the model is offered (tools/index.ts `toolsByName`). */
  tools: AgentTool[];
  /** Completed turns sent verbatim, and the summary of older ones (when any were trimmed). */
  history: StoredTurn[];
  runningSummary: string | null;
  view: AgentView;
  openDocId: string;
  currentPrompt: string;
  anchor: { block_id: string; type: string; quote: string | null } | null;
  maxSteps: number;
  /**
   * Config `agent.max_turn_ms`: once the turn has run this long, its next model call is its last
   * (no tools), so it ends with a reply well inside the function's time limit.
   */
  maxTurnMs?: number;
  /** The clock for `maxTurnMs` (tests). */
  now?: () => number;
  /** Config `agent.max_read_chars` (default 40 000). */
  maxReadChars?: number;
  /** The skills read_skill can give (their names and descriptions are in `instructions`). */
  skills?: readonly Skill[];
  /** For a turn answering an @model comment: the root of its thread. */
  commentThread?: string | null;
  /** The model and effort the teacher chose for this turn (default: the provider's). */
  model?: { id: string; effort: 'low' | 'medium' | 'high' | 'none' };
  /** The chat's project, for its description and instructions (a message after the system prompt). */
  /** The teacher's note about themselves (Preferences), for every chat. */
  teacherNote?: string | null;
  project?: Pick<Project, 'name' | 'description' | 'instructions'> | null;
  /** The class or year group the chat is for, as the model reads it (class-message.ts). */
  classMessage?: string | null;
  /** The pedagogy library for a class chat: its message (pedagogy-message.ts), and the tools to find and read more. */
  pedagogy?: (TurnPedagogy & { message: string }) | null;
  /** The chat's project's reference files: with any, the catalogue opens the input and the reference tools are offered. */
  references?: ReferenceReader | null;
  /** Writes a reference file's blocks as a new live doc in the chat (open_reference_as_doc); returns it and its blocks. */
  openReference?: (file: ReferenceFile, blocks: ReferenceBlock[], name: string) => Promise<{ doc: Doc; blocks: Block[] }>;
  pictures?: PictureLibrary | null;
  /** The libraries on offer (plugins not Off): with any, their catalogue and the library tools. */
  libraries?: readonly LibraryOnOffer[];
  /** Plugins on offer but Ask first and not allowed in this chat yet. */
  askFirst?: ReadonlySet<string>;
  /** The teacher's choice of what a copy of one doc is built from. */
  copyChoice?: ToolContext['copyChoice'];
  onState?: (state: AgentState) => void;
  /** The teacher pressed Stop: the step under way is cut off and no further step starts. */
  signal?: AbortSignal;
  /** Asked before each step whether a Stop has been asked for some other way (another server instance). */
  checkStop?: () => Promise<boolean>;
  /**
   * Before each model call, with the request's size in UTF-8 bytes and the steps done so far:
   * throws to end the turn instead (the budget, limits.ts). The steps done are kept, as on a failure.
   */
  beforeCall?: (requestBytes: number, done: readonly AgentStepRecord[]) => Promise<void>;
}

/** Shown when the model edits (or only comments) but writes no message. */
export const EDITS_ONLY_MESSAGE = "I've suggested changes in the document.";
export const COMMENTS_ONLY_MESSAGE = "I've left comments on the document.";

const OP_ORDER: Operation['op'][] = ['insert', 'replace', 'delete', 'move', 'create_doc', 'set_style'];

/** The assistant turn as replayed to the model later: its message and a note of what it proposed (the docs show the result). */
export function agentAssistantContent(message: string, operations: Operation[]): string {
  if (operations.length === 0) return message;
  const counts = OP_ORDER.map((k) => [k, operations.filter((o) => o.op === k).length] as const).filter(([, n]) => n > 0);
  return `${message}\n\n[Suggested edits: ${counts.map(([k, n]) => `${k} ${n}`).join(', ')}]`;
}

export const DEFAULT_MAX_READ_CHARS = 40_000;

/** The teacher's message with the open doc in full (its first page, if it is very long) and the other docs as an outline. */
export function agentUserMessage(view: AgentView, openDocId: string, prompt: string, anchor: AgentTurnInput['anchor'], maxReadChars = DEFAULT_MAX_READ_CHARS): string {
  const open = view.docs.find((d) => d.id === openDocId);
  const others = view.docs.filter((d) => d.id !== openDocId);
  const count = (d: Doc) => view.blocks.filter((b) => b.doc_id === d.id && (b.status === 'live' || b.status === 'proposed')).length;
  const outline = others.length
    ? others.map((d) => `- ${d.name} (id: ${d.id}; ${count(d)} block${count(d) === 1 ? '' : 's'})`).join('\n')
    : '(none)';
  const about = anchor
    ? `The teacher is commenting on block [id=${anchor.block_id}] (${anchor.type})` +
      (anchor.quote ? ` and selected the text "${anchor.quote}"` : '') +
      `. Make the change there unless they ask otherwise.\n\n`
    : '';
  const notes = open ? commentsText(view.comments, open.id) : '';
  const page = open ? pageBlocks(serializeCanvas(view.blocks, [open], openDocId), 1, maxReadChars) : null;
  const cut = page && open ? pageNote(page, open.id) : null;
  return [
    '## Open document',
    '',
    page ? page.text : '(none)',
    ...(cut ? ['', cut] : []),
    '',
    ...(notes ? [notes, ''] : []),
    '## Other documents in this chat (read them with read_document)',
    '',
    outline,
    '',
    '---',
    '',
    `${about}Teacher: ${prompt}`,
  ].join('\n');
}

/** A tool's arguments or result as the chat shows them: indented when JSON, shortened. */
function prettyArgs(args: string): string {
  try {
    return shorten(JSON.stringify(JSON.parse(args), null, 2), 1200);
  } catch {
    return shorten(args, 1200);
  }
}

function shorten(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s;
}

const PAST: Record<string, string> = { Reading: 'Read', Writing: 'Wrote', Opening: 'Opened', Adding: 'Added', Replying: 'Replied', Searching: 'Searched' };

/** A finished tool step's title: the label in the past tense; edits say how many changes. */
function doneLabel(label: string, tool: string, changes: number): string {
  if (tool === 'edit_document') return changes ? `Edited the document (${changes} change${changes === 1 ? '' : 's'})` : 'Tried to edit the document';
  const [first, ...rest] = label.split(' ');
  return PAST[first!] ? [PAST[first!], ...rest].join(' ') : label;
}

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentOutcome> {
  const { provider, view } = input;
  if (!provider.respond) throw new AgentTurnError(new Error(`provider ${provider.model} cannot run agent turns`), [], 0);
  const references = input.references?.files.length ? input.references : null;
  // open_reference_as_doc only when there is a Word file to open.
  const offered = REFERENCE_TOOLS.filter((t) => !input.tools.includes(t) && (t.name !== 'open_reference_as_doc' || references?.files.some((f) => f.editable)));
  const libraries = input.libraries ?? [];
  const askFirst = input.askFirst ?? new Set<string>();
  const tools = [...input.tools, ...(references ? offered : []), ...(libraries.length ? LIBRARY_TOOLS.filter((t) => !input.tools.includes(t)) : []), ...(input.pedagogy ? PEDAGOGY_TOOLS : [])];
  const pedagogy = input.pedagogy ? { source: input.pedagogy.source, focus: input.pedagogy.focus, citable: input.pedagogy.citable } : undefined;

  const items: unknown[] = [];
  const teacher = teacherMessage(input.teacherNote);
  if (teacher) items.push({ role: 'developer', content: teacher });
  const about = input.project ? projectMessage(input.project) : null;
  if (about) items.push({ role: 'developer', content: about });
  if (input.classMessage) items.push({ role: 'developer', content: input.classMessage });
  if (input.pedagogy) items.push({ role: 'developer', content: input.pedagogy.message });
  if (references) items.push({ role: 'developer', content: referenceCatalogue(references) });
  if (libraries.length) items.push({ role: 'developer', content: libraryCatalogue(libraries, askFirst) });
  if (input.runningSummary) items.push({ role: 'developer', content: `Summary of earlier conversation:\n\n${input.runningSummary}` });
  for (const t of input.history) {
    items.push({ role: 'user', content: t.prompt + attachedNote(t.attachments) });
    items.push({ role: 'assistant', content: t.rewritten_assistant_content });
  }
  const maxReadChars = input.maxReadChars ?? DEFAULT_MAX_READ_CHARS;
  items.push({ role: 'user', content: agentUserMessage(view, input.openDocId, input.currentPrompt, input.anchor, maxReadChars) });

  const steps: AgentStepRecord[] = [];
  const accepted: Operation[] = [];
  const drafts: CommentDraft[] = [];
  const found: PictureSearch[] = [];
  const requests = new Set<string>();
  const copyRequests = new Map<string, CopyRequest>();
  let text = '';
  let status: string | null = 'Thinking';
  const trace: TurnStep[] = [];
  const emit = () => input.onState?.({ text, operations: [...accepted], status, steps: trace.map((t) => ({ ...t })) });
  const started = performance.now();
  const now = input.now ?? (() => performance.now());
  const budgetFrom = now();
  const outOfTime = () => input.maxTurnMs !== undefined && now() - budgetFrom >= input.maxTurnMs;

  const runTool = async (name: string, args: string): Promise<ToolResult> => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return toolError(`no tool called ${name}`);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args) as Record<string, unknown>;
    } catch {
      return toolError('arguments are not valid JSON');
    }
    try {
      const ran = await tool.execute(parsed, toolContext());
      return { ...ran, output: truncateOutput(ran.output, maxReadChars) };
    } catch (err) {
      return toolError(`the tool failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  /** A doc opened from a reference file joins the view at once, so later calls can read and edit it. */
  const opened: { doc: Doc; blocks: Block[] }[] = [];
  const openReference =
    input.openReference && references
      ? async (file: ReferenceFile, name: string): Promise<Doc> => {
          const blocks = await references.blocks(file.id);
          if (!blocks?.length) throw new Error(`${file.name} has no document to open`);
          const made = await input.openReference!(file, blocks, name);
          opened.push(made);
          view.docs.push(made.doc);
          view.blocks.push(...made.blocks);
          const live = made.blocks.filter((b) => b.status === 'live');
          view.ctx = {
            ...view.ctx,
            liveBlockIds: new Set([...view.ctx.liveBlockIds, ...live.map((b) => b.id)]),
            blockDoc: new Map([...view.ctx.blockDoc, ...live.map((b) => [b.id, b.doc_id] as const)]),
            docIds: new Set([...view.ctx.docIds, made.doc.id]),
            copies: new Map([...(view.ctx.copies ?? []), [made.doc.id, live.map((b) => b.id)]]),
          };
          return made.doc;
        }
      : undefined;
  const toolContext = (): ToolContext => ({ view, openDocId: input.openDocId, accepted, comments: drafts, commentThread: input.commentThread ?? null, maxReadChars, skills: input.skills ?? [], references, pictures: input.pictures ?? null, libraries, askFirst, ...(input.copyChoice ? { copyChoice: input.copyChoice } : {}), ...(openReference ? { openReference } : {}), ...(pedagogy ? { pedagogy } : {}) });
  const labelOf = (name: string, args: string): string => {
    const tool = tools.find((t) => t.name === name);
    try {
      return tool ? tool.label(JSON.parse(args) as Record<string, unknown>, toolContext()) : 'Working';
    } catch {
      return 'Working';
    }
  };

  const halt = async () => {
    if (input.signal?.aborted || (await input.checkStop?.())) {
      throw new AgentTurnError(new ProviderError('aborted', 'the request was stopped'), steps, Math.round(performance.now() - started), text.trim());
    }
  };

  emit();
  for (let step = 0; step < input.maxSteps; step++) {
    await halt();
    const last = step === input.maxSteps - 1 || outOfTime();
    const stepStarted = performance.now();
    let separated = text === '';
    let result: AgentStep;
    // This call's thinking goes after everything so far; it is rewritten as its summary streams.
    const from = trace.length;
    const thinking = (parts: string[], live: boolean) => {
      trace.splice(from, trace.length - from, ...parts.filter((p) => p.trim()).map((p, i, all) => thinkingStep(p, live && i === all.length - 1)));
    };
    const request = {
      instructions: input.instructions,
      input: items,
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      toolChoice: last ? ('none' as const) : ('auto' as const),
      ...(input.model ? { model: input.model.id, reasoningEffort: input.model.effort } : {}),
    };
    try {
      if (input.beforeCall) await input.beforeCall(Buffer.byteLength(JSON.stringify(request)), steps);
      result = await provider.respond(
        request,
        (delta) => {
          // A later step's text starts a new paragraph of the one message.
          if (!separated) {
            text += '\n\n';
            separated = true;
          }
          text += delta;
          status = null;
          emit();
        },
        input.signal,
        (parts) => {
          thinking(parts, true);
          emit();
        },
      );
    } catch (err) {
      throw new AgentTurnError(err, steps, Math.round(performance.now() - started), text.trim());
    }
    thinking(result.reasoning ?? trace.slice(from).map((t) => (t.detail ? `**${t.title}**\n\n${t.detail}` : t.title)), false);
    const record: AgentStepRecord = { step, result, latency_ms: Math.round(performance.now() - stepStarted), tool_calls: [], operations: [], dropped: [] };
    steps.push(record);
    const calls = last ? [] : result.toolCalls;
    if (calls.length === 0) break;

    items.push(...result.output);
    let terminate = true;
    for (const call of calls) {
      if (input.signal?.aborted) await halt();
      status = labelOf(call.name, call.arguments);
      const shown: TurnStep = { kind: 'tool', title: status, request: prettyArgs(call.arguments), running: true };
      trace.push(shown);
      emit();
      const ran = await runTool(call.name, call.arguments);
      shown.title = doneLabel(status, call.name, ran.operations?.length ?? 0);
      shown.response = prettyArgs(ran.output);
      if (ran.summary?.length) shown.summary = ran.summary;
      delete shown.running;
      if (ran.isError) shown.error = true;
      accepted.push(...(ran.operations ?? []));
      drafts.push(...(ran.comments ?? []));
      if (ran.pictures) found.push(ran.pictures);
      if (ran.request) requests.add(ran.request);
      for (const c of ran.copyRequests ?? []) copyRequests.set(c.doc_id, c);
      record.tool_calls.push({ name: call.name, arguments: call.arguments, output: ran.output, ...(ran.isError ? { is_error: true } : {}) });
      record.operations.push(...(ran.operations ?? []));
      record.dropped.push(...(ran.dropped ?? []));
      items.push({ type: 'function_call_output', call_id: call.call_id, output: ran.output });
      terminate &&= ran.terminate === true;
    }
    if (terminate) break;
    status = 'Thinking';
    emit();
  }

  const message = text.trim() || (accepted.length ? EDITS_ONLY_MESSAGE : drafts.length ? COMMENTS_ONLY_MESSAGE : '');
  if (!message) throw new AgentTurnError(new Error('the model returned no message and no edits'), steps, Math.round(performance.now() - started));
  return { message, operations: accepted, comments: drafts, pictures: found, requests: [...requests], copy_requests: [...copyRequests.values()], steps, trace, worked_ms: Math.round(performance.now() - started), opened };
}
