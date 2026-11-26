import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, Doc, Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope, SessionInfo } from '../api/types';
import { FLUSH_LIMIT_MS } from '../components/ChatPane';
import { settleWithin } from '../lib/settle';
import { Splitter } from '../components/Splitter';
import { ThreadSidebar } from '../components/ThreadSidebar';
import { Drawer } from '../components/Drawer';
import { SidebarOpener } from '../components/SidebarOpener';
import { docTree } from '../components/DocsTree';
import type { CanvasSnapshot, PublicBlock } from '../editor/types.js';
import type { EventContext, EventLogger } from '../events/logger';
import type { ClipboardMarker, FocusPaneState } from '../events/trackers';
import { attachClipboardMarker, useBlockVisibility, useFocusPaneTracking, useScrollTracking } from '../events/trackers';
import { useInteractionTracking } from '../events/interactions';
import { docsInThread, hasProposals, headingName } from '../state/canvasState';
import { useClasses } from './classes/useClasses';
import { useDocxUpload, type Notice } from './useDocxUpload';
import { ChatColumn } from './ChatColumn';
import { DocColumn } from './DocColumn';
import { useTurnPreview } from './useTurnPreview';
import { useSyncRecovery } from './useSyncRecovery';
import { useTurnReply } from './useTurnReply';
import { useDocStyle } from './useDocStyle';
import type { AttachedFile } from '../components/ChatComposer';
import { readStore, writeStore } from '../lib/store';
import { useWorkspaceLayout } from './useWorkspaceLayout';
import { useCanvasWrites } from './useCanvasWrites';
import { usePictureChoice } from './usePictureChoice';
import { useProjects } from './useProjects';
import { useDocComments } from './useDocComments';
import { useSuggestions } from './useSuggestions';
import { useDecisions } from './useDecisions';
import { useComposerBar } from './useComposerBar';
import { NEW_DOC_NAME, useDocActions } from './useDocActions';
import { useFontNotice } from './useFontNotice';
import { FontNotice } from '../components/FontNotice';
import { useThreadActions } from './useThreadActions';
import { useAutoName } from './useAutoName';
import { MentionsProvider } from '../components/mentions/context';
import { MainViews } from './MainViews';
import type { MainView } from './mainView';
import { useClassContext } from './useClassContext';
import { hasPendingDraft } from './plugins/draftLink';

export interface WorkspaceScreenProps {
  session: SessionInfo;
  api: SessionApi;
  logger: EventLogger;
  focusState: FocusPaneState;
  /** Shared with the logger: every event carries the open doc and thread. */
  context: { current: EventContext };
  /** Interaction logging is on (events/interactions): pointer, clicks, layout. */
  interactions?: boolean;
}

export { NEW_DOC_NAME };
const NO_BLOCKS: PublicBlock[] = [];
/** How long after the last change an "Untitled" doc takes its heading as its name. */
const AUTO_NAME_MS = 1200;
const lastDocKey = (sessionId: string) => `edw.lastDoc.${sessionId}`;

/**
 * Who the sidebar shows. Until teachers have accounts, whoever has the link is a guest,
 * named by the workspace's name from /admin (or its id when it has none).
 */
export function guestName(session: Pick<SessionInfo, 'label' | 'session_id'>): string {
  return `${session.label.trim() || session.session_id} (guest)`;
}

export type { MainView };

const newest = (threads: Thread[]) => [...threads].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];

/**
 * The editor: [chats sidebar] [chat] | [document]. Each chat (thread) owns its docs; the
 * model sees only the open thread's docs, and edits the open doc unless told otherwise.
 * Opening a doc from another thread switches the chat to that thread.
 */
