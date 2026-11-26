/**
 * How far two sets of judge flags on the same turn agree (docs/spyglass.md, Part 8). A flag set is
 * the blocks flagged, each with its label; agreement is their overlap (Jaccard: shared over either),
 * and two empty sets agree fully. Also, more loosely, the blocks alone, and whether both flag
 * anything at all.
 */
import type { KeyDecision } from '@edw/shared';

export interface Agreement {
  /** Blocks with their labels. */
  labelled: number;
  /** Blocks, whatever the label. */
  blocks: number;
  /** Both flag something, or both flag nothing. */
  any: number;
}

const labelledSet = (flags: readonly KeyDecision[]) => new Set(flags.flatMap((f) => f.block_ids.map((b) => `${b}|${f.label}`)));
const blockSet = (flags: readonly KeyDecision[]) => new Set(flags.flatMap((f) => f.block_ids));

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const shared = [...a].filter((x) => b.has(x)).length;
  return shared / (a.size + b.size - shared);
}

export function agreement(a: readonly KeyDecision[], b: readonly KeyDecision[]): Agreement {
  return { labelled: jaccard(labelledSet(a), labelledSet(b)), blocks: jaccard(blockSet(a), blockSet(b)), any: (a.length > 0) === (b.length > 0) ? 1 : 0 };
}

/** The mean of several agreements; null when there are none. */
export function meanAgreement(xs: readonly Agreement[]): Agreement | null {
  if (!xs.length) return null;
  const sum = (k: keyof Agreement) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
  return { labelled: sum('labelled'), blocks: sum('blocks'), any: sum('any') };
}

/**
 * One case: every run of one model against every other run of the same model (`b` left out), or
 * every run of one against every run of another. Runs with no usable answer are null and skipped.
 */
export function caseAgreement(a: ReadonlyArray<readonly KeyDecision[] | null>, b?: ReadonlyArray<readonly KeyDecision[] | null>): Agreement | null {
  const xs = a.filter((r): r is readonly KeyDecision[] => r !== null);
  const pairs: Agreement[] = [];
  if (b === undefined) {
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) pairs.push(agreement(xs[i]!, xs[j]!));
  } else {
    const ys = b.filter((r): r is readonly KeyDecision[] => r !== null);
    for (const x of xs) for (const y of ys) pairs.push(agreement(x, y));
  }
  return meanAgreement(pairs);
}
