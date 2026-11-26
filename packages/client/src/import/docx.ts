/**
 * Word (.docx) to blocks, in the browser. mammoth turns the document into HTML (headings
 * by style, lists, tables, bold, italic, underline, line breaks, images); the editor's
 * own schema then reads that HTML, so every block comes out exactly as the editor would
 * write it (see ../editor/markdown.ts).
 *
 * mammoth does not keep where a numbered list starts, so the numbering is read from the
 * docx itself: Word continues a list's count across interruptions when the paragraphs
 * share a numbering id, and restarts it where a startOverride says so. A teacher's
 * "3. On Monday morning ..." stays item 3.
 *
 * mammoth leaves cell shading out, so each table's header colour is read from the file too
 * (tableHeaders.ts).
 *
 * A page break (Ctrl+Enter in Word) becomes a page break block. mammoth puts it inside the
 * paragraph it sits in, so that paragraph is split there; the part that held only the break is
 * dropped (Word's own empty line, not answer space). A break inside a list, quote or table is left out.
 *
 * This only makes a doc from the file; documents given to the model as context are a
 * separate feature.
 */
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { isOldList, splitList, type BlockType } from '@edw/shared';
import { canvasSchema } from '../editor/extensions/index.js';
import { blockTypeOf, nodeToContent } from '../editor/markdown.js';
import { TEXT_COLORS, wordColorStyleName } from '../editor/textColors.js';
import { tableHeaderColours, withHeaderColour } from './tableHeaders.js';
import { markWritingLines, placeWritingLines } from './writingLines.js';

export interface ImportedBlock {
  type: BlockType;
  content: string;
}

export interface DocxImport {
  blocks: ImportedBlock[];
  /** What mammoth could not carry over (unknown styles and the like). */
  warnings: string[];
}

export interface DocxOptions {
  /** Stores an embedded image; the block refers to it as `asset:<id>`. Without it, images are left out. */
  uploadImage?: (file: File) => Promise<{ asset_id: string }>;
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_DOCX_BYTES = 15 * 1024 * 1024;

/** The class mammoth gives a page break, until splitPageBreaks turns it into a block. */
const PAGE_BREAK_MARK = 'edw-page-break';

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  // The editor has three heading levels.
  "p[style-name='heading 4'] => h3:fresh",
  "p[style-name='heading 5'] => h3:fresh",
  "p[style-name='heading 6'] => h3:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  // Written by the .docx download for header cells (bold by style).
  "p[style-name='Table Heading'] => p:fresh",
  "r[style-name='Inline Code'] => code",
  // Written by the .docx download: each text colour is a character style; Word's yellow highlight.
  ...TEXT_COLORS.map((c) => `r[style-name='${wordColorStyleName(c)}'] => span.edw-color-${c}`),
  "highlight[color='yellow'] => mark",
  'u => u',
  `br[type='page'] => hr.${PAGE_BREAK_MARK}`,
];

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const wAttr = (el: Element | null | undefined, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
const child = (el: Element, name: string) => Array.from(el.children).find((c) => c.localName === name) ?? null;

/**
 * The start number of each top-level numbered list, in document order, as Word shows it.
 * Null when the numbering cannot be read (the lists then start at 1).
 */
export async function listStarts(zip: JSZip): Promise<number[] | null> {
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) return null;
  const numXml = await zip.file('word/numbering.xml')?.async('string');
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

  // numId -> { abstract id, start overrides per level }; abstract id -> level -> { start, ordered }
  const nums = new Map<string, { abstract: string; overrides: Map<string, number> }>();
  const abstracts = new Map<string, Map<string, { start: number; ordered: boolean }>>();
  if (numXml) {
    const n = parse(numXml);
    for (const a of Array.from(n.getElementsByTagNameNS(W, 'abstractNum'))) {
      const levels = new Map<string, { start: number; ordered: boolean }>();
      for (const lvl of Array.from(a.getElementsByTagNameNS(W, 'lvl'))) {
        const start = Number(wAttr(child(lvl, 'start'), 'val') ?? 1);
        const fmt = wAttr(child(lvl, 'numFmt'), 'val') ?? 'decimal';
        levels.set(wAttr(lvl, 'ilvl') ?? '0', { start, ordered: fmt !== 'bullet' && fmt !== 'none' });
      }
      abstracts.set(wAttr(a, 'abstractNumId') ?? '', levels);
    }
    for (const num of Array.from(n.getElementsByTagNameNS(W, 'num'))) {
      const overrides = new Map<string, number>();
      for (const o of Array.from(num.getElementsByTagNameNS(W, 'lvlOverride'))) {
        const s = wAttr(child(o, 'startOverride'), 'val');
        if (s !== null) overrides.set(wAttr(o, 'ilvl') ?? '0', Number(s));
      }
      nums.set(wAttr(num, 'numId') ?? '', { abstract: wAttr(child(num, 'abstractNumId'), 'val') ?? '', overrides });
    }
  }

  const counters = new Map<string, number>();
  const starts: number[] = [];
  let previousWasList = false;
  for (const p of Array.from(parse(docXml).getElementsByTagNameNS(W, 'p'))) {
    const numPr = p.getElementsByTagNameNS(W, 'numPr')[0];
    const numId = wAttr(numPr?.getElementsByTagNameNS(W, 'numId')[0], 'val');
    const ilvl = wAttr(numPr?.getElementsByTagNameNS(W, 'ilvl')[0], 'val') ?? '0';
    if (!numId || numId === '0') {
      previousWasList = false;
      continue;
    }
    const num = nums.get(numId);
    const level = num ? abstracts.get(num.abstract)?.get(ilvl) : undefined;
    const key = `${numId}:${ilvl}`;
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    // A list begins at the first list paragraph after a non-list one.
    if (!previousWasList && ilvl === '0' && level?.ordered !== false) {
      starts.push((num?.overrides.get(ilvl) ?? level?.start ?? 1) + count - 1);
    }
    previousWasList = true;
  }
  return starts;
}

