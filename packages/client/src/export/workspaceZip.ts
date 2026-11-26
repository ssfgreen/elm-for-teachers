/**
 * The teacher's own download of their workspace (account menu): a zip with
 *   documents/<doc name>.docx   each doc with any text, as the Word download writes it
 *   chats/<chat name>.txt       each chat with any turns, as plain messages back and forth
 * It is for the teacher to keep, not for analysis: the full logged bundle is the admin's.
 */
import JSZip from 'jszip';
import type { Doc, Thread } from '@edw/shared';
import type { ChatTurn } from '../api/types';
import { fileName } from '../download';
import type { CanvasSnapshot } from '../editor/types';
import { docMarkdown } from '../state/exportDoc';

export interface WorkspaceZipInput {
  snap: CanvasSnapshot;
  threads: Thread[];
  /** Each thread's completed turns, by thread id. */
  chats: Map<string, ChatTurn[]>;
  /** The doc as a Word file (export/docx.ts, loaded by the caller). */
  wordFor: (doc: Doc) => Promise<Blob>;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** One chat as text: its name, then each message under who sent it. */
export function chatText(thread: Pick<Thread, 'title'>, turns: ChatTurn[]): string {
  const parts = [thread.title];
  for (const t of turns) {
    const about = t.anchor ? `\nAbout: ${t.anchor.quote ? `“${t.anchor.quote}”` : 'a block in the document'}` : '';
    parts.push(`You, ${when(t.at)}:${about}\n${t.prompt}`);
    if (t.response_text) parts.push(`Assistant:\n${t.response_text}`);
  }
  return `${parts.join('\n\n')}\n`;
}

/** `name.ext`, or `name (2).ext` and so on when the folder already has one. */
function unique(taken: Set<string>, name: string, ext: string): string {
  let file = `${name}.${ext}`;
  for (let n = 2; taken.has(file.toLowerCase()); n++) file = `${name} (${n}).${ext}`;
  taken.add(file.toLowerCase());
  return file;
}

export async function workspaceZip({ snap, threads, chats, wordFor }: WorkspaceZipInput): Promise<Blob> {
  const zip = new JSZip();
  const docNames = new Set<string>();
  // Oldest first, so a later doc of the same name is the one numbered.
  for (const doc of [...snap.docs].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    if (!docMarkdown(snap, doc.id).trim()) continue;
    zip.file(`documents/${unique(docNames, fileName(doc.name), 'docx')}`, await wordFor(doc));
  }
  const chatNames = new Set<string>();
  for (const thread of [...threads].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const turns = chats.get(thread.id) ?? [];
    if (turns.length === 0) continue;
    zip.file(`chats/${unique(chatNames, fileName(thread.title), 'txt')}`, chatText(thread, turns));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}
