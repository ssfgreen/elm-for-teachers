/**
 * What the teacher does to a doc from the workspace: new, duplicate, delete, rename, export
 * (one file, or the whole workspace as a zip) and the Word preview's file.
 *
 * Holds `flushEditor` (the editor's unsent typing, sent first so a copy or a file matches the
 * screen) and `snapRef` (the snapshot as of the last render, for work that awaits).
 */
import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Doc, Thread } from '@edw/shared';
import { newUlid } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { SessionInfo } from '../api/types';
import type { CanvasSnapshot } from '../editor/types.js';
import type { EventLogger } from '../events/logger';
import { docsInThread, UNTITLED, withoutDoc } from '../state/canvasState';
import { exportFile, type ExportFormat } from '../state/exportDoc';
import { fileName, saveBlob } from '../download';
import { useSaveBeforeSignOut } from '../components/sidebar/accountContext';
import type { useCanvasWrites } from './useCanvasWrites';

export const NEW_DOC_NAME = UNTITLED;

type Open = { threadId: string; docId: string } | null;

export interface DocActionsDeps {
  session: SessionInfo;
  api: SessionApi;
  logger: EventLogger;
  open: Open;
  openRef: MutableRefObject<Open>;
  snap: CanvasSnapshot | null;
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  threads: Thread[];
  structural: ReturnType<typeof useCanvasWrites>['structural'];
  openDoc: (threadId: string, docId: string, opts?: { log?: boolean }) => void;
  /** The doc last open in each thread. */
  lastDocOf: MutableRefObject<Map<string, string>>;
  onSyncError: (err: unknown) => void;
  /** Before a Word download: false when the teacher, told the docs use a font Word lacks, cancels. */
  confirmFonts?: (snap: CanvasSnapshot, docIds: readonly string[]) => Promise<boolean>;
}

