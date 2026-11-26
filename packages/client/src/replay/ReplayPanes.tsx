/**
 * Each region of the replayed window, drawn with the app's own components (the sidebar, the
 * chat's head, messages and box, the document's header, toolbar and comments column), fed from
 * the snapshot, with handlers that do nothing. The layout around them follows WorkspaceScreen,
 * ChatColumn, ChatPane and DocColumn.
 */
import { useEffect, useMemo, useRef } from 'react';
import { ChatComposer } from '../components/ChatComposer';
import { ChatMessages } from '../components/ChatMessages';
import { CommentsPanel } from '../components/CommentsPanel';
import { threadsOf } from '../components/comments/threads';
import { DocHeader } from '../components/DocHeader';
import { docTree } from '../components/DocsTree';
import { Drawer } from '../components/Drawer';
import { ThreadSidebar } from '../components/ThreadSidebar';
import { suggestionsIn } from '../editor/suggest/suggestions';
import { ChatHead } from '../screens/ChatHead';
import { cn } from '../lib/utils';
import { ReplayCanvas } from './ReplayCanvas';
import type { Snapshot } from './snapshot';

const noop = () => undefined;
const later = () => Promise.resolve();
const quiet = { log: () => '' };

export function ReplaySidebar({ snap, label, width }: { snap: Snapshot; label: string; width: number }) {
  return (
    <ThreadSidebar
      threads={snap.threads}
      activeId={snap.threadId}
      open
      onToggle={noop}
      onSelect={noop}
      onNew={noop}
      account={{ name: `${label} (guest)` }}
      onDownloadData={later}
      docs={{ tree: docTree(snap.threads, snap.allDocs), activeDocId: snap.docId, onOpen: noop, onDelete: later }}
      projects={[]}
      activeProjectId={null}
      onSelectProject={noop}
      onNewProject={noop}
      onPreferences={noop}
      onPlugins={noop}
      width={width}
    />
  );
}

export function ReplayChat({ snap }: { snap: Snapshot }) {
  const scroller = useRef<HTMLDivElement>(null);
  // As ChatPane: the newest line stays in view.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [snap.chat.length, snap.threadId, snap.draft]);
  const bar = snap.bar;
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <ChatHead lead={null} thread={snap.threads.find((t) => t.id === snap.threadId)} onRename={noop} naming={false} onName={noop} usage={null} />
      <div ref={scroller} className="relative min-h-0 flex-auto overflow-y-auto overscroll-contain px-4" data-scroll-root>
        <section className="mx-auto flex min-h-full max-w-176 flex-col" aria-label="Chat">
          <ol className="m-0 flex-1 list-none p-0">
            {snap.chat.length === 0 && (
              <li className="my-8 text-base text-muted-foreground">Ask for a worksheet, or for changes to the open document. Select text in the document and choose @model to ask about a passage.</li>
            )}
            <ChatMessages messages={snap.chat} logger={quiet} />
          </ol>
          <ChatComposer
            logger={quiet}
            onSend={noop}
            shown={snap.draft}
            addFile={() => new Promise(noop)}
            bar={bar ? { models: bar.models, model: bar.model, effort: bar.effort, onModelChange: noop, editMode: bar.editMode, onEditModeChange: noop, spyglass: bar.spyglass, onSpyglassChange: noop } : undefined}
          />
        </section>
      </div>
    </aside>
  );
}

export function ReplayDoc({ snap }: { snap: Snapshot }) {
  const doc = snap.allDocs.find((d) => d.id === snap.docId);
  const order = useMemo(() => new Map(snap.blocks.map((b, i) => [b.id, i])), [snap.blocks]);
  const threads = useMemo(() => threadsOf(snap.comments, order), [snap.comments, order]);
  const open = threads.filter((t) => !t.root.resolved_at);
  const suggestions = useMemo(() => (snap.docId ? suggestionsIn(snap.blocks, snap.docId) : []), [snap.blocks, snap.docId]);
  const commentsWidth = snap.viewport?.regions.comments?.width;
  const showComments = commentsWidth !== undefined;
  const firstOnScreen = snap.blocks.find((b) => snap.visible.has(b.id))?.id ?? null;
  return (
    // As DocColumn: the header, then the document and its comments column side by side.
    <section className={cn('doc-panel', 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card')} aria-label="Document">
      <header className={cn('doc-head', 'flex-none border-b border-border px-3')}>
        {doc && (
          <DocHeader
            doc={doc}
            onRename={noop}
            onNew={noop}
            onDuplicate={noop}
            onExport={noop}
            onPreview={noop}
            onUpload={noop}
            proposals={snap.blocks.some((b) => b.status === 'proposed' || b.pending)}
            onAcceptAll={noop}
            onRejectAll={noop}
            comments={{ count: open.length, suggestions: suggestions.length, open: showComments, onToggle: noop }}
          />
        )}
      </header>
      <div className="flex min-h-0 flex-auto">
        {doc ? (
          <ReplayCanvas
            docId={doc.id}
            blocks={snap.blocks}
            style={doc.style}
            marks={open.map((t) => ({ id: t.root.id, block_id: t.root.block_id, quote: t.root.quote }))}
            selection={snap.focusPane === 'canvas' ? snap.selection : null}
            scrollTop={snap.canvasScroll}
            firstVisible={firstOnScreen}
          />
        ) : (
          <p className="p-8 text-muted-foreground">No document open</p>
        )}
        {doc && showComments && (
          <Drawer docked open side="right" width={commentsWidth} label="Comments" onClose={noop}>
            <CommentsPanel
              width={commentsWidth}
              threads={threads}
              draft={null}
              active={null}
              working={{}}
              onSelect={noop}
              onCreate={later}
              onCancelDraft={noop}
              onReply={later}
              onDelete={later}
              onEdit={later}
              onResolve={later}
              suggestions={{ items: suggestions, active: null, positionOf: (id) => order.get(id) ?? Infinity, onSelect: noop, onDecide: noop }}
              onClose={noop}
            />
          </Drawer>
        )}
      </div>
    </section>
  );
}
