/**
 * A PDF's text layer, a string per page, with pdf.js (loaded only when a PDF is added: it is
 * large). A scanned page has no text layer and comes back empty; the server refuses a file with
 * no text at all, and image pages come later (PLAN P.2).
 */
export async function pdfPageTexts(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str + (item.hasEOL ? '\n' : '');
      }
      pages.push(text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
