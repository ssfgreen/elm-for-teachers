/** The word list's shape, and what usernames and passwords look like (issue #223). */
import { describe, expect, it } from 'vitest';
import { makePassword, makeUsername, WORDS } from './words.js';

/** Never in the list: first names, colours that name people, slang, teasing. Not exhaustive; read the list too. */
const BLOCKED = [
  'rose', 'lily', 'daisy', 'ruby', 'amber', 'jade', 'holly', 'iris', 'ivy', 'hazel', 'robin', 'sky', 'dawn', 'summer',
  'april', 'may', 'june', 'grace', 'hope', 'faith', 'joy', 'pearl', 'olive', 'poppy', 'willow', 'sage', 'river', 'sunny',
  'jack', 'max', 'sam', 'ben', 'tom', 'bob', 'ray', 'mark', 'bill', 'will', 'jay', 'wren', 'rowan', 'ash',
  'black', 'white', 'brown', 'yellow', 'red',
  'melon', 'jug', 'nut', 'beaver', 'muffin', 'mug', 'toad', 'pig', 'cow', 'ape', 'monkey', 'spade', 'grass', 'weed', 'pot', 'crab',
  // Taken out in review (PR #228): slang, teasing, or close to a name.
  'anchor', 'basket', 'beach', 'bean', 'bear', 'bell', 'blue', 'brick', 'busy', 'cake', 'camel', 'carrot',
  'clover', 'duck', 'eager', 'fluffy', 'fork', 'fox', 'fresh', 'frog', 'goat', 'goose', 'gull', 'harp',
  'helmet', 'hippo', 'horse', 'lemon', 'lobster', 'lynx', 'marble', 'merry', 'mole', 'moose', 'newt', 'onion',
  'parrot', 'pea', 'pear', 'plum', 'pony', 'quail', 'rabbit', 'raven', 'shark', 'sheep', 'snail', 'soft',
  'spoon', 'tiger', 'toast', 'trout', 'truck', 'trumpet', 'turnip', 'waffle', 'wagon', 'walrus', 'whale', 'yak',
];

describe('WORDS', () => {
  it('has at least 200 different words, each three to eight lower-case letters', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
  });

  it('holds none of the blocked words', () => {
    expect(WORDS.filter((w) => BLOCKED.includes(w))).toEqual([]);
  });
});

describe('makeUsername and makePassword', () => {
  it('give two words and two digits, and two words and three digits, from the list', () => {
    for (let i = 0; i < 200; i++) {
      const u = makeUsername().split('-');
      const p = makePassword().split('-');
      expect(u).toHaveLength(3);
      expect(p).toHaveLength(3);
      expect(WORDS).toContain(u[0]);
      expect(WORDS).toContain(u[1]);
      expect(u[2]).toMatch(/^\d{2}$/);
      expect(WORDS).toContain(p[0]);
      expect(WORDS).toContain(p[1]);
      expect(p[2]).toMatch(/^\d{3}$/);
    }
  });

  it('rarely repeat', () => {
    const made = new Set(Array.from({ length: 500 }, makePassword));
    expect(made.size).toBeGreaterThan(495);
  });
});
