/** Moving one prompt up or down the library: pure, so it is tested without React. */

/** The ids with `id` moved `by` places (−1 up, +1 down); the same array when it cannot move. */
export function moveId(ids: readonly string[], id: string, by: -1 | 1): readonly string[] {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/**
 * The prompts as they are now, in the order `ids` gives; any not in `ids` (added meanwhile) stay
 * after them in their current order. Only the order changes, never a prompt's fields.
 */
export function inOrder<P extends { id: string }>(prompts: readonly P[], ids: readonly string[]): P[] {
  const at = new Map(ids.map((id, i) => [id, i]));
  const rank = (p: P) => at.get(p.id) ?? ids.length;
  return prompts.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p);
}
