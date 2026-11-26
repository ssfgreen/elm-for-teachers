/**
 * The screen as it was at one moment: one pass over the events up to then. Pure, so the player
 * can call it every frame and tests can call it at any time.
 */
import type { Comment, Doc, Thread } from '@edw/shared';
import type { ChatMessage } from '../components/ChatMessages';
import type { PublicBlock } from '../editor/types';
import { blocksAt } from './blockStates';
import { lastAtOrBefore, pointerAt, type PointerPoint, type Timeline } from './timeline';
import { barAt, chatAt, commentsAt, type BarSettings } from './workspaceAt';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
  regions: Record<string, Rect>;
}

export interface Snapshot {
  t: number;
  viewport: Viewport | null;
  focusPane: string;
  pointer: (PointerPoint & { idleMs: number }) | null;
  /** Clicks in the last `CLICK_MS`, with how long ago. */
  clicks: ShownClick[];
  /** Clicks in the next `AHEAD_MS`, so where their control is can be seen before it changes. */
  upcoming: ShownClick[];
  threads: Thread[];
  threadId: string | null;
  /** Every doc there was then; `docs` those of the open chat. */
  allDocs: Doc[];
  docs: Doc[];
  docId: string | null;
  /** The open doc's blocks, as the editor takes them (with their waiting suggestions). */
  blocks: PublicBlock[];
  visible: Set<string>;
  /** The document's logged scroll position, or null when none was logged since it opened. */
  canvasScroll: number | null;
  /** The editor's selection, as logged: positions from the start of the block. */
  selection: { block_id: string; from: number; to: number } | null;
  chat: ChatMessage[];
  draft: string;
  bar: BarSettings | null;
  comments: Comment[];
  /** 'hidden': another tab or app in front; 'unfocused': the window is showing but not in use. */
  away: 'hidden' | 'unfocused' | null;
  dialog: string | null;
}

export const CLICK_MS = 900;
export const AHEAD_MS = 300;

export interface ShownClick {
  t: number;
  x: number;
  y: number;
  /** How long ago; negative for one still to come. */
  ageMs: number;
  label: string | null;
  block_id: string | null;
  item: string | null;
}

function clickOf(e: { t: number; payload: Record<string, unknown> }, now: number): ShownClick {
  const p = e.payload;
  const control = p.control as Record<string, unknown> | null;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return { t: e.t, x: p.x as number, y: p.y as number, ageMs: now - e.t, label: control ? str(control.label) : null, block_id: str(p.block_id), item: str(p.item) };
}

const TEACHER_ACTS = new Set(['click', 'keystroke_batch', 'pointer', 'selection', 'scroll', 'preview_scroll', 'paste', 'text_select']);

type P = Record<string, unknown>;
const s = (p: P, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);

interface Step {
  from: number;
  to: number;
  text: string;
}
const applySteps = (text: string, steps: readonly Step[]) =>
  steps.reduce((acc, st) => acc.slice(0, st.from) + st.text + acc.slice(st.to), text);

