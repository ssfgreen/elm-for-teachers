import { z } from "zod";
import { DEFAULT_PLUGINS, PluginEntry } from "./plugins.js";
import { DEFAULT_READER, ReaderConfig } from "./readerPrompts.js";
import type { Skill } from "./skills.js";

/**
 * The app configuration (config/app.config.json). Files it references are read
 * relative to the config directory; the config and the system prompt are hashed into
 * every session and bundle so sessions run under different settings are never pooled.
 */

/** How hard a reasoning model thinks before it answers. */
export const Effort = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof Effort>;

/**
 * A model the teacher can pick under the chat box. Only models that passed ELM's tool-calling
 * round trip on /responses are listed (probed 31 Oct 2026). `reasoning: false` models take no
 * reasoning effort (ELM refuses one for them), so they are sent none.
 */
export const ModelChoice = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** The heading it is listed under in the picker ("OpenAI", "Open models"). */
  group: z.string().min(1).optional(),
  reasoning: z.boolean(),
});
export type ModelChoice = z.infer<typeof ModelChoice>;

/** A model's standard price in US dollars per million tokens (docs/model-prices.md). */
export const ModelPrice = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  /** Input read from the provider's cache; full input price without it. */
  cached_input: z.number().nonnegative().optional(),
  /** Input written to the cache; full input price without it. */
  cache_write: z.number().nonnegative().optional(),
});
export type ModelPrice = z.infer<typeof ModelPrice>;

export const ProviderConfig = z.object({
  name: z.string().min(1),
  /** The default model (and the one used for summaries). */
  model: z.string().min(1),
  /** The models the teacher may choose from; without it, only `model`. */
  models: z.array(ModelChoice).optional(),
  temperature: z.number().min(0).max(2),
  max_output_tokens: z.number().int().positive(),
  zero_retention: z.boolean(),
  /** Prices by model id, for the chat's token and cost counter; a model without one shows tokens only. */
  prices: z.record(z.string(), ModelPrice).optional(),
  /** Pounds per US dollar, to show costs in pounds; costs are left out without it. */
  usd_to_gbp: z.number().positive().optional(),
  base_url_env: z.string().min(1),
  api_key_env: z.string().min(1),
});

export const Thresholds = z.object({
  selection_throttle_ms: z.number().int().positive(),
  scroll_throttle_ms: z.number().int().positive(),
  event_batch_ms: z.number().int().positive(),
});
export type Thresholds = z.infer<typeof Thresholds>;

/**
 * Caps per workspace, so a leaked link cannot run up the provider bill.
 * - `messages_per_hour`: teacher messages to the assistant in the last hour. A message counts
 *   once however many model calls (agent steps) it takes.
 * - `budget_gbp`: pounds the workspace's model calls may cost, each call priced when it is made
 *   (provider `prices` and `usd_to_gbp`, which must cover every model: `budgetProblems`). A turn
 *   starts only while saved spend is under it.
 * - `budget_overrun_gbp`: how far over the budget a turn already running may go. Before each agent
 *   call, the call's worst cost is checked against saved spend plus this turn's own steps. Turns
 *   running at once each see only their own unsaved spend, so together they can pass budget plus
 *   this. The running summary, the Spyglass judge and single mode are costed but not checked one
 *   by one.
 */
export const Limits = z.object({
  messages_per_hour: z.number().int().positive(),
  budget_gbp: z.number().positive(),
  budget_overrun_gbp: z.number().nonnegative(),
});

/**
 * Caps on reference files (project uploads the model can consult), each with its own refusal
 * message. Tokens are estimated as characters / 4.
 */
export const ReferenceLimits = z.object({
  files_per_project: z.number().int().positive(),
  /** Size of one original file. */
  file_bytes: z.number().int().positive(),
  /** Extracted text of one file. */
  file_tokens: z.number().int().positive(),
  /** Extracted text of all of a project's files. */
  project_tokens: z.number().int().positive(),
  /** Images (pages or pictures) in a project, once images are taken. */
  images_per_project: z.number().int().positive(),
  /** Originals in all of a workspace's projects. */
  workspace_bytes: z.number().int().positive(),
});
export type ReferenceLimits = z.infer<typeof ReferenceLimits>;
export const DEFAULT_REFERENCE_LIMITS: ReferenceLimits = {
  files_per_project: 20,
  file_bytes: 20 * 1024 * 1024,
  file_tokens: 200_000,
  project_tokens: 1_000_000,
  images_per_project: 50,
  workspace_bytes: 100 * 1024 * 1024,
};

/**
 * How a turn reaches the model. `single`: one chat-completions call whose reply carries the
 * operations in a fenced JSON block. `agent`: the Responses API with tools (read a document,
 * edit documents), the server running the model's tool calls for up to `max_steps` calls.
 */
export const Mode = z.enum(["single", "agent"]);
export type Mode = z.infer<typeof Mode>;
export const AgentConfig = z.object({
  max_steps: z.number().int().min(2).max(40),
  /**
   * The time a turn may run (ms) before its next model call is its last, with no tools. Keep it
   * well under the function's limit (vercel.json maxDuration, 300 s), since that call takes time too.
   */
  max_turn_ms: z.number().int().min(10_000).default(200_000),
  reasoning_effort: Effort,
  /** The tools the model is offered, by name (the server's tool registry checks them at start). */
  tools: z.array(z.string().min(1)).min(1),
  /**
   * The most of a document (characters) the model is shown at once, in its message or from
   * read_document: a longer one is cut at a block and read on with `from_block`. Any other tool
   * output is cut at this length too.
   */
  max_read_chars: z.number().int().min(1000).default(40_000),
  /**
   * Skills offered (agent mode), by folder name under the config directory's `skills/`. Their
   * descriptions join the system prompt and the read_skill tool is offered with them.
   */
  skills: z.array(z.string().min(1)).default([]),
});
export type AgentConfig = z.infer<typeof AgentConfig>;

