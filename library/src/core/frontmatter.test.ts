import { describe, expect, it } from 'vitest';
import { asList, parseFrontmatter, writeFrontmatter } from './frontmatter.js';

describe('frontmatter', () => {
  it('writes lists on one line, leaves out undefined, and reads back the same', () => {
    const data = { title: 'Numeracy and mathematics: experiences and outcomes', fetched_at: '2026-11-08', level: ['Early', 'First'], codes: ['MNU 0-01a'] };
    const text = writeFrontmatter({ ...data, none: undefined }, '# Numeracy');
    expect(text).toBe(
      '---\ntitle: "Numeracy and mathematics: experiences and outcomes"\nfetched_at: 2026-11-08\nlevel: [Early, First]\ncodes: [MNU 0-01a]\n---\n\n# Numeracy\n',
    );
    expect(parseFrontmatter(text)).toEqual({ data, body: '\n# Numeracy\n' });
  });

  it('reads a file without frontmatter as all body', () => {
    expect(parseFrontmatter('# Just text\n')).toEqual({ data: {}, body: '# Just text\n' });
  });

  it('turns a field into a list', () => {
    expect(asList(undefined)).toEqual([]);
    expect(asList('Early')).toEqual(['Early']);
    expect(asList(['Early', 2])).toEqual(['Early', '2']);
  });
});
