/**
 * A linked file (Word, PowerPoint, PDF, or a zip of them) as markdown, one part per file inside
 * a zip. Other kinds (images, videos) are skipped. Zips inside zips are not opened.
 */
import { extractPdfItems } from '../pdf/extract.js';
import { docxToMarkdown, pptxToMarkdown, unzipSome } from './office.js';

export type FileFormat = 'docx' | 'pptx' | 'pdf';
export const READABLE = /\.(docx|pptx|pdf)$/i;

export interface FilePart {
  /** The file's name: the download's own, or its path inside the zip. */
  name: string;
  format: FileFormat;
  markdown: string;
}

const formatOf = (name: string) => (READABLE.exec(name)?.[1]?.toLowerCase() as FileFormat | undefined) ?? null;

/** A PDF as a section per page, its text in reading order (top to bottom, left to right). */
export async function pdfToMarkdown(bytes: Uint8Array): Promise<string> {
  const pages = await extractPdfItems(bytes);
  return pages
    .map((items, i) => {
      const rows = new Map<number, { x: number; str: string }[]>();
      for (const it of items) {
        if (!it.str.trim()) continue;
        const y = Math.round(it.y / 3) * 3;
        rows.set(y, [...(rows.get(y) ?? []), { x: it.x, str: it.str }]);
      }
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, r]) => r.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return `## Page ${i + 1}\n\n${lines.length ? lines.join('\n') : '(no text)'}`;
    })
    .join('\n\n');
}

async function one(name: string, format: FileFormat, bytes: Uint8Array): Promise<FilePart> {
  const markdown = format === 'docx' ? docxToMarkdown(bytes) : format === 'pptx' ? pptxToMarkdown(bytes) : await pdfToMarkdown(bytes);
  return { name, format, markdown };
}

/** Every readable file in a download; a zip gives one part per readable file inside it. */
export async function fileParts(name: string, bytes: Uint8Array): Promise<FilePart[]> {
  if (/\.zip$/i.test(name)) {
    // Mac zips carry `__MACOSX/` copies of each file's metadata; they are not the files.
    const inside = unzipSome(bytes, (n) => !n.startsWith('__MACOSX/') && !n.endsWith('/') && formatOf(n) !== null);
    // One file that cannot be read is skipped with a warning; the zip fails only if none can be.
    const parts: FilePart[] = [];
    const failed: string[] = [];
    for (const n of Object.keys(inside).sort()) {
      try {
        parts.push(await one(n, formatOf(n)!, inside[n]!));
      } catch (e) {
        failed.push(`${n} (${(e as Error).message})`);
      }
    }
    if (failed.length && parts.length === 0) throw new Error(`nothing in the zip could be read: ${failed.join('; ')}`);
    for (const f of failed) console.warn(`${name}: skipped ${f}`);
    return parts;
  }
  const format = formatOf(name);
  return format ? [await one(name, format, bytes)] : [];
}
