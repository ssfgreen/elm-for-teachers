import type { Comment } from '@edw/shared';

/** A doc's open comment threads as the model reads them: ids, the block and quote, who said what. Resolved threads are left out. */
export function commentsText(comments: Comment[], docId: string): string {
  const roots = comments.filter((c) => c.doc_id === docId && !c.root_id && !c.resolved_at);
  if (roots.length === 0) return '';
  const lines = ['## Comments on this document'];
  for (const r of roots) {
    lines.push(`- [comment=${r.id}] on block [id=${r.block_id}]${r.quote ? ` about "${r.quote}"` : ''}:`);
    for (const c of [r, ...comments.filter((x) => x.root_id === r.id)]) lines.push(`  ${c.author === 'model' ? 'Assistant' : 'Teacher'}: ${c.body.replace(/\s*\n\s*/g, ' ')}`);
  }
  return lines.join('\n');
}
