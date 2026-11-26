/**
 * The comments column beside the document, as in a word processor: one card per thread in
 * reading order (by the block it is on), each with its comments and a reply box. Each comment's
 * "…" menu offers Edit and Delete (the teacher's own comments only: the assistant's can't be
 * changed) and, on a thread's first comment, Resolve, which also has a tick of its own beside the "…". Resolved threads fold away under
 * "Resolved" at the foot, where they can be reopened. A new thread starts as a draft card at the top. Each comment box has a "Send to model" box, ticked
 * to start with: a comment sent with it ticked asks the assistant to answer in the thread (while
 * it works the card says what it is doing); untick it to comment without asking. Typing "@"
 * offers @model, as in the editor, and choosing it ticks the box again.
 *
 * The assistant's suggestions are cards here too (comments/SuggestionCard.tsx), placed among the
 * threads by where their block is, each with Accept and Reject.
 *
 * While a thread or a suggestion is selected the other cards fade back, so the one being read
 * stands out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, MoreHorizontal, Pencil, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import type { Comment, CommentAnchor, DocStyle } from '@edw/shared';
import { IconButton } from '../editor/Toolbar.js';
import { ChatMarkdown } from './ChatMarkdown';
import { Thinking } from './chatReplies';
import { autoGrow } from './autoGrow';
import { Composer, sendClass } from './comments/Composer';
import type { CommentThread } from './comments/threads';
import { StyleSuggestion } from './comments/StyleSuggestion';
import { SuggestionCard, SuggestionTint, dimClass, isPicked, type SuggestionHover, type SuggestionPick } from './comments/SuggestionCard';
import type { Suggestion } from '../editor/suggest/suggestions.js';
import { useDismiss } from './useDismiss';
import { MakeSlot } from './slots/slots';
import { menuItemClass, menuNameClass } from './ExportMenu';
import { Button } from './ui/button';
import { fieldClass } from './ui/input';
import { cn } from '../lib/utils';

export { threadsOf, type CommentThread } from './comments/threads';
export { mentionAt } from './comments/Composer';

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const shortQuote = (q: string) => (q.length > 90 ? `${q.slice(0, 89)}…` : q);

export interface CommentsPanelProps {
  threads: CommentThread[];
  /** Its width in px, when it has been resized (a splitter before it); otherwise it takes about 300px and gives way first. */
  width?: number;
  /** A thread being started: the passage it is about. */
  draft: CommentAnchor | null;
  active: string | null;
  /** Thread id -> what the assistant is doing there, while it answers. */
  working: Record<string, string>;
  onSelect: (rootId: string) => void;
  /** `send`: the teacher left "Send to model" ticked, so the assistant answers. */
  onCreate: (anchor: CommentAnchor, body: string, send: boolean) => Promise<void>;
  onCancelDraft: () => void;
  onReply: (rootId: string, body: string, send: boolean) => Promise<void>;
  onDelete: (comment: Comment) => Promise<void>;
  /** The teacher changed one of their comments. */
  onEdit: (comment: Comment, body: string) => Promise<void>;
  /** A thread (by its root) resolved, or reopened. */
  onResolve: (root: Comment, resolved: boolean) => Promise<void>;
  onClose: () => void;
  /** Shown on the teacher's comments (with their initials); "You" without it. */
  teacherName?: string;
  /** The assistant's suggested font or page colour for the doc, waiting for the teacher. */
  styleSuggestion?: DocStyle;
  onStyleDecision?: (accept: boolean) => Promise<void> | void;
  /** The assistant's suggestions in the doc, as cards among the threads, in reading order. */
  suggestions?: SuggestionsColumn;
}

export interface SuggestionsColumn {
  items: Suggestion[];
  /** The selected suggestion: a change in a block, or a whole block. */
  active: SuggestionPick;
  /** A block's place in the doc, to put cards and threads in reading order. */
  positionOf: (blockId: string) => number;
  onSelect: (blockId: string, part: number | null) => void;
  onDecide: (blockId: string, accept: boolean, part: number | null) => void;
}

/** A thread's card: raised, no border; the selected one lifts and steps towards the document. */
const cardClass =
  'relative mb-2.5 rounded-md bg-card px-4 py-3.5 text-md shadow-card ring-1 ring-border transition duration-150 ease-out';
