/**
 * A doc as a Word file, in the browser (loaded on first use). Each block is read with the
 * editor's own parser (../editor/markdown.ts), so what is written is what the teacher sees:
 * Heading 1 to 3, paragraphs with bold, italic, underline, code and line breaks, bullet and
 * numbered lists (a run of list item blocks is one list; a numbered list keeps the number it
 * starts at), checklists as ☐ / ☒,
 * quotes in Word's Quote style, code in a monospaced font, dividers as a rule, page breaks as
 * Word's own (in a paragraph of their own, as Ctrl+Enter makes them), tables (header row, column
 * widths) and images. The page is A4 with Word's usual 2.54 cm margins.
 *
 * It is the reverse of ../import/docx.ts: a downloaded file uploads back to the same blocks.
 * Only accepted text is written; suggestions still awaiting a decision are left out.
 *
 * The file should feel like one made in Word, so `finishWord` replaces the docx library's
 * defaults with Word's own (taken from a document made in Word 365): text and headings in
 * the theme's fonts (the doc's font, or the app's default, Calibri, rather than Word's Aptos,
 * so the layout check and the editor match the file; Design > Fonts in Word still restyles the
 * whole document), body 12pt, and Heading 1 to 3 with Word's sizes,
 * colour, keep-with-next and space before and after.
 */
import JSZip from 'jszip';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  ImageRun,
  LevelFormat,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type { Node } from '@tiptap/pm/model';
import { createState, DEFAULT_DOC_FONT, joinRuns, liveBlocks, type Block, type Doc } from '@edw/shared';
import { canvasSchema } from '../editor/extensions/index.js';
import { blockToNode } from '../editor/markdown.js';
import type { CanvasSnapshot } from '../editor/types.js';
import { WORD_BACKGROUNDS, WORD_FONTS } from '../editor/docStyle.js';
import type { DocFont } from '@edw/shared';
import { TEXT_COLORS, WORD_TEXT_COLORS, wordColorStyle, wordColorStyleName, wordHeaderFill, type TextColor } from '../editor/textColors.js';
import { isTextSize, TEXT_SIZE_POINTS } from '../editor/textSizes.js';
import { isHeaderColor } from '../editor/extensions/tableHeaderColor.js';
import { isWritingLine, lineRun, lineStops } from './writingLines.js';

export interface LoadedImage {
  data: ArrayBuffer;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  width: number;
  height: number;
}

export interface DocxExportOptions {
  /** Fetches an image block's picture (src as stored, e.g. `asset:<id>`); null leaves it out. */
  loadImage?: (src: string) => Promise<LoadedImage | null>;
}

const BULLETS = 'bullets';
const numbersFrom = (start: number) => `numbers-${start}`;
/** Widest an image is drawn, in pixels (about the text width of an A4 page). */
const MAX_IMAGE_PX = 600;
/** The page, in twentieths of a point: A4 (21 x 29.7 cm), 2.54 cm (1 inch) margins all round. */
export const A4 = { width: 11906, height: 16838, margin: 1440 };
/** Editor pixels to Word's twentieths of a point. */
const PX_TO_TWIPS = 15;
const MONO = 'Courier New';
const TABLE_HEADING = 'TableHeading';
/** The header row's shading when it has no colour, the editor's light grey (`--panel`). */
const HEADER_FILL = 'F3F3F3';
/** A character style, so an upload can tell inline code from text that merely uses a monospaced font. */
const INLINE_CODE = 'InlineCode';

/**
 * Text runs for a textblock's inline content. A coloured run takes its colour's character style
 * (so an upload reads the colour back); a linked run is in Word's Hyperlink style, inside a
 * hyperlink to its address, one hyperlink for each stretch of the same link.
 */
