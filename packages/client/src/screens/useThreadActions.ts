/**
 * What the teacher does to a chat (thread): rename it, have the model name it, start one, pick
 * one in the sidebar, and start one from a project's, class's or year group's page.
 *
 * Holds `creatingThread`, `naming`, the draft chats a project page's box will start, and the
 * first message of such a chat, sent once its pane is up.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CommentAnchor, Doc, Thread } from '@edw/shared';
import type { ThreadPlace } from '../api/classes';
import { ApiError } from '../api/http';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import type { AttachedFile } from '../components/ChatComposer';
import type { Notice } from './useDocxUpload';
import type { CanvasSnapshot } from '../editor/types.js';
import type { EventLogger } from '../events/logger';
import { docsInThread, mergeChanges } from '../state/canvasState';
import type { MainView } from './WorkspaceScreen';

type Open = { threadId: string; docId: string } | null;

export interface ThreadActionsDeps {
  api: SessionApi;
  logger: EventLogger;
  getEnvelope: () => Envelope;
  open: Open;
  openRef: MutableRefObject<Open>;
  snap: CanvasSnapshot | null;
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  setView: Dispatch<SetStateAction<MainView>>;
  setNotice: Dispatch<SetStateAction<Notice>>;
  openDoc: (threadId: string, docId: string, opts?: { log?: boolean }) => void;
  /** The doc last open in each thread. */
  lastDocOf: MutableRefObject<Map<string, string>>;
  /** The chat's send function. */
  sendChat: MutableRefObject<((text: string, anchor?: CommentAnchor, attached?: AttachedFile[]) => void) | null>;
}

export function useThreadActions({ api, logger, getEnvelope, open, openRef, snap, setSnap, setThreads, setView, setNotice, openDoc, lastDocOf, sendChat }: ThreadActionsDeps) {
  const [creatingThread, setCreatingThread] = useState(false);
  /** A chat started from a project's page, and its first message, sent once its pane is up. */
  const [firstMessage, setFirstMessage] = useState<{ threadId: string; text: string; attached: AttachedFile[] } | null>(null);
  /**
   * The chat a project page's box will start: made when the first file is added (a file belongs
   * to a chat) or on send, and shown in the lists only once the message is sent.
   */
  const draftChats = useRef(new Map<string, Promise<{ thread: Thread; doc: Doc }>>());

  const renameThread = useCallback(
    (title: string) => {
      const threadId = open?.threadId;
      if (!threadId) return;
      setThreads((ts) => ts.map((t) => (t.id === threadId ? { ...t, title } : t)));
      void api
        .renameThread(threadId, title, getEnvelope())
        .then((thread) => setThreads((ts) => ts.map((t) => (t.id === thread.id ? thread : t))))
        .catch((err: unknown) => logger.log('error', { source: 'client', message: `rename chat failed: ${err instanceof Error ? err.message : String(err)}` }));
    },
    [open, api, getEnvelope, logger, setThreads],
  );

  /** The wand: the model names the open chat. */
  const [naming, setNaming] = useState(false);
  const nameThread = useCallback(async () => {
    const threadId = open?.threadId;
    if (!threadId || !api.nameThread) return;
    setNaming(true);
    try {
      const thread = await api.nameThread(threadId, getEnvelope());
      setThreads((ts) => ts.map((t) => (t.id === thread.id ? thread : t)));
    } catch (err) {
      const empty = err instanceof ApiError && err.status === 409;
      setNotice({ text: empty ? 'Send a message first; then the chat can be named from it.' : 'The chat could not be named. Please try again.', error: !empty });
      if (!empty) logger.log('error', { source: 'client', message: `name chat failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setNaming(false);
    }
  }, [open, api, getEnvelope, logger, setThreads, setNotice]);

  const newThread = useCallback(
    async (place?: ThreadPlace) => {
      setCreatingThread(true);
      try {
        const { thread, doc } = await api.createThread(getEnvelope(), place);
        setThreads((ts) => [...ts, thread]);
        setSnap((s) => (s ? mergeChanges(s, { docs: [doc] }) : s));
        openDoc(thread.id, doc.id, { log: false });
      } catch (err) {
        logger.log('error', { source: 'client', message: `new chat failed: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        setCreatingThread(false);
      }
    },
    [api, getEnvelope, logger, openDoc, setThreads, setSnap],
  );

  const selectThread = useCallback(
    (threadId: string) => {
      if (!snap) return;
      const docs = docsInThread(snap, threadId);
      const docId = lastDocOf.current.get(threadId) ?? docs[0]?.id;
      if (docId) openDoc(threadId, docId);
      // Already open (behind a project's page): just go back to it.
      if (docId && openRef.current?.threadId === threadId) setView({ kind: 'editor' });
    },
    [snap, openDoc, lastDocOf, openRef, setView],
  );

  /** `place`: a project's id, or a project, class or year group. */
  const draftChat = useCallback(
    (place: string | ThreadPlace) => {
      const key = placeKey(place);
      let made = draftChats.current.get(key);
      if (!made) {
        made = api.createThread(getEnvelope(), place);
        draftChats.current.set(key, made);
        // A failed attempt is not kept: the next file or send tries again.
        made.catch(() => draftChats.current.delete(key));
      }
      return made;
    },
    [api, getEnvelope],
  );

  const startProjectChat = useCallback(
    async (place: string | ThreadPlace, text: string, attached: AttachedFile[]) => {
      const { thread, doc } = await draftChat(place);
      draftChats.current.delete(placeKey(place));
      setThreads((ts) => (ts.some((t) => t.id === thread.id) ? ts : [...ts, thread]));
      setSnap((s) => (s ? mergeChanges(s, { docs: [doc] }) : s));
      setFirstMessage({ threadId: thread.id, text, attached });
      openDoc(thread.id, doc.id, { log: false });
    },
    [draftChat, openDoc, setThreads, setSnap],
  );

  const addProjectChatFile = useCallback(
    async (place: string | ThreadPlace, file: File): Promise<AttachedFile> => {
      if (!api.addChatFile) throw new Error('files are not available');
      const { thread } = await draftChat(place);
      const r = await api.addChatFile(thread.id, file, getEnvelope());
      return { id: r.id, name: r.name };
    },
    [api, draftChat, getEnvelope],
  );

  // The first message of a chat started on a project's page goes once the chat's pane is up.
  useEffect(() => {
    if (!firstMessage || open?.threadId !== firstMessage.threadId || !sendChat.current) return;
    sendChat.current(firstMessage.text, undefined, firstMessage.attached);
    setFirstMessage(null);
  }, [firstMessage, open, sendChat]);

  return { creatingThread, naming, renameThread, nameThread, newThread, selectThread, startProjectChat, addProjectChatFile };
}

const placeKey = (place: string | ThreadPlace) => (typeof place === 'string' ? place : JSON.stringify(place));
