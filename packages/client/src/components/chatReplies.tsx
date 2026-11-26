/** The chat's replies as they are written, and messages waiting for them. */
import { splitStreamingReply, type CommentAnchor, type TurnStep } from '@edw/shared';
import type { AgentState, ChatReply } from '../api/types';
import { shortQuote } from './ChatComposer';
import { ChatMarkdown } from './ChatMarkdown';
import { TurnSteps } from './TurnSteps';
import { cn } from '../lib/utils';

/** Each message's spacing and size. */
export const messageClass = 'mb-4 text-base';

/** A message waiting for the reply before it, faded, with Cancel. */
export function QueuedReply({ prompt, about, files, onCancel }: { prompt: string; about: CommentAnchor | null; files: { id: string; name: string }[]; onCancel: () => void }) {
  return (
    <li className={cn('chat-message chat-queued', messageClass, 'ml-6 opacity-60')} aria-label="Queued message">
      {about && (
        <div className="mb-1 ml-2 border-l-2 border-primary pl-2.5 text-sm text-foreground-2 italic">
          <span className="font-mono text-xs font-semibold text-primary">@model</span> {about.quote ? `“${shortQuote(about.quote)}”` : 'about a block'}
        </div>
      )}
      {files.length > 0 && <div className="mb-1.5 text-right text-sm text-muted-foreground">{files.map((f) => f.name).join(', ')}</div>}
      <div className="rounded-md border border-dashed border-border-strong px-3 py-2.25 whitespace-pre-wrap text-foreground">{prompt}</div>
      <div className="mt-1 flex items-center justify-end gap-2 text-sm text-muted-foreground">
        Queued: it goes when this reply ends.
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-sm text-primary underline" aria-label="Cancel this queued message" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </li>
  );
}

/** The assistant's reply while it is being written: thinking dots, then the text as it arrives. */
export function DraftReply({ raw, status, steps }: { raw: string; status: string | null; steps: TurnStep[] }) {
  const { message, opsText, opsDone } = splitStreamingReply(raw);
  const writing = opsText !== null && !opsDone;
  // Agent mode names what the model is doing ("Reading “Similes”"); single mode infers it. A step
  // already shown as running in the card is not named twice.
  const label = steps.some((s) => s.running) ? null : (status ?? (writing ? 'Writing in the document' : message ? null : 'Thinking'));
  return (
    <li className={cn('chat-message chat-assistant chat-draft', messageClass)} aria-live="polite" aria-busy="true">
      <span className="sr-only">Assistant:</span>
      <TurnSteps steps={steps} running />
      {message && <ChatMarkdown text={message} />}
      {label && <Thinking label={label} className={message ? 'mt-2' : undefined} />}
    </li>
  );
}

/** An agent-mode reply so far as the raw draft single mode streams: the text, then the edits in a fenced block. */
export function draftOf(state: AgentState): string {
  if (state.operations.length === 0) return state.text;
  return `${state.text}\n\n\`\`\`json\n${JSON.stringify(state.operations)}\n\`\`\``;
}

/** Three pulsing dots and what the model is doing ("Thinking…"); the keyframes are in chat.css. */
export function Thinking({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-base text-muted-foreground', className)} role="status">
      {/* `chat-dots` is a hook: the dots' animation is in chat.css. */}
      <span className={cn('chat-dots', 'inline-flex gap-0.75 *:size-1.5 *:rounded-full *:bg-primary *:opacity-25 motion-reduce:*:opacity-60')} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}…
    </div>
  );
}

/**
 * Editing mode: the line under a reply that changed a block the teacher was typing in. Its
 * change went in beside the teacher's typing, or, where both touched the same words, waits.
 */
export function typedDuringNote(reply: Extract<ChatReply, { ok: true }>): string | null {
  const typed = reply.typed_during ?? [];
  if (!typed.length) return null;
  const said = 'You were typing in the same paragraph while I made the change. I didn’t touch your text.';
  return typed.some((id) => reply.proposed_block_ids.includes(id)) ? `${said} My change is waiting beside it as a suggestion.` : said;
}
