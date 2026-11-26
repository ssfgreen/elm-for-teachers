import { describe, expect, it } from 'vitest';
import { collectionVersion } from '../core/version.js';
import { treeHash } from './hash.js';

const files = new Map([
  ['b.md', 'two'],
  ['a/c.md', 'three'],
  ['plugin.json', '{}'],
]);

describe('treeHash', () => {
  it('is a full sha256, written sha256:<64 hex>', () => {
    expect(treeHash(files)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('does not depend on the order of the files', () => {
    const reversed = new Map([...files].reverse());
    expect(treeHash(reversed)).toBe(treeHash(files));
  });

  it('changes when any file changes, is added, is removed or is renamed', () => {
    const base = treeHash(files);
    for (const path of files.keys()) expect(treeHash(new Map(files).set(path, `${files.get(path)} `))).not.toBe(base);
    expect(treeHash(new Map(files).set('d.md', ''))).not.toBe(base);
    const removed = new Map(files);
    removed.delete('b.md');
    expect(treeHash(removed)).not.toBe(base);
    const renamed = new Map(removed).set('b2.md', 'two');
    expect(treeHash(renamed)).not.toBe(base);
  });

  it('keeps path and content apart, so moving text between them changes it', () => {
    expect(treeHash(new Map([['ab', 'c']]))).not.toBe(treeHash(new Map([['a', 'bc']])));
  });

  it('is not the collection version, which is the same walk cut to 12', () => {
    expect(treeHash(files).slice('sha256:'.length, 'sha256:'.length + 12)).toBe(collectionVersion(files));
  });
});
