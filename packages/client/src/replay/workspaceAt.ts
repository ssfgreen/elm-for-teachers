/**
 * The chat, the comments and the chat box's settings at one moment, in the shapes the app's own
 * components take, so the replay draws them with those components.
 */
import type { Comment, EditMode, Effort, ModelChoice } from '@edw/shared';
import { messagesOf, type ChatMessage } from '../components/ChatMessages';
import type { ReplayBundle, ReplayEvent } from './bundle';

export interface Moments {
  /** turn id → when its prompt was sent, its reply arrived, Spyglass's flags showed. */
  prompt: Map<string, number>;
  reply: Map<string, number>;
  spyglass: Map<string, number>;
  /** comment id → when it was made; root id → when its thread was resolved or deleted. */
  made: Map<string, number>;
  resolved: Map<string, number>;
  deleted: Map<string, number>;
}

export function momentsOf(events: readonly ReplayEvent[]): Moments {
  const m: Moments = { prompt: new Map(), reply: new Map(), spyglass: new Map(), made: new Map(), resolved: new Map(), deleted: new Map() };
  const first = (map: Map<string, number>, key: unknown, t: number) => {
    if (typeof key === 'string' && !map.has(key)) map.set(key, t);
  };
  for (const e of events) {
    const p = e.payload;
    if (e.kind === 'chat_prompt') first(m.prompt, p.turn_id, e.t);
    else if (e.kind === 'chat_response') first(m.reply, p.turn_id, e.t);
    else if (e.kind === 'spyglass_shown') first(m.spyglass, p.turn_id, e.t);
    else if (e.kind === 'comment_create') first(m.made, p.comment_id, e.t);
    else if (e.kind === 'comment_resolve' && p.resolved !== false) first(m.resolved, p.comment_id, e.t);
    else if (e.kind === 'comment_delete') first(m.deleted, p.comment_id, e.t);
  }
  return m;
}

const before = (map: Map<string, number>, key: string, t: number, fallback?: string) => {
  const at = map.get(key) ?? (fallback ? Date.parse(fallback) : NaN);
  return at <= t;
};

/** The chat's messages at `t`: each prompt once sent, its reply once it arrived. */
export function chatAt(bundle: ReplayBundle, m: Moments, threadId: string | null, t: number): ChatMessage[] {
  const turns = bundle.turns
    .filter((turn) => turn.thread_id === threadId && before(m.prompt, turn.turn_id, t, turn.at))
    .map((turn) => {
      const replied = before(m.reply, turn.turn_id, t, turn.at);
      return { ...turn, response_text: replied ? turn.response_text : null, spyglass: replied && before(m.spyglass, turn.turn_id, t) ? turn.spyglass : undefined };
    });
  return messagesOf(turns);
}

/** The doc's comments at `t`, resolved ones marked so, deleted ones gone. */
export function commentsAt(bundle: ReplayBundle, m: Moments, docId: string | null, t: number): Comment[] {
  return bundle.comments
    .filter((c) => c.doc_id === docId && before(m.made, c.id, t, c.created_at))
    .filter((c) => !before(m.deleted, c.id, t) && !before(m.deleted, c.root_id ?? '', t))
    .map((c) => {
      const root = c.root_id ?? c.id;
      return { ...c, resolved_at: before(m.resolved, root, t) ? new Date(m.resolved.get(root)!).toISOString() : null, deleted_at: null };
    });
}

export interface BarSettings {
  models: ModelChoice[];
  model: string;
  effort: Effort;
  editMode: EditMode;
  spyglass: boolean;
}

/**
 * What the row under the chat box showed: the settings of the last prompt sent, or before any,
 * of the first. The list of models is not in the bundle: those used in the workspace are offered.
 */
export function barAt(events: readonly ReplayEvent[], t: number): BarSettings | null {
  const prompts = events.filter((e) => e.kind === 'chat_prompt');
  if (prompts.length === 0) return null;
  const last = [...prompts].reverse().find((e) => e.t <= t) ?? prompts[0]!;
  const p = last.payload;
  const ids = [...new Set(prompts.map((e) => String(e.payload.model ?? '')).filter(Boolean))];
  return {
    models: ids.map((id) => ({ id, label: id, reasoning: true })),
    model: String(p.model ?? ids[0] ?? ''),
    effort: (p.effort as Effort | undefined) ?? 'medium',
    editMode: p.edit_mode === 'edit' ? 'edit' : 'suggest',
    spyglass: p.spyglass !== false,
  };
}