export function useDocActions({ session, api, logger, open, openRef, snap, setSnap, threads, structural, openDoc, lastDocOf, onSyncError, confirmFonts }: DocActionsDeps) {
  const newDoc = useCallback(async () => {
    if (!open) return;
    const res = await structural({ command: 'doc_create', thread_id: open.threadId, name: NEW_DOC_NAME, id: newUlid() });
    if (res.doc) openDoc(res.doc.thread_id, res.doc.id);
  }, [open, structural, openDoc]);

  /** Sends the editor's unsent typing first, so the copy has everything on screen. */
  const flushEditor = useRef<(() => Promise<void>) | null>(null);
  // "Sign out" in a signed-in workspace waits for this (the logger too: no editor may be open).
  useSaveBeforeSignOut(async () => {
    await flushEditor.current?.();
    await logger.flush();
  });
  const duplicateDoc = useCallback(async () => {
    const source = open && snap?.docs.find((d) => d.id === open.docId);
    if (!source) return;
    await flushEditor.current?.();
    const name = `${source.name} (copy)`.slice(0, 200);
    const res = await structural({ command: 'doc_duplicate', doc_id: source.id, name, id: newUlid() });
    if (res.doc) openDoc(res.doc.thread_id, res.doc.id);
  }, [open, snap, structural, openDoc]);

  const snapRef = useRef(snap);
  snapRef.current = snap;

  /**
   * Deletes a doc (the server keeps it, marked, for the study). If it was open, the chat's
   * newest other doc opens; with none left, a blank one is made in its place.
   */
  const deleteDoc = useCallback(
    async (threadId: string, docId: string) => {
      const wasOpen = openRef.current?.docId === docId;
      if (wasOpen) await flushEditor.current?.();
      await structural({ command: 'doc_delete', doc_id: docId });
      const rest = snapRef.current ? docsInThread(snapRef.current, threadId).filter((d) => d.id !== docId) : [];
      setSnap((s) => (s ? withoutDoc(s, docId) : s));
      if (lastDocOf.current.get(threadId) === docId) lastDocOf.current.delete(threadId);
      if (!wasOpen) return;
      const next = rest[rest.length - 1];
      if (next) {
        openDoc(threadId, next.id);
        return;
      }
      const res = await structural({ command: 'doc_create', thread_id: threadId, name: NEW_DOC_NAME, id: newUlid() });
      if (res.doc) openDoc(res.doc.thread_id, res.doc.id);
    },
    [structural, openDoc, openRef, setSnap, lastDocOf],
  );
  /** The open doc as it is on screen: unsaved typing is saved first, so a file matches the screen. */
  const currentDoc = useCallback(async () => {
    if (!open) return null;
    await flushEditor.current?.();
    // Let React apply the flushed edits, then read the snapshot.
    await new Promise((r) => setTimeout(r, 0));
    const s = snapRef.current;
    const source = s?.docs.find((d) => d.id === open.docId);
    return s && source ? { s, source } : null;
  }, [open]);
  /** The open doc's Word file, as Download saves it and the preview shows it. */
  const wordFile = useCallback(async (cur: { s: CanvasSnapshot; source: Doc } | null) => {
    if (!cur) return null;
    const { docToWord, loadImageForWord, wordBlob } = await import('../export/docx');
    const word = await docToWord(cur.s, cur.source, { loadImage: (src) => loadImageForWord(api.assetUrl(src)) });
    return { blob: await wordBlob(word), source: cur.source };
  }, [api]);
  const previewFile = useCallback(async () => {
    const file = await wordFile(await currentDoc());
    if (!file) throw new Error('no doc open');
    return file.blob;
  }, [currentDoc, wordFile]);

  const exportDoc = useCallback(
    async (format: ExportFormat) => {
      if (format === 'docx') {
        const cur = await currentDoc();
        if (!cur || (confirmFonts && !(await confirmFonts(cur.s, [cur.source.id])))) return;
        const file = await wordFile(cur);
        if (!file) return;
        saveBlob(file.blob, `${fileName(file.source.name)}.docx`);
        logger.log('doc_export', { doc_id: file.source.id, format });
        return;
      }
      const cur = await currentDoc();
      if (!cur) return;
      const file = exportFile(cur.s, cur.source, format);
      saveBlob(new Blob([file.text], { type: file.mime }), `${fileName(cur.source.name)}.${file.ext}`);
      logger.log('doc_export', { doc_id: cur.source.id, format });
    },
    [currentDoc, wordFile, logger, confirmFonts],
  );

  /**
   * The teacher's copy of the workspace: documents/ (Word) and chats/ (plain text), made here
   * from what is on screen. Unsaved typing is saved first, so the files match the screen.
   */
  const downloadData = useCallback(async () => {
    await flushEditor.current?.();
    await new Promise((r) => setTimeout(r, 0));
    const s = snapRef.current;
    if (!s) return;
    if (confirmFonts && !(await confirmFonts(s, s.docs.map((d) => d.id)))) return;
    const chats = new Map(await Promise.all(threads.map(async (t) => [t.id, await api.getChat(t.id)] as const)));
    const [{ docToWord, loadImageForWord, wordBlob }, { workspaceZip }] = await Promise.all([import('../export/docx'), import('../export/workspaceZip')]);
    const blob = await workspaceZip({
      snap: s,
      threads,
      chats,
      wordFor: async (d) => wordBlob(await docToWord(s, d, { loadImage: (src) => loadImageForWord(api.assetUrl(src)) })),
    });
    saveBlob(blob, `${fileName(session.label.trim() || 'Workspace')}.zip`);
  }, [api, threads, session.label, confirmFonts]);

  const renameDoc = useCallback(
    (name: string) => {
      if (open) void structural({ command: 'doc_rename', doc_id: open.docId, name }).catch((err: unknown) => onSyncError(err));
    },
    [open, structural, onSyncError],
  );

  return { flushEditor, snapRef, newDoc, duplicateDoc, deleteDoc, previewFile, exportDoc, downloadData, renameDoc };
}
