import { useRef, type ReactNode } from 'react';
import { Copy, Eye, MessageSquare, Plus, Send, Upload } from 'lucide-react';
import type { Doc } from '@edw/shared';
import { IconButton } from '../editor/Toolbar.js';
import type { ExportFormat } from '../state/exportDoc';
import { EditableTitle } from './EditableTitle';
import { ExportMenu } from './ExportMenu';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { MakeSlot, useInMakeKit } from './slots/slots';

export interface DocHeaderProps {
  doc: Doc;
  onRename: (name: string) => void;
  onNew: () => void;
  /** A copy of this doc, in the same chat. */
  onDuplicate: () => void;
  /** Download this doc as a file. */
  onExport: (format: ExportFormat) => void;
  /** Show this doc as its Word file, in pages. */
  onPreview?: () => void;
  /** Export a frozen one-way Content Pack v1 link for Elm for Students. */
  onSendToStudents?: () => void;
  /** A Word file chosen with "Upload .docx": it becomes a new doc in this chat. */
  onUpload: (file: File) => void;
  /** A line under the title: an import in progress, or what went wrong. */
  notice?: { text: string; error?: boolean } | null;
  /** Accept all / Reject all, shown while the doc has suggestions. */
  proposals: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  /** The comments column: how many threads and suggestions, whether it is showing, and its toggle. */
  comments?: { count: number; suggestions?: number; open: boolean; onToggle: () => void };
  /** Before the title, on its line: the sidebar's opener when the sidebar is closed. */
  lead?: ReactNode;
}

const NAME_MAX = 200;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const badgeLabel = (threads: number, suggestions: number) =>
  [threads && plural(threads, 'comment thread'), suggestions && plural(suggestions, 'suggestion')].filter(Boolean).join(' and ');

/** The document's name (double-click to rename), a new blank doc, a copy of this one, downloads and Word uploads. */
export function DocHeader({ doc, onRename, onNew, onDuplicate, onExport, onPreview, onSendToStudents, onUpload, notice, proposals, onAcceptAll, onRejectAll, comments, lead }: DocHeaderProps) {
  const inKit = useInMakeKit();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
    {/* On the make kit's board cards can be added beside the buttons, so they may go onto a second line.
        Below `split` (a phone), Accept all and Reject all go onto a line of their own under the title. */}
    <div className={cn('flex min-h-12 items-center gap-x-3 max-split:flex-wrap', inKit && 'flex-wrap gap-y-1 py-1')}>
      <div className={cn('flex min-w-0 flex-1 items-center gap-1', inKit && 'min-w-32')}>
        {lead}
        <EditableTitle
          itemKey={doc.id}
          value={doc.name}
          onRename={onRename}
          as="h1"
          className="doc-title m-0 min-w-0 truncate pl-1 text-base font-semibold"
          inputClassName="min-w-0 basis-96 rounded-sm border border-primary px-1.5 py-0.75 text-base font-semibold outline-2 outline-ring"
          inputLabel="Document name"
          maxLength={NAME_MAX}
        />
      </div>
      <MakeSlot zone="header" />
      {proposals && (
        <div className="proposal-toolbar flex gap-2 max-split:order-last max-split:basis-full max-split:pb-2" role="toolbar" aria-label="Suggestions">
          <Button size="sm" className="accept-all px-2.75 py-1.25 text-md" onClick={onAcceptAll}>
            Accept all
          </Button>
          <Button size="sm" className="reject-all px-2.75 py-1.25 text-md" onClick={onRejectAll}>
            Reject all
          </Button>
        </div>
      )}
      <div className={cn('flex items-center gap-1', inKit && 'flex-wrap justify-end')}>
        {comments && (
          <span className="relative inline-flex">
            <IconButton icon={MessageSquare} label={comments.open ? 'Hide comments' : 'Show comments'} tipAlign="end" active={comments.open} onClick={comments.onToggle} />
            {comments.count + (comments.suggestions ?? 0) > 0 && (
              <span
                className="pointer-events-none absolute top-px right-0 h-3.75 min-w-3.75 rounded-md bg-primary px-0.75 text-center text-2xs leading-3.75 text-primary-foreground"
                aria-label={badgeLabel(comments.count, comments.suggestions ?? 0)}>
                {comments.count + (comments.suggestions ?? 0)}
              </span>
            )}
          </span>
        )}
        <IconButton icon={Plus} label="Create new" tipAlign="end" onClick={onNew} />
        <IconButton icon={Copy} label="Duplicate" tipAlign="end" onClick={onDuplicate} />
        {onPreview && <IconButton icon={Eye} label="Preview in Word" tipAlign="end" onClick={onPreview} />}
        {onSendToStudents && <IconButton icon={Send} label="Send to Elm for Students" tipAlign="end" onClick={onSendToStudents} />}
        <ExportMenu onExport={onExport} />
        <IconButton icon={Upload} label="Upload .docx" tipAlign="end" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          aria-label="Word document to upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
      </div>
    </div>
    {notice && (
      <p className={cn('doc-notice', 'mt-0 mr-0 mb-2 ml-1 text-md', notice.error ? 'error-text' : 'text-foreground-2')} role={notice.error ? 'alert' : 'status'}>
        {notice.text}
      </p>
    )}
    </>
  );
}