/**
 * Spyglass (docs/spyglass.md, Part 6): what the deployment offers. The checks run and are logged
 * under every value; the teacher's toggle decides each turn within it.
 * - `off`: no toggle, no callout. `shown`: the toggle and the callout. `shown_and_model`: also
 *   `turn_effect` in edit_document's result (not built yet).
 */
export const SpyglassMode = z.enum(["off", "shown", "shown_and_model"]);
export type SpyglassMode = z.infer<typeof SpyglassMode>;
export const SpyglassConfig = z.object({
  mode: SpyglassMode.default("shown_and_model"),
  /** The judge's model, chosen by the judge experiment (Part 8). Unset: the provider's default model. */
  judge_model: z.string().min(1).optional(),
  /** Picker models that judge their own turns; a turn on any other model is judged by `judge_model`. */
  judge_models: z.array(z.string().min(1)).default([]),
  /** The judge's own time limit; past it the flags fall back to the effect's findings. */
  judge_timeout_ms: z.number().int().positive().default(8000),
});
export type SpyglassConfig = z.infer<typeof SpyglassConfig>;
export type Limits = z.infer<typeof Limits>;

export const AppConfig = z.object({
  config_version: z.string().min(1),
  provider: ProviderConfig,
  system_prompt_file: z.string().min(1),
  history: z.object({
    /** Turns sent verbatim, at most; past that, older ones are folded into the running summary. */
    max_turns: z.number().int().positive(),
    running_summary: z.boolean(),
    /** Turns left verbatim when older ones are folded (default half of max_turns, rounded up). */
    keep_turns: z.number().int().nonnegative().optional(),
    /** `model`: a structured summary written by the model (Pi's compaction). `lines`: one line per turn, no model call. */
    summary: z.enum(["model", "lines"]).default("model"),
  }),
  thresholds: Thresholds,
  limits: Limits.default({ messages_per_hour: 100, budget_gbp: 60, budget_overrun_gbp: 5 }),
  references: ReferenceLimits.default(DEFAULT_REFERENCE_LIMITS),
  mode: Mode.default("single"),
  /** The plugins teachers can choose from on the Plugins screen (docs/plugins.md). */
  plugins: z.array(PluginEntry).default(DEFAULT_PLUGINS),
  agent: AgentConfig.default({ max_steps: 6, max_turn_ms: 200_000, reasoning_effort: "medium", tools: ["read_document", "edit_document", "add_comment", "reply_to_comment"], max_read_chars: 40_000, skills: [] }),
  spyglass: SpyglassConfig.default({ mode: "shown_and_model", judge_timeout_ms: 8000, judge_models: [] }),
  /**
   * What the gateway log keeps of a class's pupil table (docs/classes.md, option B). `full`: the
   * rows as sent (Sam, 12 Nov 2026: the pilot, on secure university servers). `shape`: a
   * placeholder with the row count and hash instead, as option B first had it. The export's
   * gateway_calls.jsonl is this log, so with `full` an exported bundle holds the pupil rows.
   * Events and classes.json keep only the shape either way. Switching back is this one setting;
   * calls logged meanwhile keep their rows.
   */
  pupil_rows_in_gateway_log: z.enum(["full", "shape"]).default("shape"),
  /** The pupil reader (shared/src/readerPrompts.ts): its default prompts, pupil budget, follow-up limit and model. */
  reader: ReaderConfig.default(DEFAULT_READER),
});
export type AppConfig = z.infer<typeof AppConfig>;

/**
 * What stops the budget from pricing every call: a model (the default, the picker's, the
 * Spyglass judge's) with no price, or no exchange rate. Without them calls would cost nothing.
 */
export function budgetProblems(config: AppConfig): string[] {
  const p = config.provider;
  const models = new Set([p.model, ...(p.models ?? []).map((m) => m.id), ...(config.spyglass.judge_model ? [config.spyglass.judge_model] : []), ...config.spyglass.judge_models, ...(config.reader.model ? [config.reader.model] : [])]);
  return [
    ...(p.usd_to_gbp === undefined ? ["provider.usd_to_gbp: needed for the budget (limits.budget_gbp)"] : []),
    ...[...models].filter((m) => !p.prices?.[m]).map((m) => `provider.prices: ${m} has no price, which the budget (limits.budget_gbp) needs`),
  ];
}

/** Resolved configuration with the system prompt read in and hashes computed. */
export interface LoadedConfig {
  config: AppConfig;
  config_hash: string;
  /** The system prompt as sent: the prompt file, then (agent mode) the skills on offer. */
  system_prompt: string;
  /**
   * Hash of what the model can be told: the system prompt, and the skills' files after it
   * (`system_prompt_record`), so changing a skill moves it too.
   */
  system_prompt_hash: string;
  /** The text behind system_prompt_hash when skills are on (the prompt, then each skill file); else the prompt itself. */
  system_prompt_record?: string;
  /** The skills offered (agent mode), in config order. */
  skills?: Skill[];
  /** The guidance for naming a chat (config/skills/naming-chats), when that skill is there; the wand uses it. */
  naming_skill?: Skill;
}

/** The models the teacher may pick, the default first if the list leaves it out. */
export function modelChoices(provider: { model: string; models?: ModelChoice[] }): ModelChoice[] {
  const list = provider.models ?? [];
  return list.some((m) => m.id === provider.model) ? list : [{ id: provider.model, label: provider.model, reasoning: true }, ...list];
}
