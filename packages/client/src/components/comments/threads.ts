import type { Comment } from '@edw/shared';

export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

/** Threads from a doc's comments, in reading order (block position, then age). */
export function threadsOf(comments: Comment[], blockOrder: ReadonlyMap<string, number>): CommentThread[] {
  const roots = comments.filter((c) => !c.root_id);
  return roots
    .map((root) => ({ root, replies: comments.filter((c) => c.root_id === root.id) }))
    .sort((a, b) => (blockOrder.get(a.root.block_id) ?? Infinity) - (blockOrder.get(b.root.block_id) ?? Infinity) || a.root.created_at.localeCompare(b.root.created_at));
}
