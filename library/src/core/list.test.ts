import { describe, expect, it } from 'vitest';
import { globToRegExp } from './glob.js';
import { list } from './list.js';
import { fixture } from './test-fixture.js';

describe('list', () => {
  it('lists every file with its frontmatter fields as lists', () => {
    const { files } = list(fixture());
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({
      path: 'literacy.md',
      title: 'Literacy and English: experiences and outcomes',
      lines: 5,
      subject: ['Literacy and English'],
      level: ['Early', 'First'],
      type: 'experiences-and-outcomes',
    });
  });

  it('filters on frontmatter, ignoring case, any value of a list', () => {
    const paths = (filters: object) => list(fixture(), { filters }).files.map((f) => f.path);
    expect(paths({ subject: 'numeracy AND mathematics' })).toEqual(['numeracy.md']);
    expect(paths({ level: 'second' })).toEqual(['numeracy.md']);
    expect(paths({ level: ['second', 'first'] })).toEqual(['literacy.md', 'numeracy.md']);
    expect(paths({ type: 'experiences-and-outcomes', level: 'early' })).toEqual(['literacy.md', 'numeracy.md']);
    expect(paths({ code: 'lit 1-01a' })).toEqual(['literacy.md']);
    expect(paths({ code: 'MNU 2' })).toEqual(['numeracy.md']);
    expect(paths({ subject: 'sciences' })).toEqual([]);
  });

  it('filters on a path glob', () => {
    expect(list(fixture(), { path_glob: 'num*' }).files.map((f) => f.path)).toEqual(['numeracy.md']);
  });
});

describe('globToRegExp', () => {
  it('treats * as one segment and ** as any depth', () => {
    expect(globToRegExp('*.md').test('a.md')).toBe(true);
    expect(globToRegExp('*.md').test('a/b.md')).toBe(false);
    expect(globToRegExp('**/*.md').test('a/b/c.md')).toBe(true);
    expect(globToRegExp('**/*.md').test('c.md')).toBe(true);
    expect(globToRegExp('a?c.md').test('abc.md')).toBe(true);
    expect(globToRegExp('a.(md)').test('a.(md)')).toBe(true);
  });
});
