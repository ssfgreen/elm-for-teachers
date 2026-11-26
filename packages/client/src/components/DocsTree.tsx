import type { Doc, Thread } from '@edw/shared';

export type DocTree = Array<{ thread: Thread; docs: Doc[] }>;

/** Chats newest first (as the sidebar lists them), each with its docs oldest first; chats with no docs are left out. */
export function docTree(threads: Thread[], docs: Doc[]): DocTree {
  return [...threads]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .map((thread) => ({
      thread,
      docs: docs
        .filter((d) => d.thread_id === thread.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
    }))
    .filter((g) => g.docs.length > 0);
}
