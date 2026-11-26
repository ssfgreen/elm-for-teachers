import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { docxToBlocks } from '../import/docx';
import { DOC_ID, testBlock, testDoc } from '../test-utils';
import { docToWord, wordBytes } from './docx';

const doc = testDoc({ id: DOC_ID, name: 'Writing lines' });
const snapOf = (blocks: Array<{ type: string; content: string }>) => ({ docs: [doc], blocks: blocks.map((b, i) => testBlock({ id: `01JR0UNDTR1P${String(i).padStart(14, '0')}`, type: b.type as never, content: b.content, order: i })) });
const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const BLOCKS = [
  { type: 'paragraph', content: '**Name:** <line/>' },
  { type: 'numbered_item', content: '1. Why was poor hygiene a problem?\n   <line/>\n   <line/>' },
  { type: 'paragraph', content: 'The old door creaked like <line/>' },
];

describe('writing lines in Word', () => {
  it('writes each as a tab to a right tab stop at the margin with an underline leader', async () => {
    const xml = await (await JSZip.loadAsync(await wordBytes(await docToWord(snapOf(BLOCKS), doc)))).file('word/document.xml')!.async('string');
    expect(xml.match(/<w:tab w:val="right" w:pos="9026" w:leader="underscore"\/>/g)).toHaveLength(3);
    expect(xml.match(/<w:r><w:tab\/><\/w:r>/g)).toHaveLength(4);
    expect(xml).not.toContain('&lt;line/&gt;');
  });

  it('reads them back from the download as <line/>', async () => {
    const back = (await docxToBlocks(toBuffer(await wordBytes(await docToWord(snapOf(BLOCKS), doc))))).blocks;
    expect(back).toEqual(BLOCKS);
  });

  it('leaves a file without writing lines as it was', async () => {
    const back = (await docxToBlocks(toBuffer(await wordBytes(await docToWord(snapOf([{ type: 'paragraph', content: 'Plain text' }]), doc))))).blocks;
    expect(back).toEqual([{ type: 'paragraph', content: 'Plain text' }]);
  });
});
