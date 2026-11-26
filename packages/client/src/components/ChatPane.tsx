import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type ChatUsage, type CommentAnchor, type SpyglassResult, type TurnStep } from '@edw/shared';
import { ApiError } from '../api/http';
import type { SessionApi } from '../api/participant';
import type { ChatReply, Envelope, TurnControl } from '../api/types';
import type { EventLogger } from '../events/logger';
import type { ClipboardMarker } from '../events/trackers';
import type { ComposerBarProps } from './ComposerBar';
import { ChatComposer, shortQuote, type AttachedFile } from './ChatComposer';
import { MakeSlot } from './slots/slots';
import { openOffers, PictureChoices, type TurnPictureOffer } from './PictureChoices';
import { PluginRequests } from './PluginRequests';
import { usePluginRequests } from './usePluginRequests';
import { CopyChoice } from './CopyChoice';
import { openCopyRequests, useCopyChoice } from './useCopyChoice';
import { useChatUsage } from './useChatUsage';
import { ChatMessages, messagesOf, type ChatMessage } from './ChatMessages';
import { DraftReply, draftOf, QueuedReply, typedDuringNote } from './chatReplies';
import { createChatStore, shownText, type TurnTarget } from './chatTurn';
import { settleWithin } from '../lib/settle';

export type { ChatMessage } from './ChatMessages';

/** The model's raw reply so far, with the chat and doc its turn was sent from. */
export type TurnDraft = TurnTarget & { raw: string };

/** Where a turn was sent from, and the typing mark `beforeSend` gave (none if it took too long). */
export type TurnInfo = TurnTarget & { typingMark?: number };

export interface ChatPaneProps {
  /** The chat's tokens and cost so far, whenever they change (shown under the chat's name). */
  onUsage?: (usage: ChatUsage | null) => void;
  api: Pick<SessionApi, 'getChat' | 'getChatUsage' | 'sendChat' | 'sendChatStream' | 'stopChat' | 'addChatFile' | 'deleteReference' | 'listPlugins' | 'allowPlugin'>;
  /** The thread this pane shows; the parent remounts the pane when it changes. */
  threadId: string;
  /** The doc open in the editor: what the model edits unless the teacher names another. */
  docId: string;
  logger: Pick<EventLogger, 'log'>;
  getEnvelope: () => Envelope;
  /** A successful assistant turn: its proposals, new docs and the thread title, and where it was sent from. */
  onReply: (reply: Extract<ChatReply, { ok: true }>, turn: TurnInfo) => void;
  getClipboard?: () => ClipboardMarker | null;
  batchMs?: number;
  /** A passage the teacher picked in the document; the next message is sent about it. */
  anchor?: CommentAnchor | null;
  onClearAnchor?: () => void;
  /** Filled with a function that sends a message as if typed here (the editor's inline @model prompt). */
  sendRef?: { current: ((text: string, anchor?: CommentAnchor, attached?: AttachedFile[]) => void) | null };
  /**
   * The reply so far while it streams, then null when the turn ends or this pane goes (another
   * chat opened): a turn that outlives its pane still hands up its reply, but no more drafts.
   */
  onDraft?: (draft: TurnDraft | null) => void;
  /** The row under the chat box: "+" and the model picker (see ComposerBar). */
  bar?: Omit<ComposerBarProps, 'disabled' | 'onAddFiles'>;
  /**
   * Gets the teacher's latest work to the server first (typing, the editor's commands, Accept and
   * Reject, which travel as logged events): the model reads the document as the server has it.
   * What it returns (the screen's typing mark) comes back with the reply.
   */
  beforeSend?: () => Promise<number | void>;
  /** The pictures offered for the assistant's image blocks: which blocks are still suggestions, and swapping one in. */
  pictures?: { isOpen: (blockId: string) => boolean; choose: (offer: TurnPictureOffer, picture: number) => Promise<void> };
  /** The copy choice card: doc names, and Accept all for Approve all and use (useCopyChoice.ts). */
  copies?: { docName: (docId: string) => string | undefined; acceptAll: (docId: string) => void };
}

