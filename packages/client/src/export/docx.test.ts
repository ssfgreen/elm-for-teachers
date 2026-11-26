import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { docxToBlocks } from '../import/docx';
import { DOC_ID, testBlock, testDoc } from '../test-utils';
import type { CanvasSnapshot } from '../editor/types.js';
import { docToWord, wordBytes } from './docx';

const FIXTURES = join(__dirname, '../../../../fixtures/docx');
const doc = testDoc({ id: DOC_ID, name: 'Round trip' });
const asArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Blocks as the editor would hold them for an imported file. */
function snapOf(blocks: Array<{ type: string; content: string }>): CanvasSnapshot {
  return {
    docs: [doc],
    blocks: blocks.map((b, i) => testBlock({ id: `01JR0UNDTR1P${String(i).padStart(14, '0')}`, type: b.type as never, content: b.content, order: i })),
  };
}
async function roundTrip(snap: CanvasSnapshot) {
  const bytes = await wordBytes(await docToWord(snap, doc));
  return (await docxToBlocks(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).blocks;
}

describe('docToWord', () => {
  for (const name of ['P7 Similes and Metaphors Homework.docx', 'S1 Bannockburn Sources Homework.docx', 'SEEMiS Class Register P7A.docx']) {
    it(`writes ${name} back to Word without losing anything the upload reads`, async () => {
      const imported = (await docxToBlocks(asArrayBuffer(readFileSync(join(FIXTURES, name))))).blocks;
      expect(await roundTrip(snapOf(imported))).toEqual(imported);
    });
  }

  it('keeps marks, line breaks, list starts, checklists, code and table widths; leaves out suggestions', async () => {
    const snap = snapOf([
      { type: 'heading', content: '### Small heading' },
      { type: 'paragraph', content: 'Write your own:\n**bold** *italic* <u>under</u> `code`' },
      { type: 'numbered_list', content: '3. Third\n   answer line\n4. Fourth' },
      { type: 'bullet_list', content: '- one\n- two' },
      { type: 'table', content: '| A | B |\n| --- | --- |\n| 1 | 2 |\n<!-- colwidths: 120 0 -->' },
    ]);
    snap.blocks.push(testBlock({ id: '01JR0UNDTR1PPR0P0SED00000X', content: 'Not accepted', status: 'proposed', order: 9 }));
    snap.blocks.push(testBlock({ id: '01JR0UNDTR1PPEND1NG000000Y', content: 'Kept', pending: { op: 'replace', turn_id: 't', content: 'Replacement' }, order: 10 }));
    const back = await roundTrip(snap);
    expect(back).toEqual([
      { type: 'heading', content: '### Small heading' },
      { type: 'paragraph', content: 'Write your own:\n**bold** *italic* <u>under</u> `code`' },
      // An older whole-list block is still written; it reads back as a block per item.
      { type: 'numbered_item', content: '3. Third\n   answer line' },
      { type: 'numbered_item', content: '4. Fourth' },
      { type: 'bullet_item', content: '- one' },
      { type: 'bullet_item', content: '- two' },
      { type: 'table', content: '| A | B |\n| --- | --- |\n| 1 | 2 |' },
      { type: 'paragraph', content: 'Kept' },
    ]);
  });

  it('shades a coloured header row with a light tint of its colour, and the usual grey otherwise', async () => {
    const xmlOf = async (content: string) => (await JSZip.loadAsync(await wordBytes(await docToWord(snapOf([{ type: 'table', content }]), doc)))).file('word/document.xml')!.async('string');
    const fills = (xml: string) => [...xml.matchAll(/w:fill="([0-9A-F]{6})"/g)].map((m) => m[1]);
    expect(fills(await xmlOf('| A | B |\n| --- | --- |\n| 1 | 2 |\n<!-- header: blue -->'))).toEqual(['D1E5F4', 'D1E5F4']);
    expect(fills(await xmlOf('| A | B |\n| --- | --- |\n| 1 | 2 |'))).toEqual(['F3F3F3', 'F3F3F3']);
  });

  it('writes a run of list item blocks as one Word list, keeping where it starts, and reads it back as items', async () => {
    const blocks = [
      { type: 'numbered_item', content: '3. Third\n   answer line' },
      { type: 'numbered_item', content: '1. Fourth' },
      { type: 'paragraph', content: 'Between' },
      { type: 'bullet_item', content: '- one' },
      { type: 'bullet_item', content: '- two' },
      { type: 'checklist_item', content: '- [x] done' },
    ];
    const xml = await (await JSZip.loadAsync(await wordBytes(await docToWord(snapOf(blocks), doc)))).file('word/document.xml')!.async('string');
    // The two numbered items share one numbering instance: one list.
    expect(new Set([...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1])).size).toBe(2);
    expect(await roundTrip(snapOf(blocks))).toEqual([{ ...blocks[0] }, { type: 'numbered_item', content: '4. Fourth' }, ...blocks.slice(2, 5), { type: 'paragraph', content: '☒ done' }]);
  });

  it('writes a page break as Word\'s own, on an A4 page, and reads it back', async () => {
    const blocks = [
      { type: 'paragraph', content: 'Questions' },
      { type: 'page_break', content: '' },
      { type: 'heading', content: '## Answers' },
    ];
    const bytes = await wordBytes(await docToWord(snapOf(blocks), doc));
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(xml).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
    expect(await roundTrip(snapOf(blocks))).toEqual(blocks);
  });

  it('shades the header row, as the editor does, and only the header row', async () => {
    const blocks = [{ type: 'table', content: '| A | B |\n| --- | --- |\n| 1 | 2 |' }];
    const bytes = await wordBytes(await docToWord(snapOf(blocks), doc));
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    const rows = xml.split('<w:tr>').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.match(/<w:shd [^>]*w:fill="F3F3F3"/g)).toHaveLength(2);
    expect(rows[1]).not.toContain('<w:shd');
    expect(await roundTrip(snapOf(blocks))).toEqual(blocks);
  });

  it("sets the whole file in the doc's font, on its page colour", async () => {
    const styled = { ...doc, style: { font: 'lexend' as const, background: 'cream' as const } };
    const zip = await JSZip.loadAsync(await wordBytes(await docToWord(snapOf([{ type: 'paragraph', content: 'Hello' }]), styled)));
    const xml = await zip.file('word/document.xml')!.async('string');
    const theme = await zip.file('word/theme/theme1.xml')!.async('string');
    expect(xml).toMatch(/<w:background w:color="FBF3DB"/);
    expect(await zip.file('word/settings.xml')!.async('string')).toContain('<w:displayBackgroundShape/>');
    expect(theme).toMatch(/<a:majorFont>\s*<a:latin typeface="Lexend"/);
    expect(theme).toMatch(/<a:minorFont>\s*<a:latin typeface="Lexend"/);
    // The default: Calibri, a white page.
    const plain = await JSZip.loadAsync(await wordBytes(await docToWord(snapOf([{ type: 'paragraph', content: 'Hello' }]), doc)));
    expect(await plain.file('word/document.xml')!.async('string')).not.toContain('<w:background');
    expect(await plain.file('word/theme/theme1.xml')!.async('string')).toMatch(/<a:minorFont>\s*<a:latin typeface="Calibri"/);
  });

  it('keeps text colours, highlight and links through Word and back', async () => {
    const blocks = [
      { type: 'paragraph', content: 'The <span data-color="red">sun</span> was <mark>a golden coin</mark>. See [the guide](https://example.org/similes) or [email](mailto:office@school.example).' },
      { type: 'bullet_item', content: '- <span data-color="teal">**teal and bold**</span>' },
      { type: 'bullet_item', content: '- <span data-color="purple">purple</span> <span data-color="yellow">yellow</span> <span data-color="green">green</span> <span data-color="blue">blue</span>' },
    ];
    const zip = await JSZip.loadAsync(await wordBytes(await docToWord(snapOf(blocks), doc)));
    const xml = await zip.file('word/document.xml')!.async('string');
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain('<w:rStyle w:val="TextRed"/>');
    expect(styles).toMatch(/w:styleId="TextRed"[\s\S]*?<w:color w:val="C00000"\/>/);
    expect(xml).toMatch(/<w:hyperlink [^>]*r:id=/);
    expect(await roundTrip(snapOf(blocks))).toEqual(blocks);
  });

  it('writes a font set on part of the text as that run\'s font', async () => {
    const blocks = [{ type: 'paragraph', content: 'Plain and <span data-font="georgia">Georgia</span>.' }];
    const xml = await (await JSZip.loadAsync(await wordBytes(await docToWord(snapOf(blocks), doc)))).file('word/document.xml')!.async('string');
    expect(xml).toMatch(/<w:rFonts w:ascii="Georgia"[^>]*\/>[\s\S]*?<w:t[^>]*>Georgia<\/w:t>/);
    expect(xml.match(/w:ascii="Georgia"/g)).toHaveLength(1);
  });

  it('writes a size set on part of the text as that run\'s size, in half-points', async () => {
    const blocks = [{ type: 'paragraph', content: 'Plain and <span data-size="large">large</span>.' }];
    const xml = await (await JSZip.loadAsync(await wordBytes(await docToWord(snapOf(blocks), doc)))).file('word/document.xml')!.async('string');
    expect(xml).toMatch(/<w:sz w:val="28"\/>[\s\S]*?<w:t[^>]*>large<\/w:t>/);
    expect(xml.match(/<w:sz w:val=/g)).toHaveLength(1);
  });

  it("looks like a file made in Word: theme fonts (Calibri, the app's default), 12pt body, Word's heading spacing", async () => {
    const zip = await JSZip.loadAsync(await wordBytes(await docToWord(snapOf([{ type: 'heading', content: '# Title' }]), doc)));
    const styles = await zip.file('word/styles.xml')!.async('string');
    const theme = await zip.file('word/theme/theme1.xml')!.async('string');
    const docDefaults = styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)![0];
    expect(docDefaults).toContain('w:asciiTheme="minorHAnsi"');
    expect(docDefaults).toContain('<w:sz w:val="24"/>');
    expect(docDefaults).not.toContain('Calibri');
    const h1 = styles.match(/<w:style\b[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)![0];
    expect(h1).toContain('<w:spacing w:before="360" w:after="80"/>');
    expect(h1).toContain('<w:keepNext/>');
    expect(h1).toContain('w:asciiTheme="majorHAnsi"');
    expect(h1).toContain('<w:sz w:val="40"/>');
    expect(styles.match(/w:styleId="Heading1"/g)).toHaveLength(1);
    expect(styles).toContain('w:styleId="Heading2"');
    // Headings too: the layout check measures both in Calibri's widths.
    expect(theme).toMatch(/<a:majorFont>\s*<a:latin typeface="Calibri"/);
    expect(theme).toMatch(/<a:minorFont>\s*<a:latin typeface="Calibri"/);
  });

  it('spaces a worksheet for reading and writing: 1.15 lines and 8pt after; list items 4pt apart; none in table cells and code', async () => {
    const snap = snapOf([
      { type: 'paragraph', content: 'Read the passage.' },
      { type: 'numbered_item', content: '1. First question' },
      { type: 'numbered_item', content: '2. Second question' },
      { type: 'bullet_item', content: '- A note' },
      { type: 'table', content: '| A | B |\n| 1 | 2 |' },
      { type: 'code_block', content: '```\nline one\nline two\n```' },
    ]);
    const zip = await JSZip.loadAsync(await wordBytes(await docToWord(snap, doc)));
    const docDefaults = (await zip.file('word/styles.xml')!.async('string')).match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)![0];
    expect(docDefaults).toContain('<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>');
    const body = await zip.file('word/document.xml')!.async('string');
    const para = (text: string) => body.match(new RegExp(`<w:p>(?:(?!<w:p>)[\\s\\S])*?${text}[\\s\\S]*?</w:p>`))![0];
    const after = (text: string) => /<w:spacing[^>]*w:after="(\d+)"/.exec(para(text))?.[1] ?? 'default';
    expect(after('Read the passage')).toBe('default');
    expect(after('First question')).toBe('80');
    // The last item of a list has the usual gap after it, as does a one-item list.
    expect(after('Second question')).toBe('default');
    expect(after('A note')).toBe('default');
    for (const t of ['>A<', '>1<', 'line one', 'line two']) expect([t, after(t)]).toEqual([t, '0']);
  });
});
