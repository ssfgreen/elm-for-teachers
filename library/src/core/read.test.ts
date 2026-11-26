import { describe, expect, it } from 'vitest';
import { LibraryError } from './errors.js';
import { read } from './read.js';
import { fixture } from './test-fixture.js';

describe('read', () => {
  it('reads a range of lines with the document details', () => {
    const r = read(fixture(), { path: 'literacy.md', from_line: 2, max_lines: 1 });
    expect(r).toEqual({
      path: 'literacy.md',
      title: 'Literacy and English: experiences and outcomes',
      source_url: 'https://example.org/literacy.pdf',
      licence: 'OGL-UK-3.0',
      from_line: 2,
      to_line: 2,
      total_lines: 5,
      text: '# Literacy and English: experiences and outcomes',
    });
  });

  it('reads to the end when fewer lines are left', () => {
    const r = read(fixture(), { path: 'literacy.md', from_line: 4 });
    expect(r.to_line).toBe(5);
    expect(r.text.split('\n')).toHaveLength(2);
  });

  it('is a 404 for a missing path and a 400 for a bad range', () => {
    const status = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as LibraryError).status;
      }
      return 200;
    };
    expect(status(() => read(fixture(), { path: 'nope.md' }))).toBe(404);
    expect(status(() => read(fixture(), { path: 'literacy.md', from_line: 0 }))).toBe(400);
    expect(status(() => read(fixture(), { path: 'literacy.md', from_line: 99 }))).toBe(400);
    expect(status(() => read(fixture(), { path: 'literacy.md', max_lines: 501 }))).toBe(400);
  });
});
