/**
 * A word diff, for showing a suggested change as tracked changes: what the assistant would add
 * (underlined) and take out (struck through). Pure, so it is tested without an editor.
 *
 * Text is cut into words, runs of spaces and single other characters; the longest common
 * run of those is kept and the rest is marked. Words changed side by side with only spaces
 * between them are shown as one change ("a b" for "x y", not a, x, b, y in turn), and in each
 * change the new text comes before the old, as the comments column reads it.
 */

export type Part = { kind: 'same' | 'ins' | 'del'; text: string };

const TOKEN_RE = /\s+|[\p{L}\p{N}\p{M}'’_-]+|[^\s]/gu;
/** Past this many cells the middle is shown as one change rather than worked out word by word. */
const MAX_CELLS = 400_000;

export function tokens(s: string): string[] {
  return s.match(TOKEN_RE) ?? [];
}

export function diffWords(before: string, after: string): Part[] {
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];
  const a = tokens(before);
  const b = tokens(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const parts: Part[] = [];
  push(parts, 'same', a.slice(0, start).join(''));
  for (const p of middle(a.slice(start, endA), b.slice(start, endB))) push(parts, p.kind, p.text);
  push(parts, 'same', a.slice(endA).join(''));
  return tidy(parts);
}

/** The changed middle, by longest common subsequence over tokens. */
function middle(a: string[], b: string[]): Part[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || n * m > MAX_CELLS) {
    return [
      { kind: 'del', text: a.join('') },
      { kind: 'ins', text: b.join('') },
    ];
  }
  // lcs[i][j]: the longest common run of a[i..] and b[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  const out: Part[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(out, 'same', a[i++]!);
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) push(out, 'del', a[i++]!);
    else push(out, 'ins', b[j++]!);
  }
  while (i < n) push(out, 'del', a[i++]!);
  while (j < m) push(out, 'ins', b[j++]!);
  return out;
}

function push(parts: Part[], kind: Part['kind'], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

/**
 * Runs of changes become one change each: spaces alone between two changes join them, and
 * each change is its insertion then its deletion.
 */
function tidy(parts: Part[]): Part[] {
  const out: Part[] = [];
  let ins = '';
  let del = '';
  const flush = () => {
    push(out, 'ins', ins);
    push(out, 'del', del);
    ins = '';
    del = '';
  };
  parts.forEach((p, k) => {
    if (p.kind === 'ins') ins += p.text;
    else if (p.kind === 'del') del += p.text;
    else if ((ins || del) && /^\s+$/.test(p.text) && parts[k + 1] && parts[k + 1]!.kind !== 'same') {
      ins += p.text;
      del += p.text;
    } else {
      flush();
      push(out, 'same', p.text);
    }
  });
  flush();
  return out;
}

/**
 * Which change each part belongs to, numbered from 0 in reading order (-1 for unchanged text):
 * a run of changed parts with nothing unchanged between them is one change, as its card shows it.
 */
export function changeIndexes(parts: Part[]): number[] {
  let n = -1;
  let inChange = false;
  return parts.map((p) => {
    if (p.kind === 'same') {
      inChange = false;
      return -1;
    }
    if (!inChange) n++;
    inChange = true;
    return n;
  });
}

/** Whether a diff changes anything. */
export const changes = (parts: Part[]) => parts.some((p) => p.kind !== 'same');
