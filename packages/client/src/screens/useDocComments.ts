import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Comment, CommentAnchor } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { ChatReply, Envelope } from '../api/types';
import { limitMessage } from '../components/ChatPane';
import { threadsOf } from '../components/CommentsPanel';
import { scrollToMiddle } from './scrollToMiddle';
import type { CanvasSnapshot } from '../editor/types.js';

type CommentsApi = Pick<SessionApi, 'listComments' | 'createComment' | 'deleteComment' | 'editComment' | 'resolveComment' | 'answerComment'>;

export interface DocCommentsDeps {
  api: CommentsApi;
  getEnvelope: () => Envelope;
  /** The open chat and doc. */
  open: { threadId: string; docId: string } | null;
  /** Read when an answer arrives, so it shows only if the teacher is still on that doc. */
  openRef: { current: { threadId: string; docId: string } | null };
  snap: CanvasSnapshot | null;
  /** Sends what the editor still holds before the assistant reads the doc. */
  /** Flushes the editor before a turn and gives the typing mark (see useCanvasWrites), or undefined if it took too long. */
  beforeTurn: () => Promise<number | undefined>;
  /** The assistant answered a comment: its changes and comments go into the workspace. */
  onReply: (reply: Extract<ChatReply, { ok: true }>, typingMark?: number) => void;
  onFail: (text: string) => void;
  /** Opens the comments column. */
  setColumn: (open: boolean) => void;
}

/**
 * The open doc's comments: loading them, the thread being started, the selected thread, what
 * the assistant is doing in a thread while it answers, and every change to them.
 */
export function useDocComments({ api, getEnvelope, open, openRef, snap, beforeTurn, onReply, onFail, setColumn }: DocCommentsDeps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState<CommentAnchor | null>(null);
  const [active, setActive] = useState<string | null>(null);
  /** Thread id -> what the assistant is doing there, while it answers an @model comment. */
  const [working, setWorking] = useState<Record<string, string>>({});
  const replyRef = useRef(onReply);
  replyRef.current = onReply;

  // A draft or selection on the last doc does not carry over.
  const docId = open?.docId ?? null;
  useEffect(() => {
    setDraft(null);
    setActive(null);
    setComments([]);
    if (!docId) return;
    let cancelled = false;
    api
      .listComments(docId)
      .then((cs) => {
        if (!cancelled) setComments(cs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, docId]);

  /** Comments the assistant left: added once each. */
  const add = useCallback((added: Comment[]) => {
    if (added.length) setComments((cs) => [...cs, ...added.filter((c) => !cs.some((x) => x.id === c.id))]);
  }, []);

  const blockOrder = useMemo(() => {
    const own = (snap?.blocks ?? []).filter((b) => b.doc_id === docId).sort((a, b) => a.order - b.order);
    return new Map(own.map((b, i) => [b.id, i]));
  }, [snap, docId]);
  const threads = useMemo(() => threadsOf(comments, blockOrder), [comments, blockOrder]);
  const positionOf = useCallback((blockId: string) => blockOrder.get(blockId) ?? Infinity, [blockOrder]);
  // Resolved threads are not marked in the document or counted; they stay in the column, folded away.
  const openThreads = useMemo(() => threads.filter((t) => !t.root.resolved_at), [threads]);
  const marks = useMemo(() => openThreads.map((t) => ({ id: t.root.id, block_id: t.root.block_id, quote: t.root.quote })), [openThreads]);

  const select = useCallback(
    (rootId: string) => {
      setActive(rootId);
      const root = comments.find((c) => c.id === rootId);
      if (root) scrollToThread(root);
    },
    [comments],
  );

  const start = useCallback(
    (anchor: CommentAnchor) => {
      setDraft(anchor);
      setActive(null);
      setColumn(true);
    },
    [setColumn],
  );

  /** A teacher's comment sent with Send to model ticked: the assistant answers in its thread (and may suggest edits). */
  const answer = useCallback(
    async (c: Comment) => {
      const cur = openRef.current;
      if (!cur) return;
      const rootId = c.root_id ?? c.id;
      const status = (s: string | null) =>
        setWorking((w) => {
          const next = { ...w };
          if (s) next[rootId] = s;
          else delete next[rootId];
          return next;
        });
      status('Thinking');
      const failed = (text?: string | null) => onFail(text ?? 'The assistant couldn’t answer the comment. Please try again.');
      try {
        const mark = await beforeTurn();
        const { client_ts, focus_pane } = getEnvelope();
        const reply = await api.answerComment(cur.threadId, c, { client_ts, focus_pane }, (s) => status(s.status ?? 'Writing a reply'));
        if (!reply.ok) return failed();
        const a = reply.comment;
        // Shown only if the teacher is still on that doc; it is there when they come back.
        if (a) setComments((cs) => (openRef.current?.docId === a.doc_id ? [...cs, a] : cs));
        replyRef.current(reply, mark);
      } catch (err) {
        failed(limitMessage(err));
      } finally {
        status(null);
      }
    },
    [api, getEnvelope, openRef, beforeTurn, onFail],
  );

  const create = useCallback(
    async (anchor: CommentAnchor, body: string, send: boolean) => {
      if (!docId) return;
      const c = await api.createComment({ doc_id: docId, block_id: anchor.block_id, quote: anchor.quote, body }, getEnvelope());
      setComments((cs) => [...cs, c]);
      setDraft(null);
      setActive(c.id);
      if (send) void answer(c);
    },
    [api, docId, getEnvelope, answer],
  );

  const reply = useCallback(
    async (rootId: string, body: string, send: boolean) => {
      if (!docId) return;
      const c = await api.createComment({ doc_id: docId, root_id: rootId, body }, getEnvelope());
      setComments((cs) => [...cs, c]);
      if (send) void answer(c);
    },
    [api, docId, getEnvelope, answer],
  );

  const remove = useCallback(
    async (c: Comment) => {
      await api.deleteComment(c.id, getEnvelope());
      // A thread's first comment takes the thread with it.
      setComments((cs) => cs.filter((x) => x.id !== c.id && (c.root_id !== null || x.root_id !== c.id)));
      if (!c.root_id) setActive((a) => (a === c.id ? null : a));
    },
    [api, getEnvelope],
  );

  const edit = useCallback(
    async (c: Comment, body: string) => {
      const next = await api.editComment(c.id, body, getEnvelope());
      setComments((cs) => cs.map((x) => (x.id === next.id ? next : x)));
    },
    [api, getEnvelope],
  );

  const resolve = useCallback(
    async (root: Comment, resolved: boolean) => {
      const next = await api.resolveComment(root.id, resolved, getEnvelope());
      setComments((cs) => cs.map((x) => (x.id === next.id ? next : x)));
      if (resolved) setActive((a) => (a === root.id ? null : a));
    },
    [api, getEnvelope],
  );

  return { threads, positionOf, openThreads, marks, draft, setDraft, active, setActive, working, add, select, start, create, reply, remove, edit, resolve };
}

/** The commented text comes to about the middle of the document's view: its highlight, or its block when the quote is no longer found. */
export function scrollToThread(root: Pick<Comment, 'id' | 'block_id'>) {
  scrollToMiddle(document.querySelector(`.doc-panel [data-comment-id="${root.id}"]`) ?? document.querySelector(`.doc-panel [data-block-id="${root.block_id}"]`));
}
