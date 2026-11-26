/**
 * The chat box, used in a chat and on a project's page ("Start a chat in this project"), so
 * both have the same "+" with file tiles, model picker, @model passage, Stop,
 * paste logging and keystroke batching.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';
import type { CommentAnchor } from '@edw/shared';
import { ArrowUp, Square } from 'lucide-react';
import type { EventLogger } from '../events/logger';
import type { ClipboardMarker } from '../events/trackers';
import { logPaste } from '../events/trackers';
import { ComposerBar, type ComposerBarProps } from './ComposerBar';
import { autoGrow } from './autoGrow';
import { createChatBatcher } from './chatBatch';
import { fileError, fileKind } from './files';
import { Button } from './ui/button';
import { FileTile, fileTilesClass } from './ui/file-tile';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';

/** A file added with "+" while the message is written: being read, ready to send, or refused. */
interface PendingFile {
  key: string;
  name: string;
  status: 'reading' | 'ready' | 'error';
  id?: string;
  error?: string;
}

export interface AttachedFile {
  id: string;
  name: string;
}

export interface ChatComposerProps {
  logger: Pick<EventLogger, 'log'>;
  batchMs?: number;
  getClipboard?: () => ClipboardMarker | null;
  /** Reads a file added with "+" and adds it as context for the model; throws with a reason. Without it there is no "+". */
  addFile?: (file: File) => Promise<AttachedFile>;
  /** The tile's cross on a file that was added. */
  removeFile?: (id: string) => void;
  /** Sends the message; `restore` puts the text and files back if it failed. */
  onSend: (text: string, attached: AttachedFile[], restore: () => void) => void | Promise<void>;
  /** A reply is being written: Send is off (or queues, with `queues`), and Stop shows while nothing is typed if `onStop` is given. */
  sending?: boolean;
  /** While a reply is written, a message can still be sent: it waits for the reply. */
  queues?: boolean;
  onStop?: () => void;
  /** A passage picked in the document; the message is sent about it. */
  anchor?: CommentAnchor | null;
  onClearAnchor?: () => void;
  bar?: Omit<ComposerBarProps, 'disabled' | 'onAddFiles'>;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  /** Pinned to the foot of the chat column, over the transcript (the default). Off on the
      project page, where the box sits in the page's flow. */
  docked?: boolean;
  /** Shown just above the box, inside the docked strip (the pictures to pick from). */
  above?: ReactNode;
  /** The session replay: this text in the box, read-only. */
  shown?: string;
}

/** Under every chat box: the model can be wrong, and pupils must not be identifiable (Sam, 10 Nov 2026). */
export const COMPOSER_NOTE = 'AI makes mistakes. Don’t enter personal data.';

const QUOTE_MAX = 90;
export function shortQuote(q: string): string {
  const one = q.replace(/\s+/g, ' ').trim();
  return one.length > QUOTE_MAX ? `${one.slice(0, QUOTE_MAX - 1)}…` : one;
}

let localKey = 0;
const nextKey = () => `file-${(localKey += 1)}`;

