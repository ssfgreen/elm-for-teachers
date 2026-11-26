import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fileParts } from './convert.js';
import { docxToMarkdown, pptxToMarkdown, unzipSome } from './office.js';
import { fileDocs } from '../trails/files.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (text: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const docx = (...ps: string[]) => zipSync({ 'word/document.xml': strToU8(`<w:document ${W}><w:body>${ps.join('')}</w:body></w:document>`) });
const slide = (...ps: string[]) => strToU8(`<p:sld><p:cSld><p:spTree>${ps.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`);

describe('linked files', () => {
  it('reads a Word file: paragraphs in order, headings as headings, runs joined, entities decoded', () => {
    const bytes = docx(para('Lesson 1', 'Heading1'), '<w:p><w:r><w:t>AI &amp; </w:t></w:r><w:r><w:t>you</w:t></w:r></w:p>', para('  '), para('Ask: what is a model?'));
    expect(docxToMarkdown(bytes)).toBe('## Lesson 1\n\nAI & you\n\nAsk: what is a model?');
  });

  it('reads slides in number order (10 after 2), with their notes, and leaves out the notes page number', () => {
    const bytes = zipSync({
      'ppt/slides/slide10.xml': slide('Last'),
      'ppt/slides/slide2.xml': slide('Second', 'Point'),
      'ppt/slides/slide1.xml': slide('Title'),
      'ppt/notesSlides/notesSlide2.xml': slide('Ask the class first.', '2'),
      'ppt/media/image1.png': new Uint8Array([1, 2, 3]),
    });
    expect(pptxToMarkdown(bytes)).toBe('## Slide 1\n\nTitle\n\n## Slide 2\n\nSecond\n\nPoint\n\n**Notes:** Ask the class first.\n\n## Slide 10\n\nLast');
  });

  it('opens a zip: each Word, PowerPoint or PDF inside, not Mac metadata, images or folders', async () => {
    const zip = zipSync({
      'Lesson 1/Guide.docx': docx(para('Guide text')),
      'Lesson 1/Slides.pptx': zipSync({ 'ppt/slides/slide1.xml': slide('Hello') }),
      '__MACOSX/Lesson 1/._Guide.docx': new Uint8Array([0]),
      'Lesson 1/photo.jpg': new Uint8Array([0]),
    });
    const parts = await fileParts('Lesson-1.zip', zip);
    expect(parts.map((p) => [p.name, p.format, p.markdown])).toEqual([
      ['Lesson 1/Guide.docx', 'docx', 'Guide text'],
      ['Lesson 1/Slides.pptx', 'pptx', '## Slide 1\n\nHello'],
    ]);
  });

  it('skips files it cannot read, and refuses a file that is not what its name says', async () => {
    expect(await fileParts('photo.jpg', new Uint8Array([0]))).toEqual([]);
    expect(() => docxToMarkdown(zipSync({ 'other.xml': strToU8('<x/>') }))).toThrow(/not a Word document/);
  });

  it('refuses a part that would unpack too large, before unpacking it', () => {
    const big = zipSync({ 'word/document.xml': new Uint8Array(51_000_000) }, { level: 9 });
    expect(() => unzipSome(big, () => true)).toThrow(/would unpack to/);
  });
});

describe('TRAILS files', () => {
  const of = { kind: 'file' as const, text: 'Lesson slides', resource: { id: 28, slug: 'how-ai-influences-you', link: 'https://trails.scot/resource/how-ai-influences-you/', title: 'How AI influences you', areas: ['Technologies'], levels: ['Third'], topics: ['Digital Literacy'] } };
  const meta = { licence: 'All rights reserved', fetchedOn: '2026-11-08', sha256: 'abc' };

  it("files a download under its resource, with the resource's subject and level, titled by its link", async () => {
    const pptx = zipSync({ 'ppt/slides/slide1.xml': slide('What is AI?') });
    const [doc] = await fileDocs('https://trails.scot/wp-content/uploads/2025/01/AI-01-Slides.pptx', of, pptx, meta);
    expect(doc!.path).toBe('files/how-ai-influences-you/ai-01-slides.pptx.md');
    expect(doc!.content).toContain('title: Lesson slides');
    expect(doc!.content).toContain('level: [Third]');
    expect(doc!.content).toContain('From the TRAILS resource [How AI influences you](https://trails.scot/resource/how-ai-influences-you/) (PPTX).');
    expect(doc!.content).toContain('## Slide 1\n\nWhat is AI?');
  });

  it('gives each file in a zip its own document, titled by its name', async () => {
    const zip = zipSync({ 'Topic 1/Teacher_Guide.docx': docx(para('Read this first')), 'Topic 1/Teacher_Guide.pdf': new Uint8Array(0), '1. How AI influences you/Slides.pptx': zipSync({ 'ppt/slides/slide1.xml': slide('Hi') }) });
    // The empty PDF cannot be read: it is skipped, and the rest are kept.
    const docs = await fileDocs('https://trails.scot/wp-content/uploads/2026/08/1.-How-AI-influences-you.zip', of, zip, meta);
    expect(docs).toHaveLength(2);
    const [slides, doc] = docs;
    // A folder named like the zip is left out; the format is in the name.
    expect(slides!.path).toBe('files/how-ai-influences-you/1-how-ai-influences-you/slides.pptx.md');
    expect(doc!.path).toBe('files/how-ai-influences-you/1-how-ai-influences-you/topic-1/teacher-guide.docx.md');
    expect(doc!.content).toContain('title: Teacher Guide');
    expect(doc!.content).toContain('in_zip: Topic 1/Teacher_Guide.docx');
  });

  it('fails a zip only when nothing in it can be read', async () => {
    await expect(fileParts('broken.zip', zipSync({ 'a.pdf': new Uint8Array(0) }))).rejects.toThrow(/nothing in the zip could be read/);
  });
});
