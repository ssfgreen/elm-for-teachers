import { describe, expect, it } from 'vitest';
import { describeEdits, excerpt } from './describe-edits.js';

const blocks = [
  { id: 'B1', type: 'paragraph' as const, content: 'Read each sentence.' },
  { id: 'B2', type: 'image' as const, content: '![a dog](arasaac:1)' },
];

describe('describeEdits', () => {
  it('says what each operation does in plain words', () => {
    const lines = describeEdits(
      [
        { op: 'replace', id: 'B1', content: 'Look at each picture and read the sentence.' },
        { op: 'insert', after: 'B1', type: 'numbered_item', content: '1. The classroom was a zoo after the bell rang.' },
        { op: 'insert', after: 'B1', type: 'image', content: '![a zoo](arasaac:4773)' },
        { op: 'insert', after: 'B1', type: 'paragraph', content: '☐ Simile     ☐ Metaphor' },
        { op: 'delete', id: 'B2' },
        { op: 'set_style', font: 'comic_sans', background: 'cream' },
        { op: 'create_doc', temp_id: 'd', name: 'Answers' },
      ],
      [],
      blocks,
    );
    expect(lines).toEqual([
      'Rewrote “Read each sentence.” as “Look at each picture and read the sentence.”',
      'Added a numbered item: “The classroom was a zoo after the bell rang.”',
      'Added a picture of a zoo',
      'Added a paragraph: “☐ Simile ☐ Metaphor”',
      'Removed the picture of a dog',
      'Set the font to comic sans and the page colour to cream',
      'Started a new document, “Answers”',
    ]);
  });

  it('marks dropped operations and says why', () => {
    const lines = describeEdits([{ op: 'delete', id: 'B1' }, { op: 'move', id: 'NOPE', after: 'start' }], [{ index: 1, reason: 'unknown_block_id' }], blocks);
    expect(lines[1]).toBe('Not made: moved a part of the document (it named a part of the document that is not there)');
  });

  it('finds blocks named by a temp_id from the same call', () => {
    const lines = describeEdits([{ op: 'insert', after: 'start', type: 'heading', content: '# Similes', temp_id: 'h' }, { op: 'move', id: 'h', after: 'B1' }], [], blocks);
    expect(lines[1]).toBe('Moved “Similes”');
  });

  it('copes with operations that are not objects', () => {
    expect(describeEdits([null, 'x'], [], [])).toEqual(['Made a change it could not describe', 'Made a change it could not describe']);
  });
});

describe('excerpt', () => {
  it('shortens long text to one line', () => {
    expect(excerpt('a '.repeat(50), 10)).toBe('a a a a a…');
  });
});

describe('describeEdits for a copy', () => {
  it('says which document was copied, and names a copied block by its text', () => {
    const docs = [{ id: 'D1', name: 'Bannockburn sources' }];
    expect(
      describeEdits(
        [
          { op: 'create_doc', temp_id: 'c', name: 'Bannockburn (Comic Sans)', copy_of: 'D1' },
          { op: 'replace', id: 'c/B1', content: 'Read each source.' },
        ],
        [],
        blocks,
        docs,
      ),
    ).toEqual(['Copied “Bannockburn sources” as “Bannockburn (Comic Sans)”', 'Rewrote “Read each sentence.” as “Read each source.”']);
  });
});
