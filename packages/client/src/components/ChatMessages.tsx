/**
 * The chat's transcript: the teacher's messages as bubbles, the assistant's replies with their
 * steps and Spyglass's flags, and errors. Display only; ChatPane holds the messages, and the
 * session replay (replay/) draws a chat with it too.
 */
import type { CopyRequest, SpyglassResult, TurnStep } from '@edw/shared';
import type { ChatTurn } from '../api/types';
import type { EventLogger } from '../events/logger';
import { shortQuote } from './ChatComposer';
import { ChatMarkdown } from './ChatMarkdown';
import { messageClass } from './chatReplies';
import { fileKind } from './files';
import { Spyglass } from './Spyglass';
import { TurnSteps } from './TurnSteps';
import { FileTile, fileTilesClass } from './ui/file-tile';
import { cn } from '../lib/utils';

export interface ChatMessage {
  key: string;
  role: 'teacher' | 'assistant' | 'error';
  text: string;
  /** For a teacher message sent as an @model comment: the passage it was about. */
  quote?: string | null;
  /** An assistant reply the teacher stopped: what it had written by then (nothing of it was applied). */
  stopped?: boolean;
  /** Files the teacher attached to the message with "+". */
  files?: { id: string; name: string }[];
  /** An assistant reply's thinking and tool use, and how long it took. */
  steps?: TurnStep[];
  worked_ms?: number;
  /** A line under the reply, such as that the teacher's typing was kept (Editing mode). */
  note?: string;
  /** An assistant reply's turn, and the copies it left for the teacher to choose about. */
  turnId?: string;
  copyRequests?: CopyRequest[];
  /** Spyglass's flags for the reply's turn, which arrive just after it. */
  spyglass?: SpyglassResult;
}

/** A chat's stored turns as its messages: each prompt, then its reply once there is one. */
export function messagesOf(turns: ChatTurn[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const t of turns) {
    history.push({ key: `${t.turn_id}-p`, role: 'teacher', text: t.prompt, quote: t.anchor?.quote ?? (t.anchor ? '' : null), ...(t.attachments?.length ? { files: t.attachments } : {}) });
    if (t.response_text) history.push({ key: `${t.turn_id}-r`, role: 'assistant', text: t.response_text, turnId: t.turn_id, ...(t.copy_requests?.length ? { copyRequests: t.copy_requests } : {}), ...(t.steps?.length ? { steps: t.steps, worked_ms: t.worked_ms } : {}), ...(t.spyglass ? { spyglass: t.spyglass } : {}) });
  }
  return history;
}

export function ChatMessages({ messages, logger }: { messages: ChatMessage[]; logger: Pick<EventLogger, 'log'> }) {
  return (
    <>
      {messages.map((m) => (
        // `chat-message` and `chat-${role}` are hooks for the tests.
        <li key={m.key} className={cn('chat-message', `chat-${m.role}`, messageClass, m.role === 'teacher' && 'ml-6')} data-track={`message:${m.key}`}>
          {/* Who is speaking is clear from the layout (the teacher's turns are bubbles); errors say so. */}
          {m.role === 'error' ? (
            <span className={cn('chat-who', 'mb-0.75 block text-xs font-semibold text-muted-foreground')}>Error</span>
          ) : (
            <span className="sr-only">{m.role === 'teacher' ? 'You:' : 'Assistant:'}</span>
          )}
          {m.quote !== null && m.quote !== undefined && (
            <div className={cn('mb-1 border-l-2 border-primary pl-2.5 text-sm text-foreground-2 italic', m.role === 'teacher' && 'ml-2')}>
              <span className="font-mono text-xs font-semibold text-primary">@model</span> {m.quote ? `“${shortQuote(m.quote)}”` : 'about a block'}
            </div>
          )}
          {m.files && (
            <ul className={cn(fileTilesClass, 'mb-1.5 justify-end p-0')} aria-label="Attached files">
              {m.files.map((f) => (
                <FileTile key={f.id} small name={f.name} title={f.name} badge={fileKind(f.name)} />
              ))}
            </ul>
          )}
          {m.steps && <TurnSteps steps={m.steps} workedMs={m.worked_ms} />}
          {m.role === 'assistant' ? (
            m.text && <ChatMarkdown text={m.text} />
          ) : (
            <div
              className={cn(
                'whitespace-pre-wrap text-foreground',
                m.role === 'teacher' && 'rounded-md border border-transparent bg-user-msg px-3 py-2.25 text-user-msg-foreground',
                m.role === 'error' && 'rounded-md border border-destructive-border bg-destructive-soft px-3 py-2.25 text-destructive',
              )}
            >
              {m.text}
            </div>
          )}
          {m.stopped && <div className="mt-1.25 text-sm text-muted-foreground">Stopped. Nothing from this reply was added to the document.</div>}
          {m.note && <div className="mt-1.25 text-sm text-muted-foreground">{m.note}</div>}
          {m.spyglass && m.turnId && <Spyglass turnId={m.turnId} result={m.spyglass} logger={logger} />}
        </li>
      ))}
    </>
  );
}