export function snapshotAt(tl: Timeline, t: number): Snapshot {
  const { events } = tl;
  const last = lastAtOrBefore(events, t);
  let viewport: Viewport | null = null;
  let focusPane = 'none';
  let threadId: string | null = null;
  let docId: string | null = null;
  const threads = new Map<string, string>(tl.bundle.threads.map((th) => [th.id, th.title]));
  const threadInfo = new Map(tl.bundle.threads.map((th) => [th.id, th]));
  const docInfo = new Map(tl.bundle.docs.map((d) => [d.id, d]));
  const liveThreads = new Set<string>();
  const docs = new Map<string, { name: string; thread: string | null; at: number }>();
  const visible = new Set<string>();
  let canvasScroll: number | null = null;
  let scrolledDoc: string | null = null;
  let selection: Snapshot['selection'] = null;
  let draft = '';
  let pageVisible = true;
  let pageFocused = true;
  const dialogs: string[] = [];
  const clicks: Snapshot['clicks'] = [];

  for (let i = 0; i <= last; i++) {
    const e = events[i]!;
    const p = e.payload;
    // Doing something on the page means being on it: the log sometimes says hidden with no
    // later page_state when the teacher came back (P04, 12 Nov 2026, 12:23).
    if (TEACHER_ACTS.has(e.kind)) pageVisible = pageFocused = true;
    if (e.thread_id) threadId = e.thread_id;
    if (e.doc_id) docId = e.doc_id;
    // Where focus is comes from focus events and what the teacher does; events the browser logs
    // on its own (block_visible, page_state) can carry 'none' while focus is still in the doc.
    if (TEACHER_ACTS.has(e.kind) && e.focus_pane !== 'none') focusPane = e.focus_pane;
    switch (e.kind) {
      case 'viewport':
        viewport = p as unknown as Viewport;
        break;
      case 'thread_create':
        // threads.json has the final name; a chat starts Untitled and thread_rename names it.
        liveThreads.add(s(p, 'thread_id') ?? '');
        threads.set(s(p, 'thread_id') ?? '', 'Untitled');
        break;
      case 'thread_rename':
        threads.set(s(p, 'thread_id') ?? '', s(p, 'title') ?? 'Untitled');
        break;
      case 'doc_create':
        docs.set(s(p, 'doc_id') ?? '', { name: s(p, 'name') ?? 'Untitled', thread: s(p, 'thread_id'), at: e.t });
        break;
      case 'doc_rename': {
        const d = docs.get(s(p, 'doc_id') ?? '');
        if (d) d.name = s(p, 'name') ?? d.name;
        break;
      }
      case 'doc_delete':
        docs.delete(s(p, 'doc_id') ?? '');
        break;
      case 'doc_open':
        docId = s(p, 'doc_id') ?? docId;
        break;
      case 'focus':
        focusPane = s(p, 'pane') ?? focusPane;
        break;
      case 'block_visible':
        if (p.visible) visible.add(s(p, 'block_id') ?? '');
        else visible.delete(s(p, 'block_id') ?? '');
        break;
      case 'selection': {
        const block = s(p, 'block_id');
        selection = block && typeof p.from === 'number' && typeof p.to === 'number' ? { block_id: block, from: p.from, to: p.to } : null;
        break;
      }
      case 'scroll':
        if (p.pane === 'canvas') {
          canvasScroll = typeof p.position === 'number' ? p.position : canvasScroll;
          scrolledDoc = docId;
        }
        break;
      case 'chat_prompt':
        draft = '';
        break;
      case 'keystroke_batch':
        if ((p.target as P | undefined)?.kind === 'chat') draft = applySteps(draft, (p.steps ?? []) as Step[]);
        break;
      case 'page_state':
        pageVisible = p.visible !== false;
        pageFocused = p.focused !== false;
        break;
      case 'ui_state': {
        const label = s(p, 'label') ?? s(p, 'role') ?? 'Dialog';
        const at = dialogs.lastIndexOf(label);
        if (p.open) dialogs.push(label);
        else if (at >= 0) dialogs.splice(at, 1);
        break;
      }
      case 'click':
        if (t - e.t < CLICK_MS) clicks.push(clickOf(e, t));
        break;
    }
  }
  draft = typingInProgress(tl, last, t, draft);
  const upcoming: ShownClick[] = [];
  for (let i = last + 1; i < events.length && events[i]!.t - t <= AHEAD_MS; i++) if (events[i]!.kind === 'click') upcoming.push(clickOf(events[i]!, t));

  const allDocs: Doc[] = [...docs].map(([id, d]) => {
    const info = docInfo.get(id);
    return { id, session_id: '', thread_id: d.thread ?? info?.thread_id ?? '', name: d.name, created_by: info?.created_by ?? 'teacher', created_at: info?.created_at ?? new Date(d.at).toISOString() };
  });
  const threadDocs = allDocs.filter((d) => d.thread_id === threadId);
  if (docId && !docs.has(docId)) docId = threadDocs[0]?.id ?? null;
  return {
    t,
    viewport,
    focusPane,
    pointer: pointerAt(tl.pointer, t),
    clicks,
    upcoming,
    threads: [...threads]
      .filter(([id]) => liveThreads.has(id) || id === threadId)
      .map(([id, title]) => ({ id, session_id: '', title, project_id: threadInfo.get(id)?.project_id ?? null, created_at: threadInfo.get(id)?.created_at ?? '' })),
    threadId,
    allDocs,
    docs: threadDocs,
    docId,
    blocks: docId ? blocksAt(tl.docs, tl.states, docId, t) : [],
    visible,
    canvasScroll: scrolledDoc === docId ? canvasScroll : null,
    selection,
    chat: chatAt(tl.bundle, tl.moments, threadId, t),
    draft,
    bar: barAt(events, t),
    comments: commentsAt(tl.bundle, tl.moments, docId, t),
    away: !pageVisible ? 'hidden' : !pageFocused ? 'unfocused' : null,
    dialog: dialogs.at(-1) ?? null,
  };
}

/**
 * The chat box's typing is logged in batches; a batch still being typed at `t` shows the part
 * typed so far, spread evenly between its first and last keystroke.
 */
function typingInProgress(tl: Timeline, last: number, t: number, draft: string): string {
  for (let i = last + 1; i < tl.events.length; i++) {
    const e = tl.events[i]!;
    if (e.t - t > 5_000) break;
    if (e.kind !== 'keystroke_batch' || (e.payload.target as P | undefined)?.kind !== 'chat') continue;
    const start = Date.parse(s(e.payload, 'batch_start_ts') ?? '');
    const end = Date.parse(s(e.payload, 'batch_end_ts') ?? '');
    const steps = (e.payload.steps ?? []) as Step[];
    if (!(start <= t) || steps.length === 0) return draft;
    const f = end > start ? Math.min(1, (t - start) / (end - start)) : 1;
    return applySteps(draft, steps.slice(0, Math.floor(f * steps.length)));
  }
  return draft;
}
