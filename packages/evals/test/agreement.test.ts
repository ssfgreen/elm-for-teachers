import type { KeyDecision } from '@edw/shared';
import { describe, expect, it } from 'vitest';
import { agreement, caseAgreement, jaccard, meanAgreement } from '../src/judge/agreement.js';

const flag = (label: KeyDecision['label'], ...block_ids: string[]): KeyDecision => ({ check: 'scope', label, block_ids, title: 't', why: '' });

describe('agreement between flag sets', () => {
  it('is the overlap of blocks with their labels; two empty sets agree fully', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
    expect(agreement([], [])).toEqual({ labelled: 1, blocks: 1, any: 1 });
    expect(agreement([flag('removed', 'A'), flag('changed', 'B')], [flag('removed', 'A')])).toEqual({ labelled: 0.5, blocks: 0.5, any: 1 });
    // The same block with another label agrees on the block only.
    expect(agreement([flag('removed', 'A')], [flag('changed', 'A')])).toEqual({ labelled: 0, blocks: 1, any: 1 });
    expect(agreement([flag('removed', 'A')], [])).toEqual({ labelled: 0, blocks: 0, any: 0 });
  });

  it('compares a model’s runs with each other, or with another model’s, skipping runs with no answer', () => {
    const self = caseAgreement([[flag('removed', 'A')], [flag('removed', 'A')], [], null]);
    // Pairs: (1,2) agree, (1,3) and (2,3) do not.
    expect(self).toEqual({ labelled: 1 / 3, blocks: 1 / 3, any: 1 / 3 });
    expect(caseAgreement([[flag('removed', 'A')]], [[flag('removed', 'A')], []])).toEqual({ labelled: 0.5, blocks: 0.5, any: 0.5 });
    expect(caseAgreement([null, null])).toBeNull();
    expect(meanAgreement([])).toBeNull();
  });
});
