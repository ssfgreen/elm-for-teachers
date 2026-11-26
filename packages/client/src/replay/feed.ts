/** The moments worth naming in a sitting: shown in the activity list and as marks on the scrub bar. */
import type { ReplayEvent } from './bundle';

export type MomentTone = 'chat' | 'accept' | 'reject' | 'doc' | 'away' | 'other';

export interface Moment {
  t: number;
  tone: MomentTone;
  label: string;
}

type P = Record<string, unknown>;
const s = (p: P, k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
const clip = (text: string, n = 80) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export function describe(e: ReplayEvent): Moment | null {
  const p = e.payload;
  const m = (tone: MomentTone, label: string): Moment => ({ t: e.t, tone, label });
  switch (e.kind) {
    case 'chat_prompt':
      return m('chat', `Asked: “${clip(s(p, 'text'))}”`);
    case 'chat_response': {
      const n = Array.isArray(p.operations) ? p.operations.length : 0;
      return m('chat', n ? `Assistant replied, suggesting ${n} change${n === 1 ? '' : 's'}` : 'Assistant replied');
    }
    case 'proposal_accept':
      return m('accept', p.block_id ? 'Accepted a suggestion' : 'Accepted all suggestions');
    case 'proposal_reject':
      return m('reject', p.block_id ? 'Rejected a suggestion' : 'Rejected all suggestions');
    case 'spyglass_shown': {
      const n = Array.isArray(p.flags) ? p.flags.length : 0;
      return n ? m('chat', `Spyglass raised ${n} flag${n === 1 ? '' : 's'}`) : null;
    }
    case 'doc_create':
      return m('doc', `Made a doc: ${s(p, 'name')}`);
    case 'doc_rename':
      return m('doc', `Renamed a doc to ${s(p, 'name')}`);
    case 'doc_delete':
      return m('doc', `Deleted a doc: ${s(p, 'name')}`);
    case 'doc_export':
      return m('doc', `Downloaded as ${s(p, 'format') || 'a file'}`);
    case 'doc_preview':
      return m('doc', 'Opened the Word preview');
    case 'thread_create':
      return m('doc', 'Started a new chat');
    case 'comment_create':
      return s(p, 'author') === 'teacher' ? m('doc', `Commented: “${clip(s(p, 'body'))}”`) : null;
    case 'comment_resolve':
      return m('doc', 'Resolved a comment');
    case 'paste':
      return m('other', `Pasted ${String(p.length ?? '')} characters`);
    case 'asset_upload':
      return m('other', `Added a picture: ${s(p, 'filename')}`);
    case 'ui_state':
      return p.open ? m('other', `Opened ${s(p, 'role')}: ${s(p, 'label') || 'untitled'}`) : null;
    case 'page_state':
      return p.visible === false ? m('away', 'Left the tab') : null;
    case 'click': {
      const label = p.control ? s(p.control as P, 'label') : '';
      return label ? m('other', `Clicked “${clip(label, 50)}”`) : null;
    }
    default:
      return null;
  }
}

export function moments(events: readonly ReplayEvent[], first: number, last: number): Moment[] {
  const out: Moment[] = [];
  for (let i = first; i <= last; i++) {
    const m = describe(events[i]!);
    if (m) out.push(m);
  }
  return out;
}
