import { describe, expect, it } from 'vitest';
import { inOrder, moveId } from './promptOrder';

describe('moveId', () => {
  it('moves a prompt up or down one place', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the list as it is at either end, or for an unknown id', () => {
    const ids = ['a', 'b'];
    expect(moveId(ids, 'a', -1)).toBe(ids);
    expect(moveId(ids, 'b', 1)).toBe(ids);
    expect(moveId(ids, 'z', 1)).toBe(ids);
  });
});

describe('inOrder', () => {
  const p = (id: string, n = 0) => ({ id, n });
  it('orders the prompts as they are now, keeping their fields', () => {
    expect(inOrder([p('a', 1), p('b', 2), p('c', 3)], ['c', 'a', 'b'])).toEqual([p('c', 3), p('a', 1), p('b', 2)]);
  });

  it('keeps prompts the order does not name after the others, as they were', () => {
    expect(inOrder([p('a'), p('x'), p('b'), p('y')], ['b', 'a'])).toEqual([p('b'), p('a'), p('x'), p('y')]);
  });
});