const cardActiveClass = 'cursor-default shadow-pop ring-border-strong -translate-x-1.5 motion-reduce:translate-x-0';
const cardIdleClass = 'cursor-pointer hover:shadow-float';
const quoteClass = 'mb-1.5 border-l-3 border-mark pl-2 text-sm text-foreground-2';

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';

export function CommentsPanel(props: CommentsPanelProps) {
  const { threads, draft, active } = props;
  const [showResolved, setShowResolved] = useState(false);
  const [hover, setHover] = useState<SuggestionHover>(null);
  const sg = props.suggestions;
  const suggestions = sg?.items ?? [];
  const open = threads.filter((t) => !t.root.resolved_at);
  const resolved = threads.filter((t) => t.root.resolved_at);
  // Faded only while the selected card is one shown here: a thread (open, or resolved and
  // unfolded) or a suggestion (picked in the document or here).
  const dim =
    (active !== null && (open.some((t) => t.root.id === active) || (showResolved && resolved.some((t) => t.root.id === active)))) ||
    (sg !== undefined && suggestions.some((s) => isPicked(s, sg.active)));
  const card = (t: CommentThread) => (
    <ThreadCard key={t.root.id} thread={t} active={t.root.id === active} dim={dim} working={props.working[t.root.id] ?? null} teacherName={props.teacherName} onSelect={props.onSelect} onReply={props.onReply} onDelete={props.onDelete} onEdit={props.onEdit} onResolve={props.onResolve} />
  );
  return (
    // Beside the document it gives way before the document does, down to 15rem; in the narrow
    // layout it goes under it.
    <aside
      className={cn(
        'comments-panel',
        'flex min-w-60 shrink-100 basis-75 flex-col border-l border-border bg-background',
        // Its splitter is the line beside it.
        props.width !== undefined && 'dock:border-l-0',
      )}
      style={props.width !== undefined ? { flexBasis: props.width } : undefined}
      aria-label="Comments"
      data-region="comments"
    >
      <div className="flex h-11 flex-none items-center justify-between pr-2 pl-3.5">
        <h2 className="text-base">Comments</h2>
        <IconButton icon={X} label="Hide comments" tipAlign="end" onClick={props.onClose} />
      </div>
      <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
        {props.styleSuggestion && props.onStyleDecision && <StyleSuggestion style={props.styleSuggestion} onDecide={props.onStyleDecision} />}
        {draft && <DraftCard anchor={draft} onCreate={props.onCreate} onCancel={props.onCancelDraft} />}
        {open.length === 0 && suggestions.length === 0 && !draft && !props.styleSuggestion && (
          <p className="mx-1.25 my-2 text-md text-muted-foreground">{resolved.length ? 'No open comments.' : 'Select text in the document and choose Comment. With “Send to model” ticked, the assistant answers in the thread.'}</p>
        )}
        {sg ? inReadingOrder(open, suggestions, sg.positionOf).map((x) => ('root' in x ? card(x) : <SuggestionCard key={`sg-${x.block_id}-${x.part ?? 'all'}`} suggestion={x} active={isPicked(x, sg.active)} dim={dim} onSelect={sg.onSelect} onDecide={sg.onDecide} onHover={setHover} />)) : open.map(card)}
        {sg && <SuggestionTint hover={hover} active={sg.active} />}
        {resolved.length > 0 && (
          <div>
            <button type="button" className="flex items-center gap-1.25 border-0 bg-transparent px-0.5 py-1 text-sm text-foreground-2 hover:text-foreground" aria-expanded={showResolved} onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              Resolved ({resolved.length})
            </button>
            {showResolved && resolved.map(card)}
          </div>
        )}
        <MakeSlot zone="margin" />
      </div>
    </aside>
  );
}

/** Threads and suggestion cards by the place of their block in the doc; a suggestion before a thread on the same block. */
function inReadingOrder(threads: CommentThread[], suggestions: Suggestion[], positionOf: (blockId: string) => number): Array<CommentThread | Suggestion> {
  const out: Array<CommentThread | Suggestion> = [];
  let i = 0;
  for (const t of threads) {
    const at = positionOf(t.root.block_id);
    while (i < suggestions.length && positionOf(suggestions[i]!.block_id) <= at) out.push(suggestions[i++]!);
    out.push(t);
  }
  return out.concat(suggestions.slice(i));
}