export function ChatComposer({
  logger,
  batchMs = 500,
  getClipboard,
  addFile,
  removeFile: onRemoveFile,
  onSend,
  sending = false,
  queues = false,
  onStop,
  anchor = null,
  onClearAnchor,
  bar,
  placeholder = 'Ask the assistant…',
  label = 'Message',
  autoFocus,
  docked = true,
  above,
  shown,
}: ChatComposerProps) {
  const [own, setText] = useState('');
  const text = shown ?? own;
  const [files, setFiles] = useState<PendingFile[]>([]);
  const reading = files.some((f) => f.status === 'reading');
  const batcher = useMemo(() => createChatBatcher(logger, batchMs), [logger, batchMs]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // One line to start; grows with the message up to about ten lines, then scrolls.
  useEffect(() => autoGrow(inputRef.current, 240), [text]);
  // Picking a passage in the document brings the teacher straight to the composer.
  useEffect(() => {
    if (anchor || autoFocus) inputRef.current?.focus();
  }, [anchor, autoFocus]);
  useEffect(() => () => batcher.flush(), [batcher]);

  /** "+": each file is read in the browser and added straight away; its tile shows how it went. */
  function addFiles(list: File[]) {
    if (!addFile) return;
    for (const file of list) {
      const key = nextKey();
      setFiles((fs) => [...fs, { key, name: file.name, status: 'reading' }]);
      addFile(file).then(
        (ref) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: 'ready', id: ref.id, name: ref.name } : f))),
        (err: unknown) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: 'error', error: fileError(err, file.name) } : f))),
      );
    }
  }

  /** The tile's cross: a file that was added is deleted again (kept, marked, for the record). */
  function removeFile(f: PendingFile) {
    setFiles((fs) => fs.filter((x) => x.key !== f.key));
    if (f.id) onRemoveFile?.(f.id);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const prompt = text.trim();
    if (!prompt || (sending && !queues) || reading) return;
    batcher.flush();
    setText('');
    onClearAnchor?.();
    const kept = files;
    const attached = files.filter((f) => f.status === 'ready' && f.id).map((f) => ({ id: f.id!, name: f.name }));
    setFiles([]);
    await onSend(prompt, attached, () => {
      setText(prompt);
      setFiles(kept);
    });
  }

  // Enter sends; Shift+Enter is a new line. Not while an IME is composing (accented or CJK input).
  // Escape stops a reply being written.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape' && sending && onStop) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send();
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData?.getData('text/plain') ?? '';
    const marker = getClipboard?.() ?? null;
    const source = marker ? marker.classify(pasted, pasted.length) : pasted ? 'external' : null;
    if (source) logPaste(logger, { kind: 'chat' }, pasted.length, source);
  }

  return (
    // Docked, the strip behind the box is the chat column's colour, so it shows no band.
    <form className={docked ? 'sticky bottom-0 bg-background pt-2 pb-3' : 'pt-1'} onSubmit={send}>
      {above}
      <div className="rounded-lg border border-border-strong bg-composer shadow-float transition-colors duration-100 focus-within:border-primary">
        {anchor && (
          <div
            className="mx-3.75 mt-2.5 flex items-center gap-2 rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-foreground-2"
            role="note"
            aria-label="About"
          >
            <span className="font-mono text-xs font-semibold text-primary">@model</span>
            <span className="flex-1 truncate italic">{anchor.quote ? `“${shortQuote(anchor.quote)}”` : 'this block'}</span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent px-0.75 py-0 text-lg leading-none text-muted-foreground hover:text-foreground"
              aria-label="Remove the reference"
              onClick={() => onClearAnchor?.()}
            >
              ×
            </button>
          </div>
        )}
        {files.length > 0 && (
          <ul className={cn(fileTilesClass, 'px-3 pt-3 pb-1')} aria-label="Files for this message">
            {files.map((f) => (
              <FileTile
                key={f.key}
                name={f.name}
                title={f.error ?? f.name}
                error={f.status === 'error' ? (f.error ?? '') : undefined}
                reading={f.status === 'reading'}
                badge={f.status === 'reading' ? 'Reading…' : fileKind(f.name)}
                removeDisabled={f.status === 'reading'}
                onRemove={() => removeFile(f)}
              />
            ))}
          </ul>
        )}
        <Textarea
          className="block resize-none overflow-y-hidden border-0 bg-transparent px-3.75 pt-3.25 pb-1.25 text-base focus-visible:ring-0"
          ref={inputRef}
          aria-label={label}
          placeholder={anchor ? 'What should change here?' : placeholder}
          value={text}
          readOnly={shown !== undefined}
          rows={1}
          onChange={(e) => {
            batcher.change(text, e.target.value);
            setText(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <div className="flex items-center justify-end gap-2 pt-1.5 pr-2 pb-2 pl-3.75">
          {/* One round button: Send, or Stop while a reply is written and nothing is typed. Typing
              brings Send back; sent then, the message waits for the reply (with `queues`). */}
          {sending && onStop && text.trim() === '' ? (
            <Button variant="stop" size="icon" className="rounded-full" onClick={onStop} aria-label="Stop" title="Stop the reply (Esc)">
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="icon"
              className="rounded-full disabled:opacity-100"
              disabled={(sending && !queues) || reading || text.trim() === ''}
              aria-label="Send"
              title={reading ? 'Wait for the files to be read' : sending && queues ? 'Send when this reply has finished' : 'Send (Enter)'}
            >
              <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <ComposerBar {...bar} onAddFiles={addFile ? addFiles : undefined} disabled={sending} />
      <p className="mx-2 mt-1.5 mb-0 text-center text-xs text-muted-foreground">{COMPOSER_NOTE}</p>
    </form>
  );
}
