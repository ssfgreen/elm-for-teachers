/**
 * The workspace's chat column: the chat's name (with its project and the naming wand), the
 * chat's tokens and cost so far under it (UsageMeter) with the workspace's "£N left"
 * (useBudgetLeft), the make kit's banner slot, the transcript
 * (ChatPane), and the line to resize it by. Display only: the state it shows and changes belongs
 * to WorkspaceScreen, except the counter's figures, which the pane hands up.
 */
import { useState, type CSSProperties, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import type { ChatUsage, Doc, Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { SessionInfo } from '../api/types';
import { ChatPane, type ChatPaneProps } from '../components/ChatPane';
import { Splitter } from '../components/Splitter';
import { MakeSlot } from '../components/slots/slots';
import type { ClipboardMarker } from '../events/trackers';
import { ChatHead } from './ChatHead';
import { useBudgetLeft } from './useBudgetLeft';
import type { useWorkspaceLayout } from './useWorkspaceLayout';

export interface ChatColumnProps {
  chatRef: RefObject<HTMLElement>;
  layout: ReturnType<typeof useWorkspaceLayout>;
  inEditor: boolean;
  /** The sidebar's opener, when the sidebar is closed. */
  opener: ReactNode;
  /** Where the open chat belongs (a project, a class or a year group), shown before its name; a click opens it. */
  crumb?: { name: string; title: string; onOpen: () => void };
  activeThread: Thread | undefined;
  renameThread: (title: string) => void;
  naming: boolean;
  nameThread: () => Promise<void>;
  api: SessionApi;
  session: SessionInfo;
  open: { threadId: string; docId: string } | null;
  doc: Doc | undefined;
  logger: ChatPaneProps['logger'];
  getEnvelope: ChatPaneProps['getEnvelope'];
  onReply: ChatPaneProps['onReply'];
  clipboard: MutableRefObject<ClipboardMarker | null>;
  comment: ChatPaneProps['anchor'];
  setComment: (anchor: null) => void;
  sendChat: NonNullable<ChatPaneProps['sendRef']>;
  setDraft: NonNullable<ChatPaneProps['onDraft']>;
  beforeTurn: NonNullable<ChatPaneProps['beforeSend']>;
  bar: ChatPaneProps['bar'];
  pictures: ChatPaneProps['pictures'];
  copies: ChatPaneProps['copies'];
}

export function ChatColumn({ chatRef, layout, inEditor, opener, crumb, activeThread, renameThread, naming, nameThread, api, session, open, doc, logger, getEnvelope, onReply, clipboard, comment, setComment, sendChat, setDraft, beforeTurn, bar, pictures, copies }: ChatColumnProps) {
  const { workspaceRef } = layout;
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  // Fetched again whenever the chat's usage is, which is after each turn.
  const budgetLeft = useBudgetLeft(api.getBudget, usage);
  // The workspace's height, for the line between a stacked editor and chat.
  const stackHeight = () => workspaceRef.current?.clientHeight || window.innerHeight;

  return (
    <>
      {/* The chat keeps the width it was dragged to, but gives way first when the window is
          short of room (its large shrink factor), down to CHAT_MIN, so the document stays
          readable. Stacked, it goes under the document at full width, with its share of the height. */}
      <aside
        className="flex min-h-0 min-w-75 shrink-100 flex-col overflow-hidden bg-background max-split:order-3 max-split:w-auto! max-split:min-w-0 max-split:flex-none max-split:basis-(--chat-share)"
        ref={chatRef}
        data-pane="chat"
        style={{ width: layout.chat.width, '--chat-share': `${(layout.chat.share * 100).toFixed(1)}%` } as CSSProperties}
        hidden={!inEditor}
      >
        {/* Lined up with the transcript: its 44rem plus the scroller's side padding. */}
        {/* The chat's tokens and cost sit under its name, in the same column, so they line up with it. */}
        <ChatHead
          lead={!layout.stacked && opener ? opener : null}
          crumb={crumb}
          thread={activeThread}
          onRename={renameThread}
          naming={naming}
          onName={api.nameThread ? () => void nameThread() : undefined}
          usage={open ? usage : null}
          budgetLeft={budgetLeft}
        />
        <MakeSlot zone="banner" />
        {/* The transcript scrolls below the chat's name, so messages never pass under it. */}
        <div className="relative min-h-0 flex-auto overflow-y-auto overscroll-contain px-4" data-scroll-root>
          {open && doc && (
            <ChatPane
              key={open.threadId}
              api={api}
              threadId={open.threadId}
              docId={doc.id}
              logger={logger}
              getEnvelope={getEnvelope}
              onReply={onReply}
              getClipboard={() => clipboard.current}
              batchMs={session.config.thresholds.event_batch_ms}
              anchor={comment}
              onClearAnchor={() => setComment(null)}
              sendRef={sendChat}
              onDraft={setDraft}
              beforeSend={beforeTurn}
              bar={bar}
              pictures={pictures}
              copies={copies}
              onUsage={setUsage}
            />
          )}
        </div>
      </aside>
      {inEditor && !layout.stacked && <Splitter label="Resize the chat" side="before" width={layout.chat.width} min={layout.chat.min} max={layout.chat.max()} onResize={layout.chat.setWidth} />}
      {inEditor && layout.stacked && (
        <Splitter
          label="Resize the chat"
          axis="y"
          side="after"
          className="order-2"
          width={layout.chat.share * stackHeight()}
          min={0.2 * stackHeight()}
          max={0.8 * stackHeight()}
          onResize={(h) => layout.chat.setShare(h / stackHeight())}
        />
      )}
    </>
  );
}