function DraftCard({ anchor, onCreate, onCancel }: { anchor: CommentAnchor; onCreate: CommentsPanelProps['onCreate']; onCancel: () => void }) {
  return (
    <div className={cn('comment-card', cardClass, cardActiveClass)}>
      {anchor.quote && <div className={cn('comment-quote', quoteClass)}>“{shortQuote(anchor.quote)}”</div>}
      <Composer label="New comment" placeholder="Comment" submitLabel="Comment" autoFocus onSubmit={(body, send) => onCreate(anchor, body, send)} onCancel={onCancel} />
    </div>
  );
}

type ItemActions = Pick<CommentsPanelProps, 'onReply' | 'onDelete' | 'onEdit' | 'onResolve'>;

function ThreadCard({ thread, active, dim, working, teacherName, onSelect, onReply, onDelete, onEdit, onResolve }: { thread: CommentThread; active: boolean; dim: boolean; working: string | null; teacherName?: string; onSelect: CommentsPanelProps['onSelect'] } & ItemActions) {
  const { root, replies } = thread;
  const resolved = Boolean(root.resolved_at);
  return (
    <div
      className={cn('comment-card', cardClass, active ? cardActiveClass : cardIdleClass, resolved && !active && 'opacity-75 hover:opacity-100', dim && !active && dimClass)}
      role="group"
      data-track={`comment:${root.id}`}
      aria-label={`${resolved ? 'Resolved comment thread' : 'Comment thread'}${root.quote ? ` on “${shortQuote(root.quote)}”` : ''}`}
      onClick={() => onSelect(root.id)}
    >
      {root.quote && <div className={cn('comment-quote', quoteClass)}>“{shortQuote(root.quote)}”</div>}
      {[root, ...replies].map((c) => (
        <CommentItem key={c.id} comment={c} root={c.id === root.id ? root : null} teacherName={teacherName} onDelete={onDelete} onEdit={onEdit} onResolve={onResolve} />
      ))}
      {working && (
<Thinking label={working} className="mt-2 text-md" />
      )}
      {active && !working && !resolved && <Composer label="Reply" placeholder="Reply" submitLabel="Reply" onSubmit={(body, send) => onReply(root.id, body, send)} />}
    </div>
  );
}

