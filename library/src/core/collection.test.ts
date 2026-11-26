import { describe, expect, it } from 'vitest';
import { buildCollection } from './collection.js';
import { FIXTURE_FILES, fixture } from './test-fixture.js';
import { collectionVersion } from './version.js';

describe('buildCollection', () => {
  it('reads the meta, the documents in path order and their frontmatter', () => {
    const c = fixture();
    expect(c.meta.id).toBe('test');
    expect(c.docs.map((d) => d.path)).toEqual(['literacy.md', 'numeracy.md']);
    expect(c.docs[1]!.title).toBe('Numeracy and mathematics: experiences and outcomes');
    expect(c.docs[1]!.frontmatter.codes).toContain('MNU 2-03a');
    expect(c.docs[1]!.lines[0]).toBe('');
    expect(c.docs[1]!.lines[1]).toBe('# Numeracy and mathematics: experiences and outcomes');
  });

  it('takes the latest fetched_at as updatedAt', () => {
    expect(fixture().updatedAt).toBe('2026-11-08');
  });

  it('fails without collection.json', () => {
    const files = new Map(FIXTURE_FILES);
    files.delete('collection.json');
    expect(() => buildCollection(files)).toThrow(/collection.json/);
  });
});

describe('collectionVersion', () => {
  it('is short, stable whatever the insertion order, and changes with any content', () => {
    const v = collectionVersion(FIXTURE_FILES);
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(collectionVersion(new Map([...FIXTURE_FILES].reverse()))).toBe(v);
    const changed = new Map(FIXTURE_FILES);
    changed.set('docs/literacy.md', `${changed.get('docs/literacy.md')}\nmore`);
    expect(collectionVersion(changed)).not.toBe(v);
    const renamed = new Map(FIXTURE_FILES);
    renamed.set('docs/other.md', renamed.get('docs/literacy.md')!);
    renamed.delete('docs/literacy.md');
    expect(collectionVersion(renamed)).not.toBe(v);
  });
});
