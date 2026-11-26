/**
 * Naming a chat: one small call asks the model for a name, following the naming-chats skill
 * (config/skills/naming-chats/SKILL.md), from the chat's messages, its documents' names and the
 * other chats' names (so names share a pattern). It runs when the teacher presses the wand next
 * to the chat's title, and on its own once an Untitled chat has had AUTO_NAME_AFTER prompts. The
 * call is logged as a `chat_title` event (with its `trigger`), the rename as `thread_rename` with
 * `auto: true`. Not counted against the message limits or the budget.
 */
import { nowIso, type ProviderAdapter, type Skill, type Thread } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import type { EventStore, ServerEnvelope } from '../deps.js';

export const TITLE_MAX = 80;
/** An Untitled chat is named on its own once it has had this many prompts (Sam, 12 Nov 2026). */
export const AUTO_NAME_AFTER = 3;
export type TitleTrigger = 'wand' | 'auto';
/** How much of the chat the model is shown: the start says what it is about; the end, where it went. */
const SOURCE_CHARS = 6000;
const FALLBACK = 'Name this chat for the sidebar in at most six words: topic and document first. Reply with the name only.';

/** The model's reply as a name: its first line, without quotes, a full stop or markdown, cut to TITLE_MAX. */
export function cleanTitle(text: string): string | null {
  const line = (text.trim().split('\n')[0] ?? '').replace(/^#+\s*/, '').replace(/\*\*|__|`/g, '').replace(/^["“'‘]+|["”'’]+$/g, '').replace(/\.$/, '').trim();
  if (!line) return null;
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export interface TitleSource {
  turns: { prompt: string; response_text: string | null }[];
  docNames: string[];
  otherTitles: string[];
}

export function titleMessage(src: TitleSource): string {
  let chat = src.turns.map((t) => `Teacher: ${t.prompt}${t.response_text ? `\nAssistant: ${t.response_text}` : ''}`).join('\n\n');
  if (chat.length > SOURCE_CHARS) chat = `${chat.slice(0, SOURCE_CHARS * 0.7)}\n[…]\n${chat.slice(-SOURCE_CHARS * 0.3)}`;
  return [
    src.otherTitles.length ? `The teacher's other chats are named:\n${src.otherTitles.map((t) => `- ${t}`).join('\n')}` : 'The teacher has no other named chats.',
    src.docNames.length ? `This chat's documents: ${src.docNames.join('; ')}` : '',
    `<chat>\n${chat}\n</chat>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Asks for the name and logs the call; the name, or null if the call failed or said nothing. */
export async function suggestTitle(provider: ProviderAdapter, skill: Skill | undefined, events: EventStore, thread: Thread, src: TitleSource, envelope: ServerEnvelope, trigger: TitleTrigger): Promise<string | null> {
  const instructions = skill?.files['SKILL.md'] ?? FALLBACK;
  const started = performance.now();
  let title: string | null = null;
  let detail: { input_tokens: number | null; output_tokens: number | null; provider_request_id: string | null; request?: unknown; error: string | null };
  try {
    const raw = await provider.complete([{ role: 'user', content: titleMessage(src) }], instructions);
    title = cleanTitle(raw.text);
    detail = { input_tokens: raw.input_tokens, output_tokens: raw.output_tokens, provider_request_id: raw.provider_request_id, request: raw.request, error: title ? null : 'the call returned no name' };
  } catch (err) {
    detail = { input_tokens: null, output_tokens: null, provider_request_id: null, error: err instanceof Error ? err.message : String(err) };
  }
  await events.appendServer(
    thread.session_id,
    'chat_title',
    { thread_id: thread.id, title, trigger, model: provider.model, system_prompt_hash: sha256Hex(instructions), latency_ms: Math.round(performance.now() - started), at: nowIso(), ...detail },
    { ...envelope, thread_id: thread.id },
  );
  return title;
}
