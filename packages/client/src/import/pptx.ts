/**
 * A PowerPoint file's text, a page per slide: the slide's text (each paragraph a line) and its
 * speaker notes. Read from the slide XML with JSZip; pictures on the slides are left out for now.
 */
import JSZip from 'jszip';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** The text of each <a:p> paragraph in a slide or notes part, a line each. */
function paragraphs(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS(A, 'p'))
    .map((p) =>
      Array.from(p.getElementsByTagNameNS(A, 't'))
        .map((t) => t.textContent ?? '')
        .join('')
        .trim(),
    )
    .filter(Boolean);
}

const slideNumber = (path: string) => Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0);

export async function pptxSlideTexts(data: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const pages: string[] = [];
  for (const [i, path] of slides.entries()) {
    const lines = paragraphs(await zip.file(path)!.async('string'));
    // The slide's notes are named in its relationships file.
    const rels = await zip.file(path.replace('slides/', 'slides/_rels/') + '.rels')?.async('string');
    const target = rels ? /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1] : undefined;
    const notesXml = target ? await zip.file(`ppt/notesSlides/${target}`)?.async('string') : undefined;
    // Notes parts also hold the slide number placeholder: drop a lone number.
    const notes = notesXml ? paragraphs(notesXml).filter((l) => !/^\d+$/.test(l)) : [];
    const parts = [`Slide ${i + 1}`, ...lines];
    if (notes.length) parts.push('', 'Speaker notes:', ...notes);
    pages.push(lines.length || notes.length ? parts.join('\n') : '');
  }
  return pages;
}
