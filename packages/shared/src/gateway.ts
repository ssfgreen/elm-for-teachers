import { z } from "zod";
import { CommentAnchor, Timestamp, Ulid } from "./blocks.js";
import { DroppedOp, OperationList } from "./operations.js";
import { StoredSpyglass } from "./spyglass.js";

export const ChatRole = z.enum(["system", "user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessage = z.object({
  role: ChatRole,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/**
 * One step of a turn as the chat shows it: a piece of the model's thinking (from its reasoning
 * summary, whose bold first line is the title) or a tool it used (titled by the tool's label).
 */
export const TurnStep = z.object({
  kind: z.enum(["thinking", "tool"]),
  title: z.string(),
  /** Thinking: the rest of the summary. */
  detail: z.string().optional(),
  /** Tool: the arguments it was called with, and what it gave back (both shortened). */
  request: z.string().optional(),
  response: z.string().optional(),
  /** Tool: what it did in plain words, one line each, shown before the raw request and response. */
  summary: z.array(z.string()).optional(),
  error: z.boolean().optional(),
  /** Still going: a tool waiting for its result, or thinking still being written. */
  running: z.boolean().optional(),
});
export type TurnStep = z.infer<typeof TurnStep>;

/**
 * A picture the assistant took from ARASAAC (by its id) for an image block, with the others its
 * search found (at most 4, the one used among them), which the teacher may swap in.
 */
export const PictureOffer = z.object({
  block_id: z.string(),
  alt: z.string(),
  chosen: z.number().int().positive(),
  options: z.array(z.object({ id: z.number().int().positive(), label: z.string() })).max(4),
});
export type PictureOffer = z.infer<typeof PictureOffer>;

/** One assistant turn as stored in a thread's history. */
/** A copy not made because suggestions wait in the doc (`waiting` of them): the teacher chooses what it is built from. */
export const CopyRequest = z.object({ doc_id: Ulid, waiting: z.number().int().nonnegative() });
export type CopyRequest = z.infer<typeof CopyRequest>;

export const StoredTurn = z.object({
  turn_id: z.string(),
  thread_id: Ulid,
  /** The doc the teacher had open when sending. */
  doc_id: Ulid,
  prompt: z.string(),
  /** The passage the teacher pointed at, when the turn was an @model comment. */
  anchor: CommentAnchor.nullable().default(null),
  response_text: z.string(),
  operations: OperationList,
  /** The assistant message exactly as it will be replayed to the model next call. */
  rewritten_assistant_content: z.string(),
  /** Set when the turn answered an @model comment: the teacher's comment. Such turns stay out of the chat. */
  comment_id: z.string().nullable().optional(),
  /** The files attached to the message with "+" (the chat's reference files). */
  attachments: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  /** What the model thought and did on the way to its reply, and how long the turn took. */
  steps: z.array(TurnStep).optional(),
  worked_ms: z.number().int().nonnegative().optional(),
  /** Pictures put in from ARASAAC, with the others on offer. */
  pictures: z.array(PictureOffer).optional(),
  /** Docs the assistant was asked to copy while suggestions waited there: the teacher chooses what each copy is built from. */
  copy_requests: z.array(CopyRequest).optional(),
  /** Added 11 Nov 2026: what Spyglass found, when the turn changed content (written just after the commit). */
  spyglass: StoredSpyglass.optional(),
  at: Timestamp,
});
export type StoredTurn = z.infer<typeof StoredTurn>;

/** Per-call log row (exported as gateway_calls.jsonl). */
export const GatewayCall = z.object({
  gateway_call_id: z.string(),
  session_id: z.string(),
  thread_id: Ulid,
  doc_id: Ulid,
  turn_id: z.string(),
  model: z.string(),
  temperature: z.number(),
  system_prompt_hash: z.string(),
  serialized_canvas: z.string(),
  trimmed_history: z.array(ChatMessage),
  running_summary: z.string().nullable(),
  raw_response: z.string().nullable(),
  parsed_message: z.string().nullable(),
  parsed_operations: OperationList,
  dropped: z.array(DroppedOp),
  latency_ms: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  provider_request_id: z.string().nullable(),
  error: z.string().nullable(),
  at: Timestamp,
  /**
   * The request body exactly as sent to the provider (no credentials): what the model saw.
   * Absent on calls logged before it was recorded, and on a call that failed before sending.
   */
  request: z.unknown().optional(),
  /** Input tokens read from the provider's prompt cache, and written to it. */
  cached_tokens: z.number().int().nonnegative().nullable().optional(),
  cache_write_tokens: z.number().int().nonnegative().nullable().optional(),
  /** Output tokens the model spent thinking (part of output_tokens). */
  reasoning_tokens: z.number().int().nonnegative().nullable().optional(),
  /**
   * `summary`: a call that folded older turns into the thread's running summary (before the turn's
   * own calls). `judge`: the Spyglass judge, after the turn's commit (added 11 Nov 2026).
   */
  purpose: z.enum(["turn", "summary", "judge"]).optional(),
  /** Agent mode: this call's place in the turn (0 first), and the tools it called with what they returned. */
  step: z.number().int().nonnegative().optional(),
  tool_calls: z.array(z.object({ name: z.string(), arguments: z.string(), output: z.string(), is_error: z.boolean().optional() })).optional(),
});
export type GatewayCall = z.infer<typeof GatewayCall>;

/** The one method a provider adapter exposes. */
export interface ProviderResult {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  provider_request_id: string | null;
  /** The request body as sent (no credentials), for the gateway log. */
  request?: unknown;
  cached_tokens?: number | null;
  cache_write_tokens?: number | null;
  reasoning_tokens?: number | null;
}

/** A tool the model may call (agent mode): JSON Schema parameters, as the Responses API takes them. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * One agent request. `input` is Responses API input items: messages
 * (`{ role, content }`), and from earlier steps of the turn the model's output items and
 * `{ type: 'function_call_output', call_id, output }` answers to its calls.
 */
export interface AgentRequest {
  instructions: string;
  input: unknown[];
  tools: ToolSpec[];
  /** `none` asks for a final answer with no more tool calls; `{ name }` forces a call to that tool. */
  toolChoice?: "auto" | "none" | { name: string };
  /** The teacher's chosen model for this turn (default: the provider's). */
  model?: string;
  /** `none`: a model that takes no reasoning effort. Default: the provider's. */
  reasoningEffort?: "low" | "medium" | "high" | "none";
}

/** One model call of an agent turn. */
export interface AgentStep extends Omit<ProviderResult, "text"> {
  /** The visible text the model wrote in this call (may be empty when it only called tools). */
  text: string;
  toolCalls: { call_id: string; name: string; arguments: string }[];
  /** The call's output items, appended to `input` for the next call (reasoning items included). */
  output: unknown[];
  /** The reasoning summary's parts, when the provider gives one (each starts with a bold title). */
  reasoning?: string[];
}

export interface ProviderAdapter {
  readonly model: string;
  readonly temperature: number;
  /** `signal` (every method): the teacher pressed Stop; the call ends with a ProviderError of kind `aborted`. */
  complete(messages: ChatMessage[], system: string, signal?: AbortSignal): Promise<ProviderResult>;
  /**
   * The same call, streamed: `onText` gets each piece of the reply as it arrives and the
   * promise resolves with the whole reply. Optional; callers fall back to `complete`.
   */
  stream?(messages: ChatMessage[], system: string, onText: (delta: string) => void, signal?: AbortSignal): Promise<ProviderResult>;
  /** One agent step (mode `agent`); `onText` gets the visible text as it streams. */
  respond?(request: AgentRequest, onText?: (delta: string) => void, signal?: AbortSignal, onReasoning?: (parts: string[]) => void): Promise<AgentStep>;
}

/** A reasoning summary part as a step: its bold first line is the title, the rest the detail. */
export function thinkingStep(part: string, running = false): TurnStep {
  const m = /^\s*\*\*(.+?)\*\*\s*\n?([\s\S]*)$/.exec(part);
  const title = (m ? m[1]! : part.split("\n")[0]!).trim().replace(/[.:]$/, "") || "Thinking";
  const detail = (m ? m[2]! : part.split("\n").slice(1).join("\n")).trim();
  return { kind: "thinking", title: title.slice(0, 120), ...(detail ? { detail } : {}), ...(running ? { running: true } : {}) };
}
