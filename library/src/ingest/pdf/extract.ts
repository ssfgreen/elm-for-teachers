import { getDocumentProxy } from 'unpdf';
import type { PdfItem } from './lines.js';

/**
 * The text items of each page of a PDF, with their positions. Only text is read: no fonts are
 * loaded, forms (XFA) are off, and pdf.js runs no scripts the file carries.
 */
export async function extractPdfItems(data: Uint8Array): Promise<PdfItem[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(data), { disableFontFace: true, enableXfa: false, stopAtErrors: true });
  const pages: PdfItem[][] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        items.push({
          x: round(it.transform[4]),
          y: round(it.transform[5]),
          w: round(it.width),
          h: round(it.height),
          str: it.str,
          font: it.fontName,
        });
      }
      pages.push(items);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
  return pages;
}

const round = (n: number) => Math.round(n * 10) / 10;
