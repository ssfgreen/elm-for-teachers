/**
 * Citations of the pedagogy library's claims, checked before the turn commits
 * (library/pedagogy-sample/HANDOFF.md section 4): a citation in the reply or a comment of a claim
 * the turn did not retrieve is taken out, so the teacher never sees an invented one; the
 * document is for pupils, so any citation in an edit is taken out. The model's own words, with
 * what it cited, stay in the gateway log.
 */
import { keepKnownCitations, type Operation } from '@edw/shared';
import type { CommentDraft } from './tools/types.js';

const ANY_CITATION = / ?\[\[clm-[A-Za-z0-9-]+\]\]/g;

/** Every citation out of a value's strings (an operation's content), whatever it cites. */
function withoutCitations<T>(value: T): T {
  if (typeof value === 'string') return value.replace(ANY_CITATION, '') as T;
  if (Array.isArray(value)) return value.map(withoutCitations) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutCitations(v)])) as T;
  return value;
}

export interface CheckedCitations {
  message: string;
  comments: CommentDraft[];
  operations: Operation[];
  /** Claim ids cited but not retrieved, taken out. */
  dropped: string[];
}

export function checkCitations(turn: { message: string; comments: readonly CommentDraft[]; operations: readonly Operation[] }, citable: ReadonlySet<string>): CheckedCitations {
  const dropped = new Set<string>();
  const keep = (text: string) => {
    const r = keepKnownCitations(text, citable);
    r.dropped.forEach((d) => dropped.add(d));
    return r.text;
  };
  return {
    message: keep(turn.message),
    comments: turn.comments.map((c) => ({ ...c, body: keep(c.body) })),
    operations: turn.operations.map(withoutCitations),
    dropped: [...dropped],
  };
}
