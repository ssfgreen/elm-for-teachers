/**
 * Text from Word (.docx) and PowerPoint (.pptx) files, which are zips of XML. Only the text is
 * read: no macros, images or embedded objects, and nothing in the file is run. Unpacking is
 * capped, so a file that inflates to gigabytes is refused rather than filling memory.
 */
import { unzipSync, type Unzipped } from 'fflate';
import { decodeEntities } from '../html.js';

/** The most a file may unpack to, in all, and in any one part. */
export const MAX_UNZIPPED = 200_000_000;
export const MAX_PART = 50_000_000;

/** A zip's files whose names `keep` accepts, refusing it if they would unpack too large. */
export function unzipSome(bytes: Uint8Array, keep: (name: string) => boolean): Unzipped {
  let total = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      if (!keep(f.name)) return false;
      if (f.originalSize > MAX_PART) throw new Error(`${f.name} would unpack to ${f.originalSize} bytes`);
      total += f.originalSize;
      if (total > MAX_UNZIPPED) throw new Error(`the file would unpack to over ${MAX_UNZIPPED} bytes`);
      return true;
    },
  });
}

const xml = (part: Uint8Array | undefined) => (part ? new TextDecoder().decode(part) : '');

/** The text of each paragraph (`<w:p>` or `<a:p>`), runs joined, tabs and breaks as spaces. */
function paragraphs(doc: string, tag: 'w' | 'a'): { text: string; style: string | null }[] {
  const out: { text: string; style: string | null }[] = [];
  for (const m of doc.matchAll(new RegExp(`<${tag}:p[ >][\\s\\S]*?</${tag}:p>`, 'g'))) {
    const p = m[0];
    const runs = [...p.matchAll(new RegExp(`<${tag}:t(?: [^>]*)?>([^<]*)</${tag}:t>|<${tag}:(?:tab|br)\\b[^>]*/>`, 'g'))];
    const text = decodeEntities(runs.map((r) => (r[1] !== undefined ? r[1] : ' ')).join('')).replace(/\s+/g, ' ').trim();
    const style = tag === 'w' ? (/<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? null) : null;
    if (text) out.push({ text, style });
  }
  return out;
}

/** Word: paragraphs in order, its headings as markdown headings (one level below the file's title). */
export function docxToMarkdown(bytes: Uint8Array): string {
  const files = unzipSome(bytes, (n) => n === 'word/document.xml');
  const doc = xml(files['word/document.xml']);
  if (!doc) throw new Error('not a Word document: no word/document.xml');
  return paragraphs(doc, 'w')
    .map(({ text, style }) => {
      const level = style ? /^(?:Heading|heading)\s?(\d)$/.exec(style)?.[1] ?? (/^Title$/i.test(style) ? '1' : null) : null;
      return level ? `${'#'.repeat(Math.min(6, Number(level) + 1))} ${text}` : text;
    })
    .join('\n\n');
}

const slideNumber = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);

/** PowerPoint: a section per slide, in order, with its speaker notes when it has any. */
export function pptxToMarkdown(bytes: Uint8Array): string {
  const files = unzipSome(bytes, (n) => /^ppt\/(slides|notesSlides)\/\w+\d+\.xml$/.test(n));
  const slides = Object.keys(files)
    .filter((n) => n.startsWith('ppt/slides/'))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slides.length === 0) throw new Error('not a PowerPoint file: no slides');
  return slides
    .map((name) => {
      const n = slideNumber(name);
      const text = paragraphs(xml(files[name]), 'a').map((p) => p.text);
      // A notes page repeats the slide number as its own paragraph: leave out a lone number.
      const notes = paragraphs(xml(files[`ppt/notesSlides/notesSlide${n}.xml`]), 'a')
        .map((p) => p.text)
        .filter((t) => !/^\d+$/.test(t));
      const parts = [`## Slide ${n}`, '', text.length ? text.join('\n\n') : '(no text)'];
      if (notes.length) parts.push('', `**Notes:** ${notes.join(' ')}`);
      return parts.join('\n');
    })
    .join('\n\n');
}