function runs(block: Node | null | undefined): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  let link: { href: string; children: TextRun[] } | null = null;
  const endLink = () => {
    if (link) out.push(new ExternalHyperlink({ link: link.href, children: link.children }));
    link = null;
  };
  block?.forEach((n) => {
    if (n.type.name === 'hardBreak') {
      const br = new TextRun({ text: '', break: 1 });
      if (link) link.children.push(br);
      else out.push(br);
      return;
    }
    if (isWritingLine(n)) {
      endLink();
      out.push(lineRun());
      return;
    }
    if (!n.isText) return;
    const has = (m: string) => n.marks.some((k) => k.type.name === m);
    const color = n.marks.find((k) => k.type.name === 'textColor')?.attrs.color as TextColor | undefined;
    const href = n.marks.find((k) => k.type.name === 'link')?.attrs.href as string | undefined;
    const code = has('code');
    const textFont = n.marks.find((k) => k.type.name === 'textFont')?.attrs.font as DocFont | undefined;
    const textSize = n.marks.find((k) => k.type.name === 'textSize')?.attrs.size as string | undefined;
    const run = new TextRun({
      text: n.text ?? '',
      bold: has('bold') || undefined,
      italics: has('italic') || undefined,
      underline: has('underline') ? {} : undefined,
      highlight: has('highlight') ? 'yellow' : undefined,
      // One character style a run: the colour's wins, and code keeps its font directly.
      style: color ? wordColorStyle(color) : href ? 'Hyperlink' : code ? INLINE_CODE : undefined,
      font: code && (color || href) ? MONO : textFont && !code ? WORD_FONTS[textFont] : undefined,
      // In half-points.
      size: isTextSize(textSize) ? TEXT_SIZE_POINTS[textSize] * 2 : undefined,
    });
    if (href) {
      if (link?.href !== href) endLink();
      link ??= { href, children: [] };
      link.children.push(run);
    } else {
      endLink();
      out.push(run);
    }
  });
  endLink();
  return out;
}

/** The first paragraph inside a list item or table cell. */
const firstTextblock = (n: Node): Node | null => {
  let found: Node | null = null;
  n.descendants((d) => {
    if (found) return false;
    if (d.isTextblock) {
      found = d;
      return false;
    }
    return true;
  });
  return found;
};

/**
 * Spacing for a worksheet (in twentieths of a point): body text at 1.15 lines with 8pt after, so
 * pupils have room to read and write (DOC_DEFAULTS); list items 4pt apart, the last with the
 * usual 8pt after; none inside table cells and code, where each line is a paragraph.
 */
const ITEM_GAP = { after: 80 };
const TIGHT = { before: 0, after: 0, line: 240 };
const itemSpacing = (i: number, count: number) => (i < count - 1 ? ITEM_GAP : undefined);

async function blockToDocx(node: Node, ctx: { listCount: number; starts: Set<number>; opts: DocxExportOptions }): Promise<Array<Paragraph | Table>> {
  switch (node.type.name) {
    case 'heading': {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(3, Math.max(1, Number(node.attrs.level) || 2)) - 1];
      return [new Paragraph({ heading: level, ...lineStops(node), children: runs(node) })];
    }
    case 'bulletList': {
      const out: Paragraph[] = [];
      node.forEach((item, _o, i) => out.push(new Paragraph({ numbering: { reference: BULLETS, level: 0 }, spacing: itemSpacing(i, node.childCount), ...lineStops(firstTextblock(item)), children: runs(firstTextblock(item)) })));
      return out;
    }
    case 'orderedList': {
      const start = Number(node.attrs.start) || 1;
      ctx.starts.add(start);
      // Each list is its own numbering instance, so it restarts at its own start number.
      const instance = (ctx.listCount += 1);
      const out: Paragraph[] = [];
      node.forEach((item, _o, i) => out.push(new Paragraph({ numbering: { reference: numbersFrom(start), level: 0, instance }, spacing: itemSpacing(i, node.childCount), ...lineStops(firstTextblock(item)), children: runs(firstTextblock(item)) })));
      return out;
    }
    case 'taskList': {
      const out: Paragraph[] = [];
      node.forEach((item, _o, i) => out.push(new Paragraph({ spacing: itemSpacing(i, node.childCount), ...lineStops(firstTextblock(item)), children: [new TextRun(item.attrs.checked ? '☒ ' : '☐ '), ...runs(firstTextblock(item))] })));
      return out;
    }
    case 'blockquote': {
      const out: Paragraph[] = [];
      node.forEach((p) => out.push(new Paragraph({ style: 'Quote', ...lineStops(p), children: runs(p) })));
      return out;
    }
    case 'codeBlock':
      return node.textContent.split('\n').map((line) => new Paragraph({ spacing: TIGHT, children: [new TextRun({ text: line, font: MONO })] }));
    case 'horizontalRule':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } })];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'image': {
      const src = (node.attrs.src as string | null) ?? '';
      const img = src && ctx.opts.loadImage ? await ctx.opts.loadImage(src).catch(() => null) : null;
      if (!img) return [];
      const scale = Math.min(1, MAX_IMAGE_PX / Math.max(1, img.width));
      return [
        new Paragraph({
          children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) }, altText: { name: 'image', description: (node.attrs.alt as string) || '', title: (node.attrs.alt as string) || '' } })],
        }),
      ];
    }
    case 'table': {
      const widths: number[] = [];
      node.firstChild?.forEach((cell) => widths.push(Number((cell.attrs.colwidth as number[] | null)?.[0]) || 0));
      const rows: TableRow[] = [];
      const headerColor = node.attrs.headerColor as unknown;
      const fill = isHeaderColor(headerColor) ? wordHeaderFill(headerColor) : HEADER_FILL;
      node.forEach((row) => {
        let header = row.childCount > 0;
        row.forEach((c) => {
          if (c.type.name !== 'tableHeader') header = false;
        });
        const cells: TableCell[] = [];
        row.forEach((c, _o, i) =>
          cells.push(
            new TableCell({
              // Header cells are bold by their paragraph style, not by bold text, so an upload reads them back unchanged.
              children: [new Paragraph({ style: header ? TABLE_HEADING : undefined, spacing: TIGHT, children: runs(firstTextblock(c)) })],
              width: widths[i] ? { size: widths[i]! * PX_TO_TWIPS, type: WidthType.DXA } : undefined,
              shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
            }),
          ),
        );
        rows.push(new TableRow({ tableHeader: header, children: cells }));
      });
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
    }
    default:
      // A paragraph (an empty one stays: it is answer space on a worksheet).
      return [new Paragraph({ ...lineStops(node), children: runs(node) })];
  }
}