/** The nearest ancestor that scrolls vertically (the chat column). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}

/** The server's own wording when the workspace is over a limit (a 429: its budget or its messages this hour), else null. */
export function limitMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  try {
    const body = JSON.parse(err.body) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/** How long a send waits for `beforeSend` before it goes anyway (the logger retries a refused batch for ever). */
export const FLUSH_LIMIT_MS = 5000;

let localKey = 0;
const nextKey = () => `local-${(localKey += 1)}`;

export { shortQuote };

export function ChatPane({
  api,
  threadId,
  docId,
  logger,
  getEnvelope,
  onReply,
  getClipboard,
  batchMs = 500,
  anchor = null,
  onClearAnchor,
  sendRef,
  onDraft,
  bar,
  beforeSend,
  pictures,
  copies,
  onUsage,
}: ChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** Flags by turn: they can arrive in the same read as the result, before its message exists. */
  const flags = useRef(new Map<string, SpyglassResult>());
  const onSpyglass = (turnId: string, result: SpyglassResult) => {
    flags.current.set(turnId, result);
    setMessages((m) => m.map((x) => (x.turnId === turnId && x.role === 'assistant' ? { ...x, spyglass: result } : x)));
  };
  /** The turn under way, if any, and the messages queued behind it (see chatTurn.ts). */
  const [store] = useState(createChatStore);
  // Mirrored into ordinary state, not useSyncExternalStore: that renders the pane on its own, ahead
  // of the screen, so the turn's end and the document's new snapshot would show one render apart
  // and the editor took the suggestion in as plain text. Sends and Stop read the store itself.
  const [chat, setChat] = useState(store.get);
  useEffect(() => {
    setChat(store.get());
    return store.subscribe(() => setChat(store.get()));
  }, [store]);
  const { turn, queue } = chat;
  const sending = turn.phase !== 'idle';
  /** Pictures the assistant found for its image blocks, oldest first (PictureChoices shows those still open). */
  const [offers, setOffers] = useState<TurnPictureOffer[]>([]);
  const listRef = useRef<HTMLOListElement>(null);
  /** False once the pane has gone: its turn may still be running. */
  const mounted = useRef(true);
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (store.get().turn.phase !== 'idle') onDraftRef.current?.(null);
    };
  }, [store]);
  const handUp = (draft: TurnDraft | null) => {
    if (mounted.current) onDraftRef.current?.(draft);
  };
  const canStop = !!api.sendChatStream && !!api.stopChat;

  useEffect(() => {
    let cancelled = false;
    api
      .getChat(threadId)
      .then((turns) => {
        if (cancelled) return;
        const history = messagesOf(turns);
        setMessages((cur) => [...history, ...cur]);
        setOffers((cur) => [...turns.flatMap((t) => (t.pictures ?? []).map((p) => ({ ...p, turn_id: t.turn_id }))), ...cur]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, threadId]);

  // Keep the newest line in view: scroll the chat column to its very bottom on every new
  // message and streamed piece (scrolling the last message "into view" left it under the
  // composer, which is pinned to the bottom of the column).
  useLayoutEffect(() => {
    const scroller = scrollParent(listRef.current);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, chat]);

  /** Post a message and show the reply; `onFail` restores whatever the teacher typed. */
  // Ask first plugins the assistant asked for here; Allow tells it in the chat.
  const usage = useChatUsage(api.getChatUsage, threadId, sending);
  useEffect(() => onUsage?.(usage), [onUsage, usage]);
  const requests = usePluginRequests({ api, threadId, getEnvelope, sending, send: (text) => void deliver(text, null, () => undefined) });
  // A copy waiting on the teacher's choice: the card under the latest reply (useCopyChoice.ts).
  const copyChoice = useCopyChoice({ logger, docName: copies?.docName ?? (() => undefined), acceptAll: copies?.acceptAll ?? (() => undefined), send: (text, choice) => void deliver(text, null, () => undefined, [], openDocId, choice) });
  const openCopies = copies ? openCopyRequests(messages, copyChoice.chosen) : null;

  const openDocId = docId;
  /**
   * Sends a message about `docId` (the open doc unless given), or queues it while a reply is on
   * its way (from the chat box, the editor's @model prompt or Allow). Each turn, once it ends,
   * sends the next queued message.
   */
  async function deliver(prompt: string, about: CommentAnchor | null, onFail: () => void, attached: { id: string; name: string }[] = [], docId = openDocId, choice?: TurnControl['copy_choice']) {
    if (store.get().turn.phase !== 'idle') {
      store.dispatch({ type: 'queue', message: { key: nextKey(), prompt, docId, about, attached, onFail } });
      return;
    }
    const controller = new AbortController();
    store.dispatch({ type: 'start', threadId, docId, controller });
    setMessages((m) => [...m, { key: nextKey(), role: 'teacher', text: prompt, quote: about ? (about.quote ?? '') : null, ...(attached.length ? { files: attached } : {}) }]);
    const attachments = attached.map((a) => a.id);
    try {
      const mark = beforeSend ? await settleWithin(beforeSend(), FLUSH_LIMIT_MS) : undefined;
      const typingMark = typeof mark === 'number' ? mark : undefined;
      const { client_ts, focus_pane } = getEnvelope();
      const envelope = { client_ts, focus_pane };
      let reply;
      if (api.sendChatStream) {
        let raw = '';
        let steps: TurnStep[] = [];
        // Only a running turn takes new text: once stopped, the reply stays where the teacher saw it.
        const show = (next: string, agent?: { status: string | null; steps: TurnStep[] }) => {
          raw = next;
          const now = store.dispatch(agent ? { type: 'agent', raw, ...agent } : { type: 'text', raw });
          if (now.turn.phase === 'running') handUp({ raw, threadId, docId });
        };
        reply = await api.sendChatStream(
          threadId,
          docId,
          prompt,
          envelope,
          about ?? undefined,
          (delta) => show(raw + delta),
          // Agent mode: the same draft (text, then the accepted edits as a fenced block, which
          // the live preview reads), with what the model is doing beside it.
          (state) => {
            steps = state.steps ?? [];
            show(draftOf(state), { status: state.status, steps });
          },
          {
            signal: controller.signal,
            onStart: (id) => void store.dispatch({ type: 'named', turnId: id }),
            ...(attachments.length ? { attachments } : {}),
            ...(choice ? { copy_choice: choice } : {}),
            onSpyglass,
          },
        ).catch((err: unknown) => {
          if (!controller.signal.aborted) throw err;
          // Stopped: the reply ends where the teacher saw it, and none of its edits are applied.
          const now = store.get().turn;
          const turnId = now.phase === 'idle' ? null : now.turnId;
          return { ok: false as const, turn_id: turnId ?? nextKey(), message: 'Stopped', stopped: true, reply: shownText(now), steps };
        });
      } else {
        reply = choice
          ? await api.sendChat(threadId, docId, prompt, envelope, about ?? undefined, attachments.length ? attachments : undefined, choice)
          : attachments.length
          ? await api.sendChat(threadId, docId, prompt, envelope, about ?? undefined, attachments)
          : about
            ? await api.sendChat(threadId, docId, prompt, envelope, about)
            : await api.sendChat(threadId, docId, prompt, envelope);
      }
      const r = reply;
      // What the model thought and did stays with the reply, finished or stopped.
      const done = r.ok ? r.steps : 'steps' in r ? (r.steps as TurnStep[] | undefined) : undefined;
      const trace = done?.length ? { steps: done, ...(r.ok && r.worked_ms !== undefined ? { worked_ms: r.worked_ms } : {}) } : {};
      if (!r.ok && r.stopped) setMessages((m) => [...m, { key: `${r.turn_id}-r`, role: 'assistant', text: r.reply ?? '', stopped: true, ...trace }]);
      else {
        const note = r.ok ? typedDuringNote(r) : null;
        const copyRequests = r.ok && r.copy_requests?.length ? { copyRequests: r.copy_requests } : {};
        const flagged = flags.current.get(r.turn_id);
        setMessages((m) => [...m, { key: `${r.turn_id}-r`, role: r.ok ? 'assistant' : 'error', text: r.message, turnId: r.turn_id, ...(r.ok ? trace : {}), ...(note ? { note } : {}), ...copyRequests, ...(flagged ? { spyglass: flagged } : {}) }]);
      }
      if (r.ok) {
        const found = (r.pictures ?? []).map((p) => ({ ...p, turn_id: r.turn_id }));
        if (found.length) setOffers((o) => [...o, ...found]);
        onReply(r, { threadId, docId, ...(typingMark !== undefined ? { typingMark } : {}) });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.log('error', { source: 'client', message: `chat send failed: ${message}`.slice(0, 500) });
      setMessages((m) => [...m, { key: nextKey(), role: 'error', text: limitMessage(err) ?? 'The message could not be sent. Please try again.' }]);
      onFail();
    } finally {
      handUp(null);
      store.dispatch({ type: 'end' });
    }
    const next = store.get().queue[0];
    if (next) {
      store.dispatch({ type: 'dequeue', key: next.key });
      void deliver(next.prompt, next.about, next.onFail, next.attached, next.docId);
    }
  }

  /** Stop: cut the stream off, and tell the server, which applies nothing of the turn. */
  function stop() {
    const now = store.get().turn;
    if (now.phase !== 'running') return;
    store.dispatch({ type: 'stop' });
    now.controller.abort();
    if (now.turnId) void api.stopChat?.(threadId, now.turnId, shownText(now), getEnvelope()).catch(() => undefined);
  }

  if (sendRef) sendRef.current = (prompt, about, attached) => void deliver(prompt, about ?? null, () => undefined, attached);

  return (
    <section className="mx-auto flex min-h-full max-w-176 flex-col" aria-label="Chat">
      <ol className="m-0 flex-1 list-none p-0" ref={listRef}>
        {messages.length === 0 && (
          <li className="my-8 text-base text-muted-foreground">Ask for a worksheet, or for changes to the open document. Select text in the document and choose @model to ask about a passage.</li>
        )}
        <ChatMessages messages={messages} logger={logger} />
        {openCopies && copies && (
          <li>
            <CopyChoice requests={openCopies.requests} docName={copies.docName} disabled={sending} onChoose={(r, c) => copyChoice.choose(openCopies.turnId, r, c)} />
          </li>
        )}
        {turn.phase !== 'idle' && <DraftReply raw={turn.raw} status={turn.status} steps={turn.steps} />}
        {queue.map((q) => (
          <QueuedReply key={q.key} prompt={q.prompt} about={q.about} files={q.attached} onCancel={() => void store.dispatch({ type: 'cancel', key: q.key })} />
        ))}
        <MakeSlot zone="chat" as="li" />
      </ol>
      <ChatComposer
        logger={logger}
        batchMs={batchMs}
        getClipboard={getClipboard}
        addFile={api.addChatFile ? (file) => api.addChatFile!(threadId, file, getEnvelope()).then((r) => ({ id: r.id, name: r.name })) : undefined}
        removeFile={(id) => void api.deleteReference?.(id, getEnvelope()).catch(() => undefined)}
        onSend={(prompt, attached, restore) => deliver(prompt, anchor, restore, attached)}
        sending={sending}
        queues
        onStop={canStop ? stop : undefined}
        anchor={anchor}
        onClearAnchor={onClearAnchor}
        bar={bar}
        above={
          <>
            <PluginRequests pending={requests.pending} onAllow={requests.allow} onDismiss={requests.dismiss} />
            {pictures && <PictureChoices offers={openOffers(offers, pictures.isOpen)} onChoose={pictures.choose} />}
          </>
        }
      />
    </section>
  );
}
