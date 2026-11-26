/**
 * Reference files to text, in the browser: what the server stores for the model to read.
 * A Word file goes through the "Upload .docx" importer (./docx.ts), so its text keeps headings,
 * lists and tables in the editor's markdown, and its blocks go with it: the model can open the
 * file as an editable doc (open_reference_as_doc) instead of retyping it. .txt and .md are read
 * as they are.
 * Either is cut into pages of about 4k characters at paragraph breaks (shared `splitIntoPages`),
 * so the model can cite a page. A PDF keeps its own pages (pdf.js, ./pdf.ts) and a PowerPoint
 * file has a page per slide, with its speaker notes (./pptx.ts); both load only when needed.
 *
 */
import { joinRuns, REFERENCE_PAGE_MAX, splitIntoPages, type ReferenceBlock, type ReferenceMime } from '@edw/shared';

export interface ConvertedReference {
  mime: ReferenceMime;
  pages: string[];
  /** A Word file's blocks, as "Upload .docx" makes them. */
  blocks?: ReferenceBlock[];
}

export interface ConvertOptions {
  /** Stores a Word file's pictures (as "Upload .docx" does); without it they are left out. */
  uploadImage?: (file: File) => Promise<{ asset_id: string }>;
}

/** A block as the model reads it: its markdown, with a picture as a short note (its asset id means nothing to it). */
const blockText = (b: ReferenceBlock) => (b.type === 'image' ? b.content.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => `[picture${alt ? `: ${alt}` : ''}]`) : b.content);

/** The same as ./docx.ts's, here so this file does not pull in the Word importer (and mammoth). */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** The extensions the file picker offers, for `accept`. */
export const REFERENCE_ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.markdown';

/** A file's type by its name first: browsers often give .md (and sometimes .docx) no type. */
export function referenceMimeOf(file: Pick<File, 'name' | 'type'>): ReferenceMime | null {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (ext === 'docx' || file.type === DOCX_MIME) return DOCX_MIME;
  if (ext === 'pptx' || file.type === PPTX_MIME) return PPTX_MIME;
  if (ext === 'pdf' || file.type === 'application/pdf') return 'application/pdf';
  if (ext === 'md' || ext === 'markdown' || file.type === 'text/markdown') return 'text/markdown';
  if (ext === 'txt' || file.type === 'text/plain') return 'text/plain';
  return null;
}

/** A file's contents through FileReader (which every browser, and jsdom, has). */
function read<T extends 'text' | 'buffer'>(file: Blob, as: T): Promise<T extends 'text' ? string : ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T extends 'text' ? string : ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    if (as === 'text') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

/** Thrown for a file the browser can't convert; the message is for the teacher. */
export class ReferenceFileError extends Error {}

export async function convertReference(file: File, opts: ConvertOptions = {}): Promise<ConvertedReference> {
  const mime = referenceMimeOf(file);
  if (!mime) {
    const old = /\.(doc|ppt)$/i.exec(file.name)?.[1]?.toLowerCase();
    if (old) throw new ReferenceFileError(`“${file.name}” is an older ${old === 'doc' ? 'Word' : 'PowerPoint'} file. Save it as .${old}x and add that instead.`);
    throw new ReferenceFileError(`“${file.name}” can't be added: use a PDF, Word (.docx), PowerPoint (.pptx), text (.txt) or Markdown (.md) file.`);
  }
  if (mime === 'application/pdf' || mime === PPTX_MIME) {
    let pages: string[];
    try {
      pages = mime === PPTX_MIME ? await (await import('./pptx')).pptxSlideTexts(await read(file, 'buffer')) : await (await import('./pdf')).pdfPageTexts(await read(file, 'buffer'));
    } catch {
      throw new ReferenceFileError(`“${file.name}” could not be read. It may be damaged or password-protected.`);
    }
    // A page too long for one (tiny print) is cut at paragraph breaks into several.
    const fitted = pages.flatMap((p) => (p.length > REFERENCE_PAGE_MAX ? splitIntoPages(p, REFERENCE_PAGE_MAX) : [p]));
    return { mime, pages: fitted.length ? fitted : [''] };
  }
  if (mime === DOCX_MIME) {
    // The Word importer (and mammoth) is large: loaded only when a Word file is added.
    let blocks: ReferenceBlock[];
    try {
      blocks = (await (await import('./docx')).docxToBlocks(await read(file, 'buffer'), opts)).blocks.filter((b) => b.content.trim() !== '');
    } catch {
      throw new ReferenceFileError(`“${file.name}” could not be read. It may be damaged or password-protected.`);
    }
    // A run of list items reads as one list.
    const pages = splitIntoPages(joinRuns(blocks).map(blockText).join('\n\n'));
    return { mime, pages: pages.length ? pages : [''], ...(blocks.length ? { blocks } : {}) };
  }
  const text = await read(file, 'text');
  const pages = splitIntoPages(text.replace(/\n{3,}/g, '\n\n'));
  // No text: the server says so in its own words (and logs nothing).
  return { mime, pages: pages.length ? pages : [''] };
}
