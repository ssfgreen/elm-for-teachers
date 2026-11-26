import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { convertReference, PPTX_MIME, ReferenceFileError, referenceMimeOf } from './reference.js';
import { pptxSlideTexts } from './pptx.js';

vi.mock('./pdf', () => ({
  pdfPageTexts: vi.fn(async (data: ArrayBuffer) => {
    const text = new TextDecoder().decode(data);
    if (text.startsWith('BROKEN')) throw new Error('Invalid PDF structure');
    return ['Curriculum for Excellence: Sciences', '', 'Second level: forces'];
  }),
}));

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const slideXml = (...paras: string[]) => `<p:sld ${A} xmlns:p="p"><p:cSld><p:spTree>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`;
/** A small .pptx: slides 1, 2 and 10 (so numeric order matters), notes on slide 2. */
async function pptxBytes(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', slideXml('Forces', 'Year 6, autumn term'));
  zip.file('ppt/slides/slide2.xml', slideXml('Friction &amp; grip', 'Rough surfaces grip'));
  zip.file('ppt/slides/slide10.xml', slideXml('Review'));
  zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships><Relationship Id="r1" Target="../notesSlides/notesSlide7.xml"/></Relationships>');
  zip.file('ppt/notesSlides/notesSlide7.xml', `<p:notes ${A} xmlns:p="p">${['Ask who has slipped on ice.', '2'].map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:notes>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}
const pptx = async () => new File([await pptxBytes()], 'Forces.pptx');
import { DOCX_MIME } from './docx.js';

describe('referenceMimeOf', () => {
  it('goes by the extension first, since browsers often give .md no type', () => {
    expect(referenceMimeOf({ name: 'Notes.md', type: '' })).toBe('text/markdown');
    expect(referenceMimeOf({ name: 'Plan.DOCX', type: '' })).toBe(DOCX_MIME);
    expect(referenceMimeOf({ name: 'a.txt', type: 'text/plain' })).toBe('text/plain');
    expect(referenceMimeOf({ name: 'scan.pdf', type: '' })).toBe('application/pdf');
    expect(referenceMimeOf({ name: 'Slides.pptx', type: '' })).toBe(PPTX_MIME);
    expect(referenceMimeOf({ name: 'photo.jpg', type: 'image/jpeg' })).toBeNull();
  });
});

describe('convertReference', () => {
  it('cuts a long text file into pages at paragraph breaks', async () => {
    const paras = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${'Some words here. '.repeat(12)}`);
    const { mime, pages } = await convertReference(new File([paras.join('\n\n\n\n')], 'Notes.txt', { type: 'text/plain' }));
    expect(mime).toBe('text/plain');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.startsWith('Paragraph') && p.length <= 5000)).toBe(true);
    // Nothing lost but whitespace.
    const words = (t: string) => t.replace(/\s+/g, ' ').trim();
    expect(words(pages.join(' '))).toBe(words(paras.join(' ')));
  });

  it('sends one empty page for a file with no text, for the server to refuse', async () => {
    expect((await convertReference(new File(['  \n'], 'blank.md'))).pages).toEqual(['']);
  });

  it('keeps a PDF\'s own pages (blank ones too), and says so when it cannot be read', async () => {
    expect(await convertReference(new File(['%PDF'], 'Curriculum.pdf'))).toEqual({ mime: 'application/pdf', pages: ['Curriculum for Excellence: Sciences', '', 'Second level: forces'] });
    await expect(convertReference(new File(['BROKEN'], 'Past paper.pdf'))).rejects.toThrow(/could not be read/);
  });

  it('reads a PowerPoint file a page per slide, in slide order, with the speaker notes', async () => {
    const pages = await pptxSlideTexts(await pptxBytes());
    expect(pages).toEqual(['Slide 1\nForces\nYear 6, autumn term', 'Slide 2\nFriction & grip\nRough surfaces grip\n\nSpeaker notes:\nAsk who has slipped on ice.', 'Slide 3\nReview']);
    expect((await convertReference(await pptx())).mime).toBe(PPTX_MIME);
  });

  it('reads a Word file as "Upload .docx" does: the text keeps its table and lists, and the blocks go with it', async () => {
    const buf = readFileSync(join(__dirname, '../../../../fixtures/docx/P7 Similes and Metaphors Homework.docx'));
    const file = new File([buf], 'P7 Similes and Metaphors Homework.docx');
    const { mime, pages, blocks } = await convertReference(file);
    const text = pages.join('\n\n');
    expect(mime).toBe(DOCX_MIME);
    expect(blocks!.map((b) => b.type)).toContain('table');
    // A block per list item; the text reads each run as one list.
    expect(blocks!.some((b) => b.type === 'numbered_item')).toBe(true);
    expect(text).toMatch(/^1\. The old door creaked like _+\n2\. After football practice/m);
    expect(text).toContain('| --- | --- | --- | --- |');
    expect(text).toContain('# Similes and Metaphors');
  });

  it('refuses another type, or an old Office file, with a message for the teacher', async () => {
    await expect(convertReference(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toBeInstanceOf(ReferenceFileError);
    await expect(convertReference(new File(['x'], 'Old slides.ppt'))).rejects.toThrow(/older PowerPoint file\. Save it as \.pptx/);
  });
});
