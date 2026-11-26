import { describe, expect, it } from 'vitest';
import { docToWord, wordBytes } from '../export/docx';
import { DOC_ID, testBlock, testDoc } from '../test-utils';
import { docxToBlocks } from './docx';

const doc = testDoc({ id: DOC_ID, name: 'Header colours' });

async function roundTrip(blocks: Array<{ type: string; content: string }>) {
  const snap = { docs: [doc], blocks: blocks.map((b, i) => testBlock({ id: `01JR0UNDTR1P${String(i).padStart(14, '0')}`, type: b.type as never, content: b.content, order: i })) };
  const bytes = await wordBytes(await docToWord(snap, doc));
  return (await docxToBlocks(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).blocks;
}

describe('a Word upload keeps the header colour of each table', () => {
  it('reads each coloured header row back as its colour, and the usual grey as none', async () => {
    const back = await roundTrip([
      { type: 'table', content: '| A | B |\n| --- | --- |\n| 1 | 2 |\n<!-- header: teal -->' },
      { type: 'paragraph', content: 'Between' },
      { type: 'table', content: '| C | D |\n| --- | --- |\n| 3 | 4 |' },
      { type: 'table', content: '| E | F |\n| --- | --- |\n| 5 | 6 |\n<!-- header: purple -->' },
    ]);
    expect(back.filter((b) => b.type === 'table').map((b) => b.content)).toEqual([
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n<!-- header: teal -->',
      '| C | D |\n| --- | --- |\n| 3 | 4 |',
      '| E | F |\n| --- | --- |\n| 5 | 6 |\n<!-- header: purple -->',
    ]);
  });
});