/** Converts a .docx file's contents into blocks for a new doc. */
export async function docxToBlocks(data: ArrayBuffer, opts: DocxOptions = {}): Promise<DocxImport> {
  const zip = await JSZip.loadAsync(data);
  const warnings: string[] = [];
  const convertImage = mammoth.images.imgElement(async (image) => {
    if (!opts.uploadImage) {
      warnings.push('An image was left out.');
      return { src: '' };
    }
    const buffer = await image.readAsArrayBuffer();
    const ext = image.contentType.split('/')[1] ?? 'png';
    const { asset_id } = await opts.uploadImage(new File([buffer], `image.${ext}`, { type: image.contentType }));
    return { src: `asset:${asset_id}` };
  });
  // Writing lines (leader tabs) are marked in the file first, as mammoth drops tab stops.
  const source = (await markWritingLines(zip)) ? await zip.generateAsync({ type: 'arraybuffer' }) : data;
  // The browser build reads `arrayBuffer`; the Node build (tests) reads `buffer`, and accepts an ArrayBuffer there.
  const input = { arrayBuffer: source, buffer: source } as unknown as { arrayBuffer: ArrayBuffer };
  const result = await mammoth.convertToHtml(input, { styleMap: STYLE_MAP, ignoreEmptyParagraphs: false, convertImage });
  for (const m of result.messages) warnings.push(m.message);

  const container = document.createElement('div');
  // An <hr> inside a <p> would close the paragraph as the HTML is read: an inline marker keeps it in place.
  container.innerHTML = placeWritingLines(result.value).replace(new RegExp(`<hr class="${PAGE_BREAK_MARK}" ?/?>`, 'g'), `<span class="${PAGE_BREAK_MARK}"></span>`);
  splitPageBreaks(container);
  container.querySelectorAll('img[src=""]').forEach((img) => img.remove());

  // Restore where each numbered list starts, when the lists line up with Word's.
  const starts = await listStarts(zip);
  const lists = Array.from(container.querySelectorAll('ol')).filter((ol) => !ol.parentElement?.closest('ol, ul'));
  if (starts && starts.length === lists.length) lists.forEach((ol, i) => starts[i]! !== 1 && ol.setAttribute('start', String(starts[i])));

  const doc = PMDOMParser.fromSchema(canvasSchema()).parse(container);
  // Header colours, read from the file (mammoth leaves shading out), when the tables line up.
  const colours = await tableHeaderColours(zip);
  const tables = doc.content.content.filter((n) => n.type.name === 'table').length;
  let table = 0;
  const blocks: ImportedBlock[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'image' && !node.attrs.src) return;
    const block = { type: blockTypeOf(node), content: nodeToContent(node).content };
    if (node.type.name === 'table' && colours?.length === tables) block.content = withHeaderColour(block.content, colours[table++] ?? null);
    // A list becomes a block per item (PLAN.md section 6).
    blocks.push(...(isOldList(block.type) ? splitList(block.type, block.content) : [block]));
  });
  return { blocks, warnings };
}

const hasContent = (el: Element) => (el.textContent ?? '').length > 0 || el.querySelector('img') !== null;

/** Turns mammoth's page break markers into page break blocks between the top-level blocks. */
export function splitPageBreaks(container: HTMLElement): void {
  for (const mark of Array.from(container.querySelectorAll(`span.${PAGE_BREAK_MARK}`))) {
    let top: Element = mark;
    while (top.parentElement && top.parentElement !== container) top = top.parentElement;
    if (top === mark || !/^(P|H[1-6])$/.test(top.tagName)) {
      mark.remove();
      continue;
    }
    // What follows the break moves to a copy of the block, after the page break.
    const range = document.createRange();
    range.setStartAfter(mark);
    range.setEndAfter(top.lastChild!);
    const rest = top.cloneNode(false) as Element;
    rest.appendChild(range.extractContents());
    mark.remove();
    const pageBreak = document.createElement('div');
    pageBreak.setAttribute('data-page-break', '');
    top.after(pageBreak);
    if (hasContent(rest)) pageBreak.after(rest);
    if (!hasContent(top)) top.remove();
  }
}

/** A chosen file's bytes (File.arrayBuffer where the browser has it, else FileReader). */
export function fileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('could not read file'));
    r.readAsArrayBuffer(file);
  });
}

/** The doc name for an uploaded file: its name without the extension. */
export function docNameFromFile(filename: string): string {
  return filename.replace(/\.docx$/i, '').trim().slice(0, 200) || 'Imported document';
}