/** The font a doc's Word file is set in, for `finishWord` (the docx library has no theme fonts). */
const docFonts = new WeakMap<Document, string>();

/** The Word document for one doc's accepted blocks, ready for docx's Packer. */
export async function docToWord(snap: CanvasSnapshot, doc: Doc, opts: DocxExportOptions = {}): Promise<Document> {
  const state = createState('export', snap.blocks.map((b): Block => ({ ...b, origin: 'teacher', origin_turn: null })), snap.docs);
  const schema = canvasSchema();
  const ctx = { listCount: 0, starts: new Set<number>(), opts };
  const children: Array<Paragraph | Table> = [];
  // A run of list items is one Word list, numbered as the teacher sees it.
  for (const { type, content, items } of joinRuns(liveBlocks(state, doc.id))) {
    // The block as accepted: a pending replacement is not part of the doc yet.
    children.push(...(await blockToDocx(blockToNode(schema, { ...items[0]!, type, content, pending: null }), ctx)));
  }
  const word = new Document({
    title: doc.name,
    creator: 'Worksheet editor',
    // The page colour; Word shows it on screen (and prints it only if asked to).
    ...(doc.style?.background ? { background: { color: WORD_BACKGROUNDS[doc.style.background] } } : {}),
    styles: {
      characterStyles: [
        { id: INLINE_CODE, name: 'Inline Code', basedOn: 'DefaultParagraphFont', run: { font: MONO } },
        ...TEXT_COLORS.map((c) => ({ id: wordColorStyle(c), name: wordColorStyleName(c), basedOn: 'DefaultParagraphFont', run: { color: WORD_TEXT_COLORS[c] } })),
      ],
      paragraphStyles: [
        {
          id: 'Quote',
          name: 'Quote',
          basedOn: 'Normal',
          next: 'Normal',
          paragraph: { indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: '1F4F96', space: 8 } } },
        },
        { id: TABLE_HEADING, name: 'Table Heading', basedOn: 'Normal', run: { bold: true } },
      ],
    },
    numbering: {
      config: [
        { reference: BULLETS, levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        ...[...ctx.starts].map((start) => ({
          reference: numbersFrom(start),
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', start, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
        })),
      ],
    },
    sections: [{ properties: { page: { size: { width: A4.width, height: A4.height }, margin: { top: A4.margin, right: A4.margin, bottom: A4.margin, left: A4.margin } } }, children }],
  });
  if (doc.style?.font) docFonts.set(word, WORD_FONTS[doc.style.font]);
  return word;
}