/** One comment. `root` is set on a thread's first comment (it carries Resolve, and Delete takes the thread). */
function CommentItem({ comment, root, teacherName, onDelete, onEdit, onResolve }: { comment: Comment; root: Comment | null; teacherName?: string } & Omit<ItemActions, 'onReply'>) {
  const [mode, setMode] = useState<'view' | 'menu' | 'edit' | 'confirm'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMode((m) => (m === 'menu' ? 'view' : m)), []);
  useDismiss(mode === 'menu', menuRef, closeMenu);
  const mine = comment.author === 'teacher';
  const resolved = Boolean(root?.resolved_at);
  const who = mine ? teacherName || 'You' : 'Assistant';
  const thing = root ? 'thread' : 'comment';

  const act = async (run: () => Promise<void>, failed: string, after: typeof mode = 'view') => {
    setBusy(true);
    setError(null);
    try {
      await run();
      setMode(after);
    } catch {
      setError(failed);
    } finally {
      setBusy(false);
    }
  };
  const items: { label: string; icon: typeof Pencil; danger?: boolean; run: () => void }[] = [];
  if (mine && !resolved) items.push({ label: 'Edit', icon: Pencil, run: () => setMode('edit') });
  if (root) items.push(resolved ? { label: 'Reopen', icon: RotateCcw, run: () => void act(() => onResolve(root, false), 'The thread could not be reopened. Please try again.') } : { label: 'Resolve', icon: Check, run: () => void act(() => onResolve(root, true), 'The thread could not be resolved. Please try again.') });
  if (mine) items.push({ label: 'Delete', icon: Trash2, danger: true, run: () => setMode('confirm') });

  return (
    <div className="group/item relative [&+&]:mt-3" onClick={mode === 'view' ? undefined : (e) => e.stopPropagation()}>
      <div className="mb-0.5 flex min-h-6.5 items-center gap-1.75 text-sm">
        <span
          className={cn('inline-flex size-5 flex-none items-center justify-center rounded-full text-2xs font-semibold text-primary-foreground', comment.author === 'teacher' ? 'bg-model' : 'bg-primary')}
          aria-hidden="true"
        >
          {mine ? initialsOf(teacherName || 'You') : <Sparkles size={11} />}
        </span>
        <span className="min-w-0 truncate font-semibold">{who}</span>
        <span className="flex-none text-xs text-muted-foreground">
          {when(comment.created_at)}
          {comment.edited_at && <span className="italic"> (edited)</span>}
        </span>
        {items.length > 0 && mode !== 'edit' && (
          <div
            className={cn(
              // Floats over the end of the header row, fading the text under it; shown on hover, focus or with its menu open.
              'pointer-events-none absolute -top-0.5 -right-1.5 flex items-center gap-0 bg-linear-to-r from-transparent to-card to-25% pl-6 opacity-0 transition-opacity duration-100 ease-out',
              'group-hover/item:pointer-events-auto group-hover/item:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100',
              'touch:pointer-events-auto touch:opacity-100',
            )}
            ref={menuRef}
          >
            <Button
              variant="toolbar"
              size="icon"
              className="h-6.5"
              aria-label={`More actions for this ${root ? 'thread' : 'comment'}`}
              aria-haspopup="menu"
              aria-expanded={mode === 'menu'}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                setMode((m) => (m === 'menu' ? 'view' : 'menu'));
              }}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </Button>
            {root && (
              <IconButton
                icon={resolved ? RotateCcw : Check}
                className="h-6.5"
                label={resolved ? 'Reopen' : 'Resolve'}
                tipAlign="end"
                disabled={busy}
                onClick={(e?: { stopPropagation?: () => void }) => {
                  e?.stopPropagation?.();
                  void act(() => onResolve(root, !resolved), resolved ? 'The thread could not be reopened. Please try again.' : 'The thread could not be resolved. Please try again.');
                }}
              />
            )}
            {mode === 'menu' && (
              <div className="absolute top-full right-0 z-40 mt-0.5 min-w-35 rounded-md border border-border bg-card p-1 shadow-float" role="menu" aria-label="Comment actions">
                {items.map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    className={cn(menuItemClass, 'justify-start text-md', it.danger && 'text-destructive')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMode('view');
                      it.run();
                    }}
                  >
                    <it.icon size={14} aria-hidden="true" />
                    <span className={menuNameClass}>{it.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {mode === 'edit' ? (
        <EditBox initial={comment.body} busy={busy} onCancel={() => setMode('view')} onSave={(body) => void act(() => (body === comment.body ? Promise.resolve() : onEdit(comment, body)), 'The comment could not be saved. Please try again.')} />
      ) : comment.author === 'model' ? (
        <ChatMarkdown text={comment.body} />
      ) : (
        <div className="wrap-anywhere whitespace-pre-wrap">{comment.body}</div>
      )}
      {mode === 'confirm' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5" role="group" aria-label={`Delete this ${thing}?`}>
          <span>Delete this {thing}?</span>
          <Button variant="link-danger" disabled={busy} onClick={() => void act(() => onDelete(comment), `The ${thing} could not be deleted. Please try again.`)}>
            Delete
          </Button>
          <Button variant="link" disabled={busy} onClick={() => setMode('view')}>
            Cancel
          </Button>
        </div>
      )}
      {error && (
        <p className="error-text my-3.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Editing a comment in place: Enter saves, Shift+Enter is a new line, Escape cancels. */
function EditBox({ initial, busy, onSave, onCancel }: { initial: string; busy: boolean; onSave: (body: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    autoGrow(el, 160);
  }, []);
  const save = () => {
    const body = text.trim();
    if (body && !busy) onSave(body);
  };
  return (
    <div className="mt-1.25">
      <textarea
        className={cn(fieldClass, 'block w-full resize-none text-md')}
        ref={ref}
        rows={1}
        aria-label="Edit comment"
        value={text}
        disabled={busy}
        onChange={(e) => {
          setText(e.target.value);
          autoGrow(e.target, 160);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="mt-1.5 flex items-center justify-end gap-3">
        <Button variant="link" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" className={sendClass} onClick={save} disabled={busy || !text.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
