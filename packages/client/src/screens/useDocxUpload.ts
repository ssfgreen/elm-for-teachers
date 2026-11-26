import { useCallback } from 'react';
import { newUlid } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import type { CanvasSnapshot, StructuralCommand, StructuralResponse } from '../editor/types.js';
import type { EventLogger } from '../events/logger';
import { isBlankUntitled } from '../state/canvasState';

export type Notice = { text: string; error?: boolean } | null;

export interface DocxUploadDeps {
  open: { threadId: string; docId: string } | null;
  api: Pick<SessionApi, 'uploadAsset'>;
  getEnvelope: () => Envelope;
  structural: (cmd: StructuralCommand) => Promise<StructuralResponse>;
  openDoc: (threadId: string, docId: string) => void;
  logger: Pick<EventLogger, 'log'>;
  setNotice: (n: Notice) => void;
  /** The canvas as it is now (read after the import, which takes a while). */
  getSnap: () => CanvasSnapshot | null;
  deleteDoc: (threadId: string, docId: string) => Promise<void>;
}

/**
 * "Upload .docx": a Word file becomes a new doc in the open chat (not context for the model; that
 * comes later). If the open doc is a blank, untouched Untitled one, the upload takes its place:
 * that doc is deleted (kept, marked, for the study) once the import has worked.
 */
export function useDocxUpload({ open, api, getEnvelope, structural, openDoc, logger, setNotice, getSnap, deleteDoc }: DocxUploadDeps) {
  return useCallback(
    async (file: File) => {
      if (!open) return;
      if (!/\.docx$/i.test(file.name)) {
        setNotice({ text: `${file.name} is not a Word .docx file.`, error: true });
        return;
      }
      setNotice({ text: `Importing ${file.name}…` });
      try {
        const { docxToBlocks, docNameFromFile, fileBytes, MAX_DOCX_BYTES } = await import('../import/docx');
        if (file.size > MAX_DOCX_BYTES) throw new Error('too large');
        const { blocks, warnings } = await docxToBlocks(await fileBytes(file), { uploadImage: (img) => api.uploadAsset(img, getEnvelope()) });
        if (warnings.length) console.warn('docx import', warnings);
        const res = await structural({
          command: 'doc_import',
          thread_id: open.threadId,
          name: docNameFromFile(file.name),
          id: newUlid(),
          blocks,
          source: { kind: 'docx', filename: file.name, bytes: file.size },
        });
        if (res.doc) openDoc(res.doc.thread_id, res.doc.id);
        setNotice(null);
        // Checked now, not at the click: the teacher may have typed in it while the file was read.
        const snap = getSnap();
        if (res.doc && snap && isBlankUntitled(snap, open.docId)) {
          await deleteDoc(open.threadId, open.docId).catch((err: unknown) =>
            logger.log('error', { source: 'client', message: `blank doc not replaced: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) }),
          );
        }
      } catch (err) {
        logger.log('error', { source: 'client', message: `docx import failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) });
        setNotice({ text: `${file.name} could not be imported. Is it a Word document under 15 MB?`, error: true });
      }
    },
    [open, api, getEnvelope, structural, openDoc, logger, setNotice, getSnap, deleteDoc],
  );
}