/** An SVG as a bitmap, drawn twice its size so it stays sharp in Word (an <img> can draw an SVG; createImageBitmap cannot). */
async function svgBitmap(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = img.naturalWidth || 400;
    const height = img.naturalHeight || 300;
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.getContext('2d')?.drawImage(img, 0, 0, width * 2, height * 2);
    return { source: canvas, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads an image for the Word file: PNG, JPEG, GIF and BMP as they are, anything else (WebP, SVG) redrawn as PNG. */
export async function loadImageForWord(url: string): Promise<LoadedImage | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (blob.type === 'image/svg+xml') {
    const { source, width, height } = await svgBitmap(blob);
    const png = await new Promise<Blob | null>((r) => (source as HTMLCanvasElement).toBlob(r, 'image/png'));
    return png ? { data: await png.arrayBuffer(), type: 'png', width, height } : null;
  }
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const direct: Record<string, LoadedImage['type']> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
  const type = direct[blob.type];
  if (type) {
    bitmap.close();
    return { data: await blob.arrayBuffer(), type, width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  return png ? { data: await png.arrayBuffer(), type: 'png', width, height } : null;
}

/* ------------------------------------------------------------- Word's own look */

const MAJOR = '<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>';
const heading = (level: 1 | 2 | 3, before: number, size: number, fonts: string) =>
  `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/>${level > 1 ? '<w:unhideWhenUsed/>' : ''}<w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="80"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
  `<w:rPr>${fonts}<w:color w:val="0F4761"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

/** Styles as Word 365 defines them, replacing the docx library's (sizes in half-points, spacing in twentieths of a point). */
export const WORD_STYLES: Record<string, string> = {
  Heading1: heading(1, 360, 40, MAJOR),
  Heading2: heading(2, 160, 32, MAJOR),
  // Word sets Heading 3 in the body font.
  Heading3: heading(3, 160, 28, '<w:rFonts w:eastAsiaTheme="majorEastAsia" w:cstheme="majorBidi"/>'),
  Title:
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/>' +
    `<w:pPr><w:spacing w:after="80"/><w:contextualSpacing/></w:pPr><w:rPr>${MAJOR}<w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>`,
};

const DOC_DEFAULTS =
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/>' +
  '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-GB" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>';

/** The theme's fonts for a doc with no font: the app's default, for headings and text alike. */
export const THEME_FONTS = { major: WORD_FONTS[DEFAULT_DOC_FONT], minor: WORD_FONTS[DEFAULT_DOC_FONT] };

/**
 * Gives a generated file Word's own defaults: theme fonts, body size and the heading styles.
 * With `font` (the doc's chosen font), the theme's heading and body fonts are both that font,
 * so the whole file is set in it and Design > Fonts in Word still restyles it.
 */
export async function finishWord(data: Blob | ArrayBuffer | Uint8Array, font?: string): Promise<JSZip> {
  const zip = await JSZip.loadAsync(data);
  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    let styles = (await stylesFile.async('string')).replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/, DOC_DEFAULTS);
    for (const [id, xml] of Object.entries(WORD_STYLES)) {
      const existing = new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`);
      styles = existing.test(styles) ? styles.replace(existing, xml) : styles.replace('</w:styles>', `${xml}</w:styles>`);
    }
    zip.file('word/styles.xml', styles);
  }
  const themeFile = zip.file('word/theme/theme1.xml');
  if (themeFile) {
    const theme = (await themeFile.async('string'))
      .replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*/, `$1${font ?? THEME_FONTS.major}`)
      .replace(/(<a:minorFont>\s*<a:latin typeface=")[^"]*/, `$1${font ?? THEME_FONTS.minor}`);
    zip.file('word/theme/theme1.xml', theme);
  }
  return zip;
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The finished Word file, for a download. */
export async function wordBlob(doc: Document): Promise<Blob> {
  return (await finishWord(await Packer.toBlob(doc), docFonts.get(doc))).generateAsync({ type: 'blob', mimeType: DOCX_TYPE, compression: 'DEFLATE' });
}

/** The finished Word file as bytes (tests, and anywhere without Blob). */
export async function wordBytes(doc: Document): Promise<Uint8Array> {
  return (await finishWord(await Packer.toBuffer(doc), docFonts.get(doc))).generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