export function WorkspaceScreen({ session, api, logger, focusState, context, interactions = false }: WorkspaceScreenProps) {
  const [snap, setSnap] = useState<CanvasSnapshot | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<{ threadId: string; docId: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  /** Bumped to rebuild the editor from the server after a refused command. */
  const [epoch, setEpoch] = useState(0);
  const layout = useWorkspaceLayout();
  const { workspaceRef } = layout;
  const revealComments = layout.comments.show;
  /** A passage picked with "@model"; the chat sends the next message about it. */
  const [comment, setComment] = useState<CommentAnchor | null>(null);
  /** The chat's send function, for the editor's inline @model prompt. */
  const sendChat = useRef<((text: string, anchor?: CommentAnchor, attached?: AttachedFile[]) => void) | null>(null);
  /** What the main area shows. */
  const [view, setView] = useState<MainView>({ kind: 'editor' });
  /** The doc last open in each thread, so returning to a chat returns to its doc. */
  const lastDocOf = useRef(new Map<string, string>());

  const rootRef = useRef<HTMLElement | null>(null);
  const threadsRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const clipboard = useRef<ClipboardMarker | null>(null);

  const panes = useMemo(() => ({ threads: threadsRef, canvas: canvasRef, chat: chatRef }), []);
  useFocusPaneTracking(logger, panes, focusState);
  const scrollMs = session.config.thresholds.scroll_throttle_ms;
  useScrollTracking(logger, 'canvas', canvasRef, scrollMs);
  useScrollTracking(logger, 'chat', chatRef, scrollMs);
  useBlockVisibility(logger, canvasRef);
  useInteractionTracking(logger, rootRef, interactions, { selectionThrottleMs: session.config.thresholds.selection_throttle_ms });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const marker = attachClipboardMarker(root);
    clipboard.current = marker;
    return () => {
      marker.detach();
      clipboard.current = null;
    };
  }, []);

  const openRef = useRef(open);
  const openDoc = useCallback(
    (threadId: string, docId: string, opts: { log?: boolean } = {}) => {
      const cur = openRef.current;
      if (cur?.docId === docId && cur.threadId === threadId) return;
      // The logger reads this: the open events already carry the doc they open.
      context.current = { doc_id: docId, thread_id: threadId };
      if (opts.log !== false) {
        if (cur?.threadId !== threadId) logger.log('thread_open', { thread_id: threadId });
        logger.log('doc_open', { doc_id: docId });
      }
      openRef.current = { threadId, docId };
      setOpen(openRef.current);
      setView({ kind: 'editor' });
      setComment(null);
      lastDocOf.current.set(threadId, docId);
      writeStore(lastDocKey(api.sessionId), docId);
    },
    [api.sessionId, context, logger],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getCanvas(), api.listThreads()])
      .then(([s, ts]) => {
        if (cancelled) return;
        setSnap(s);
        setThreads(ts);
        const remembered = s.docs.find((d) => d.id === readStore(lastDocKey(api.sessionId)));
        const thread = remembered ? ts.find((t) => t.id === remembered.thread_id) : newest(ts);
        const doc = remembered ?? (thread ? docsInThread(s, thread.id)[0] : undefined);
        if (thread && doc) openDoc(thread.id, doc.id, { log: false });
        if (hasPendingDraft() && api.listPluginDrafts) setView({ kind: 'plugins' });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, openDoc]);

  const getEnvelope = useCallback(
    (): Envelope => ({ client_ts: new Date().toISOString(), focus_pane: focusState.get(), doc_id: context.current.doc_id, thread_id: context.current.thread_id }),
    [focusState, context],
  );

  const { keepNewerTyping, structural, onLocalEdit, forgetTyping, typingMark } = useCanvasWrites({ api, getEnvelope, setSnap });
  const projectsState = useProjects({ api, getEnvelope, logger, setView });
  const { projects, showProject } = projectsState;
  const classes = useClasses({ api, getEnvelope, logger, setView });

  const onDecision = useDecisions({ setSnap, logger, context });
  const pictures = usePictureChoice({ api, getEnvelope, snap, setSnap, keepNewerTyping, onDecision });
  // The copy choice under a reply: doc names, and Accept all for "Approve all and use".
  const docs = snap?.docs;
  const copies = useMemo(
    () => ({ docName: (id: string) => docs?.find((d) => d.id === id)?.name, acceptAll: (id: string) => onDecision({ decision: 'accept', block_id: null, doc_id: id, mode: 'accept_all' }) }),
    [docs, onDecision],
  );

  const uploadImage = useCallback((file: File) => api.uploadAsset(file, getEnvelope()), [api, getEnvelope]);
  const resolveAssetUrl = useCallback((src: string) => api.assetUrl(src), [api]);

  // The editor dropped its queue after a refused command: take the server's canvas as truth.
  const onSyncError = useSyncRecovery({ api, logger, forgetTyping, setSnap, setEpoch, setLoadError });

  const fontNotice = useFontNotice();
  const { flushEditor, snapRef, newDoc, duplicateDoc, deleteDoc, previewFile, exportDoc, downloadData, renameDoc } = useDocActions({
    session, api, logger, open, openRef, snap, setSnap, threads, structural, openDoc, lastDocOf, onSyncError, confirmFonts: fontNotice.confirm,
  });

  const [notice, setNotice] = useState<Notice>(null);
  const uploadDocx = useDocxUpload({ open, api, getEnvelope, structural, openDoc, logger, setNotice, getSnap: () => snapRef.current, deleteDoc });
  const commentsColumn = layout.comments.setOpen;
  const failNotice = useCallback((text: string) => setNotice({ text, error: true }), []);
  // Before a turn: the server gets the teacher's latest work, and the reply wins over typing up to here.
  const beforeTurn = useCallback(() => settleWithin((flushEditor.current?.() ?? Promise.resolve()).then(typingMark), FLUSH_LIMIT_MS), [flushEditor, typingMark]);
  const comments = useDocComments({ api, getEnvelope, open, openRef, snap, beforeTurn, onReply: (r, typingMark) => onReplyRef.current(r, { typingMark }), onFail: failNotice, setColumn: commentsColumn });
  const addComments = comments.add;

  const onReply = useTurnReply({ setSnap, keepNewerTyping, addComments, revealComments, openDoc, openRef, context });

  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const { setDocStyle, decideStyle } = useDocStyle({ open, setSnap, structural, onSyncError });

  const { creatingThread, naming, renameThread, nameThread, newThread, selectThread, startProjectChat, addProjectChatFile } = useThreadActions({
    api, logger, getEnvelope, open, openRef, snap, setSnap, setThreads, setView, setNotice, openDoc, lastDocOf, sendChat,
  });
  // A chat's turn: its reply taken in, then an Untitled chat may be named (after its first three prompts).
  const nameAfterTurn = useAutoName({ api, getEnvelope, threads, setThreads, logger });
  const onChatReply = useCallback<typeof onReply>(
    (reply, turn) => {
      onReply(reply, turn);
      const threadId = turn?.threadId;
      if (threadId) void nameAfterTurn(threadId);
    },
    [onReply, nameAfterTurn],
  );

  const activeThread = threads.find((t) => t.id === open?.threadId);
  const activeProject = activeThread?.project_id ? projects.find((p) => p.id === activeThread.project_id && !p.archived_at) : undefined;
  const pageProject = view.kind === 'project' ? projects.find((p) => p.id === view.id) : undefined;
  const inEditor = view.kind === 'editor' || (view.kind === 'project' && !pageProject);
  // Something picked in the sidebar closes it when it is a drawer.
  const fromSidebar =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      layout.sidebar.picked();
      fn(...a);
    };
  const { crumb, mentions, showIdeas, sidebar } = useClassContext({ api, classes, activeThread, activeProject, showProject, view, setView, inEditor, fromSidebar });

  const doc: Doc | undefined = open && snap ? snap.docs.find((d) => d.id === open.docId) : undefined;
  const { preview, setDraft } = useTurnPreview(snap, open);
  const proposals = snap && doc ? hasProposals(snap, doc.id) : false;

  // An "Untitled" doc takes its first heading's text as its name (once typing pauses), whether
  // the teacher wrote the heading or the assistant suggested it. A name the teacher gives stays.
  const autoName = doc && snap && doc.name === NEW_DOC_NAME ? headingName(snap, doc.id) : null;
  const autoNameDoc = doc?.id;
  useEffect(() => {
    if (!autoName || !autoNameDoc) return;
    const t = setTimeout(() => {
      void structural({ command: 'doc_rename', doc_id: autoNameDoc, name: autoName, auto: true }).catch((err: unknown) => onSyncError(err));
    }, AUTO_NAME_MS);
    return () => clearTimeout(t);
  }, [autoName, autoNameDoc, structural, onSyncError]);

  /* ---------------------------------------------------------- model picker */
  const bar = useComposerBar({ session, api, logger });

  /* ---------------------------------------------------------- comments */
  const styleSuggestion = doc?.proposed_style?.style;
  const suggestions = useSuggestions({ blocks: snap?.blocks ?? NO_BLOCKS, docId: doc?.id ?? null, onDecision, reveal: revealComments, paneRef: canvasRef, onPick: () => comments.setActive(null) });
  const showComments = layout.comments.open && (comments.threads.length > 0 || suggestions.items.length > 0 || comments.draft !== null || !!styleSuggestion);
  const setCommentsColumn = commentsColumn;

  // Each chat's documents, for the sidebar.
  const tree = useMemo(() => docTree(threads, snap?.docs ?? []), [threads, snap?.docs]);
  const openFromSidebar = useCallback(
    (threadId: string, docId: string) => {
      setView({ kind: 'editor' });
      openDoc(threadId, docId);
    },
    [openDoc],
  );

  const opener = !layout.sidebar.open && <SidebarOpener onOpen={layout.sidebar.toggle} onNew={fromSidebar(() => void newThread())} busy={creatingThread} compact={layout.stacked} />;

  return (
    <MentionsProvider source={mentions}>
    <main
      className="workspace relative flex min-h-0 flex-1 bg-background max-split:flex-col"
      // How the assistant's suggestions look in the document (editor/suggestions.css).
      data-suggest-view={bar.suggestView}
      ref={(el) => {
        rootRef.current = el;
        workspaceRef.current = el;
      }}
    >
      <Drawer docked={layout.docked} open={layout.sidebar.open} side="left" width={layout.sidebar.width} label="Sidebar" onClose={layout.closeDrawer}>
      <ThreadSidebar
        threads={threads}
        activeId={inEditor ? (open?.threadId ?? null) : null}
        open={layout.sidebar.open}
        onToggle={layout.sidebar.toggle}
        onSelect={fromSidebar(selectThread)}
        onNew={fromSidebar(() => void newThread())}
        busy={creatingThread}
        account={{ name: guestName(session) }}
        onDownloadData={downloadData}
        panelRef={threadsRef}
        width={layout.sidebar.width}
        docs={{ tree, activeDocId: inEditor ? (open?.docId ?? null) : null, onOpen: fromSidebar(openFromSidebar), onDelete: deleteDoc }}
        projects={api.listProjects ? projects : undefined}
        activeProjectId={view.kind === 'project' ? view.id : inEditor ? (activeProject?.id ?? null) : null}
        onSelectProject={fromSidebar((id: string) => showProject(id))}
        onNewProject={api.createProject ? fromSidebar(() => showProject(null)) : undefined}
        newProjectOpen={view.kind === 'new-project'}
        onPreferences={api.getPreferences ? fromSidebar(() => setView({ kind: 'preferences' })) : undefined}
        preferencesOpen={view.kind === 'preferences'}
        onPlugins={api.listPlugins ? fromSidebar(() => setView({ kind: 'plugins' })) : undefined}
        pluginsOpen={view.kind === 'plugins'}
        onNeedsGroups={api.listNeedsGroups ? fromSidebar(() => setView({ kind: 'needs-groups' })) : undefined}
        needsGroupsOpen={view.kind === 'needs-groups'}
        onPedagogy={api.pedagogyInfo ? fromSidebar(() => setView({ kind: 'pedagogy' })) : undefined}
        pedagogyOpen={view.kind === 'pedagogy' && !view.alignsTo}
        curriculum={sidebar.curriculum}
        classes={sidebar.classes}
      />
      </Drawer>
      {/* Outside the editor (a project's page, the New project form) the opener floats at the top left. */}
      {!inEditor && opener && <div className="absolute top-2 left-2 z-10">{opener}</div>}
      {layout.docked && layout.sidebar.open && <Splitter label="Resize the sidebar" side="before" width={layout.sidebar.width} min={layout.sidebar.min} max={layout.sidebar.max} onResize={layout.sidebar.setWidth} />}
      <MainViews
        view={view} setView={setView} pageProject={pageProject} api={api} getEnvelope={getEnvelope} logger={logger} batchMs={session.config.thresholds.event_batch_ms}
        clipboard={clipboard} bar={bar} classes={classes} projects={projectsState} threads={threads} setThreads={setThreads} openRef={openRef} newThread={newThread}
        selectThread={selectThread} startProjectChat={startProjectChat} addProjectChatFile={addProjectChatFile} showIdeas={showIdeas}
      />
      <ChatColumn
        chatRef={chatRef} layout={layout} inEditor={inEditor} opener={opener} crumb={crumb}
        activeThread={activeThread} renameThread={renameThread} naming={naming} nameThread={nameThread} api={api} session={session} open={open} doc={doc}
        logger={logger} getEnvelope={getEnvelope} onReply={onChatReply} clipboard={clipboard} comment={comment} setComment={setComment} sendChat={sendChat}
        setDraft={setDraft} beforeTurn={beforeTurn} bar={bar} pictures={pictures} copies={copies}
      />
      <DocColumn
        canvasRef={canvasRef} layout={layout} inEditor={inEditor} opener={opener} doc={doc} snap={snap} preview={preview} epoch={epoch} loadError={loadError}
        logger={logger} scrollMs={scrollMs} renameDoc={renameDoc} newDoc={newDoc} duplicateDoc={duplicateDoc} exportDoc={exportDoc} previewFile={previewFile} uploadDocx={uploadDocx}
        notice={notice} setNotice={setNotice} proposals={proposals} onDecision={onDecision} comments={comments} suggestions={suggestions} showComments={showComments}
        setCommentsColumn={setCommentsColumn} styleSuggestion={styleSuggestion} decideStyle={decideStyle} teacherName={guestName(session)} structural={structural}
        onLocalEdit={onLocalEdit} onSyncError={onSyncError} uploadImage={uploadImage} resolveAssetUrl={resolveAssetUrl} setDocStyle={setDocStyle}
        setComment={setComment} sendChat={sendChat} flushEditor={flushEditor}
      />
      {fontNotice.asking && <FontNotice question={fontNotice.asking} />}
    </main>
    </MentionsProvider>
  );
}
