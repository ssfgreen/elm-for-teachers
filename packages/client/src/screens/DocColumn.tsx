/**
 * The workspace's document column: the doc's header (name, new, copy, export, upload, Accept
 * all), the Word preview, the editor, and beside it the comments column.
 * Holds only whether the preview is showing; the rest belongs to WorkspaceScreen.
 */
import { useState, type Dispatch, type MutableRefObject, type ReactNode, type RefObject, type SetStateAction } from 'react';
import type { Doc } from '@edw/shared';
import { CommentsPanel, type CommentsPanelProps } from '../components/CommentsPanel';
import { DocHeader } from '../components/DocHeader';
import { WordPreview } from '../components/WordPreview';
import { Splitter } from '../components/Splitter';
import { Drawer } from '../components/Drawer';
import { MakeSlot } from '../components/slots/slots';
import { Canvas } from '../editor/Canvas.js';
import type { CanvasProps, CanvasSnapshot } from '../editor/types.js';
import type { EventLogger } from '../events/logger';
import { attachPreviewScrollTracking } from '../events/trackers';
import type { ExportFormat } from '../state/exportDoc';
import { cn } from '../lib/utils';
import type { Notice } from './useDocxUpload';
import type { useDocComments } from './useDocComments';
import type { useSuggestions } from './useSuggestions';
import type { useDecisions } from './useDecisions';
import type { useWorkspaceLayout } from './useWorkspaceLayout';

export interface DocColumnProps {
  canvasRef: RefObject<HTMLElement>;
  layout: ReturnType<typeof useWorkspaceLayout>;
  inEditor: boolean;
  /** The sidebar's opener, when the sidebar is closed. */
  opener: ReactNode;
  doc: Doc | undefined;
  snap: CanvasSnapshot | null;
  /** The snapshot with the streaming reply's edits, or null. */
  preview: CanvasSnapshot | null;
  epoch: number;
  loadError: boolean;
  logger: EventLogger;
  /** How often a scroll is logged at most, from the session's config. */
  scrollMs: number;
  renameDoc: (name: string) => void;
  newDoc: () => Promise<void>;
  duplicateDoc: () => Promise<void>;
  exportDoc: (format: ExportFormat) => Promise<void>;
  previewFile: () => Promise<Blob>;
  uploadDocx: (file: File) => Promise<void>;
  notice: Notice;
  setNotice: Dispatch<SetStateAction<Notice>>;
  proposals: boolean;
  onDecision: ReturnType<typeof useDecisions>;
  comments: ReturnType<typeof useDocComments>;
  suggestions: ReturnType<typeof useSuggestions>;
  showComments: boolean;
  setCommentsColumn: (open: boolean) => void;
  styleSuggestion: CommentsPanelProps['styleSuggestion'];
  decideStyle: CommentsPanelProps['onStyleDecision'];
  teacherName: string;
  structural: CanvasProps['structural'];
  onLocalEdit: CanvasProps['onLocalEdit'];
  onSyncError: (err: unknown) => void;
  uploadImage: CanvasProps['uploadImage'];
  resolveAssetUrl: CanvasProps['resolveAssetUrl'];
  setDocStyle: CanvasProps['onDocStyle'];
  setComment: NonNullable<CanvasProps['onAskModel']>;
  sendChat: MutableRefObject<((text: string, anchor?: Parameters<NonNullable<CanvasProps['onSendComment']>>[0]) => void) | null>;
  flushEditor: NonNullable<CanvasProps['flushRef']>;
}

