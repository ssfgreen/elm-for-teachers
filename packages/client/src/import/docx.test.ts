import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { docNameFromFile, docxToBlocks } from './docx';
import { isOldList, joinRuns } from '@edw/shared';

/** The three sample documents Sam supplied (fictional class materials). */
const FIXTURES = join(__dirname, '../../../../fixtures/docx');
async function load(name: string) {
  const buf = readFileSync(join(FIXTURES, name));
  return docxToBlocks(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const types = (blocks: { type: string }[]) => blocks.map((b) => b.type);

describe('docxToBlocks', () => {
  it('imports the P7 homework: headings, the Remember box, the tick table, lists that carry on numbering, the answers', async () => {
    const { blocks: items, warnings } = await load('P7 Similes and Metaphors Homework.docx');
    expect(warnings).toEqual([]);
    // Each list item is its own block (PLAN.md section 6); joined back into lists here to check them whole.
    expect(items.some((b) => isOldList(b.type))).toBe(false);
    const blocks = joinRuns(items);
    expect(types(blocks)).toEqual([
      'heading', 'paragraph', 'paragraph', 'paragraph', 'quote', 'heading', 'paragraph', 'table', 'heading', 'paragraph', 'paragraph',
      'numbered_list', 'paragraph', 'numbered_list', 'heading', 'paragraph', 'numbered_list', 'paragraph', 'paragraph',
    ]);
    expect(blocks[0]!.content).toBe('# Similes and Metaphors');
    expect(blocks[1]!.content).toBe('**Name:** ______________ **Date:** __________ **Class:** P7');
    expect(blocks[2]!.content).toBe('*Primary 7 English Homework | About 10 minutes*');
    expect(blocks[4]!.content.split('\n')).toHaveLength(3);
    expect(blocks[4]!.content.split('\n')[0]).toBe('> **Remember!**');
    expect(blocks[5]!.content).toBe('## Task 1: Simile or metaphor? *(5 minutes)*');
    const table = blocks[7]!.content.split('\n');
    expect(table[0]).toBe('|  | Sentence | Simile | Metaphor |');
    expect(table[1]).toBe('| --- | --- | --- | --- |');
    expect(table[2]).toBe('| 1 | The classroom was a zoo after the bell rang. | ☐ | ☐ |');
    expect(table).toHaveLength(9);
    // Word's numbering carries on: the metaphor sentences are 3 and 4, the answers start again at 1.
    expect(blocks[11]!.content).toMatch(/^1\. The old door creaked like _+\n2\. After football practice/);
    expect(blocks[13]!.content).toMatch(/^3\. On Monday morning, my classroom is a _+\n4\. The thunderstorm/);
    expect(blocks[16]!.content.split('\n')).toEqual(['1. Metaphor', '2. Simile', '3. Metaphor', '4. Simile', '5. Simile', '6. Metaphor', '7. Metaphor']);
  });

  it('imports the S1 sources homework, keeping the empty answer lines and question 2', async () => {
    const blocks = joinRuns((await load('S1 Bannockburn Sources Homework.docx')).blocks);
    expect(blocks[0]!.content).toBe('# Bannockburn: What Can the Sources Tell Us?');
    expect(blocks[4]!.type).toBe('quote');
    expect(blocks[4]!.content.split('\n').map((l) => l.slice(0, 18))).toEqual(['> **Background**', '> In June 1314 Rob', '> **Remember!**', '> A **primary sour', '> A **secondary so']);
    const task2 = blocks.slice(9, 15).map((b) => [b.type, b.content.slice(0, 20)]);
    expect(task2).toEqual([
      ['numbered_list', '1. Why might the Dec'],
      ['paragraph', ''],
      ['paragraph', ''],
      ['numbered_list', '2. Give one reason t'],
      ['paragraph', ''],
      ['paragraph', ''],
    ]);
    expect(blocks[7]!.content.split('\n')).toHaveLength(8);
  });

  it('imports the class register: two tables, every pupil row and the notes', async () => {
    const { blocks } = await load('SEEMiS Class Register P7A.docx');
    expect(types(blocks)).toEqual(['heading', 'table', 'heading', 'table', 'paragraph']);
    const details = blocks[1]!.content.split('\n');
    expect(details).toContain('| School | Braeside Primary School |');
    const pupils = blocks[3]!.content.split('\n');
    expect(pupils[0]).toBe('| No. | Pupil name | SCN | Date of birth | Most recent grade (A to E) | ASN | Notes and key requirements |');
    // The header row, its separator, and 20 pupils.
    expect(pupils).toHaveLength(22);
    expect(pupils[4]).toMatch(/^\| 3 \| Callum Reid \| 021935433 \| 21\/06\/2015 \| C \| Dyslexia \| Needs amber reading overlay/);
    expect(blocks[4]!.content).toMatch(/^Grade column shows/);
  });

  it('turns page breaks into blocks: on their own line, at the start of a heading, or mid-paragraph', async () => {
    const { Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } = await import('docx');
    const word = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun('One')] }),
            new Paragraph({ children: [new PageBreak()] }),
            new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new PageBreak(), new TextRun('Two')] }),
            new Paragraph({ children: [new TextRun({ text: 'before', bold: true }), new PageBreak(), new TextRun({ text: 'after', bold: true })] }),
            new Paragraph({ children: [] }),
          ],
        },
      ],
    });
    const buf = await Packer.toBuffer(word);
    const { blocks } = await docxToBlocks(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(blocks).toEqual([
      { type: 'paragraph', content: 'One' },
      { type: 'page_break', content: '' },
      { type: 'page_break', content: '' },
      { type: 'heading', content: '## Two' },
      { type: 'paragraph', content: '**before**' },
      { type: 'page_break', content: '' },
      { type: 'paragraph', content: '**after**' },
      // An empty paragraph with no break in it stays: it is answer space.
      { type: 'paragraph', content: '' },
    ]);
  });

  it('names the doc after the file', () => {
    expect(docNameFromFile('P7 Similes and Metaphors Homework.docx')).toBe('P7 Similes and Metaphors Homework');
    expect(docNameFromFile('.DOCX')).toBe('Imported document');
  });
});