export function DocColumn(props: DocColumnProps) {
  const { canvasRef, layout, inEditor, opener, doc, snap, preview, epoch, loadError, logger, scrollMs, renameDoc, newDoc, duplicateDoc, exportDoc, previewFile, uploadDocx, notice, setNotice, proposals, onDecision } = props;
  const { comments, suggestions, showComments, setCommentsColumn, styleSuggestion, decideStyle, teacherName, structural, onLocalEdit, onSyncError, uploadImage, resolveAssetUrl, setDocStyle, setComment, sendChat, flushEditor } = props;
  const [previewing, setPreviewing] = useState(false);

  return (
    /* `doc-panel` is a hook (canvas.css and the editor's frame look for it). It grows into the
        room left, from a base of about 22rem for the document plus the comments column. */
    <section
      className={cn(
        'doc-panel',
        'flex min-h-0 min-w-0 grow flex-col overflow-hidden bg-card max-split:order-1 max-split:basis-0',
        showComments ? 'basis-163' : 'basis-88',
      )}
      ref={canvasRef}
      data-pane="canvas"
      aria-label="Document"
      hidden={!inEditor}
    >
      <header className={cn('doc-head', 'flex-none border-b border-border px-3', layout.stacked && opener && 'pl-2')}>
        {layout.stacked && !(doc && snap) && opener}
        {doc && snap && (
          <DocHeader
            lead={layout.stacked && opener}
            doc={doc}
            onRename={renameDoc}
            onNew={() => void newDoc()}
            onDuplicate={() => void duplicateDoc().catch((err: unknown) => onSyncError(err))}
            onExport={(format) =>
              void exportDoc(format).catch((err: unknown) => {
                logger.log('error', { source: 'client', message: `export failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) });
                setNotice({ text: 'The download did not work. Please try again.', error: true });
              })
            }
            onPreview={() => setPreviewing(true)}
            onUpload={(file) => void uploadDocx(file)}
            notice={notice}
            proposals={proposals}
            onAcceptAll={() => onDecision({ decision: 'accept', block_id: null, doc_id: doc.id, mode: 'accept_all' })}
            onRejectAll={() => onDecision({ decision: 'reject', block_id: null, doc_id: doc.id, mode: 'reject_all' })}
            comments={{ count: comments.openThreads.length, suggestions: suggestions.items.length, open: showComments, onToggle: () => setCommentsColumn(!showComments) }}
          />
        )}
      </header>
      {previewing && doc && (
        <WordPreview
          key={doc.id}
          name={doc.name}
          load={previewFile}
          onClose={() => setPreviewing(false)}
          onShown={(pages) => logger.log('doc_preview', { doc_id: doc.id, pages })}
          trackScroll={(body) => attachPreviewScrollTracking(logger, doc.id, body, scrollMs)}
          onDownload={() =>
            void exportDoc('docx').catch((err: unknown) => {
              logger.log('error', { source: 'client', message: `export failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) });
              setNotice({ text: 'The download did not work. Please try again.', error: true });
            })
          }
        />
      )}
      {loadError && <p className="error-text m-4">The document could not be loaded. Please reload the page.</p>}
      {/* Only mount the editor once the snapshot is in: it fills an empty doc with a first block. */}
      {/* The document and, beside it, its comments column (a drawer over it in a narrow window). */}
      <div className="flex min-h-0 flex-auto">
      {snap && doc && (
        <Canvas
          key={epoch}
          docId={doc.id}
          blocks={(preview ?? snap).blocks}
          readOnly={false}
          busy={preview !== null}
          logger={logger}
          structural={structural}
          onLocalEdit={onLocalEdit}
          onSyncError={onSyncError}
          uploadImage={uploadImage}
          resolveAssetUrl={resolveAssetUrl}
          docStyle={doc.style}
          onDocStyle={setDocStyle}
          onAskModel={setComment}
          onSendComment={(a, text) => sendChat.current?.(text, a)}
          comments={comments.marks}
          activeComment={comments.active}
          onComment={comments.start}
          onCommentSelect={(id) => {
            suggestions.clear();
            comments.setActive(id);
            setCommentsColumn(true);
          }}
          flushRef={flushEditor}
        />
      )}
      {doc && showComments && layout.docked && <Splitter label="Resize the comments" side="after" width={layout.comments.width} min={layout.comments.min} max={layout.comments.max} onResize={layout.comments.setWidth} />}
      {doc && (
        <Drawer docked={layout.docked} open={showComments} side="right" width={layout.comments.width} label="Comments" onClose={() => setCommentsColumn(false)}>
        {showComments && <CommentsPanel
          width={layout.comments.width}
          threads={comments.threads}
          draft={comments.draft}
          active={comments.active}
          working={comments.working}
          onSelect={(id) => {
            suggestions.clear();
            comments.select(id);
          }}
          onCreate={comments.create}
          onCancelDraft={() => comments.setDraft(null)}
          onReply={comments.reply}
          onDelete={comments.remove}
          onEdit={comments.edit}
          onResolve={comments.resolve}
          teacherName={teacherName}
          styleSuggestion={styleSuggestion}
          suggestions={{ items: suggestions.items, active: suggestions.active, positionOf: comments.positionOf, onSelect: suggestions.select, onDecide: suggestions.decide }}
          onStyleDecision={decideStyle}
          onClose={() => setCommentsColumn(false)}
        />}
        </Drawer>
      )}
      </div>
      <MakeSlot zone="bottom" />
    </section>
  );
}
