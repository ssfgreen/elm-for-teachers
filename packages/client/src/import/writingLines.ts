/**
 * Writing lines back from Word: a tab in a paragraph whose tab stops include one with an
 * underline leader is a line to that stop, as the download writes `<line/>`
 * (export/writingLines.ts) and as teachers often make answer lines by hand. mammoth turns a tab
 * into a tab character and drops the stops, so before it reads the file each such tab is
 * swapped for a marker, which the HTML then turns into a writing line.
 */
import type JSZip from 'jszip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
/** Stands for a writing line between the file and the HTML: private-use characters, never typed. */
export const LINE_MARK = 'line';

const kids = (el: Element | null | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const attr = (el: Element, name: string) => el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`);

/** Marks the file's leader tabs in place. True when it changed anything. */
export async function markWritingLines(zip: JSZip): Promise<boolean> {
  const file = zip.file('word/document.xml');
  const xml = await file?.async('string');
  if (!xml || !xml.includes('w:leader="underscore"')) return false;
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  let changed = false;
  for (const p of Array.from(dom.getElementsByTagNameNS(W, 'p'))) {
    const stops = kids(kids(kids(p, 'pPr')[0], 'tabs')[0], 'tab');
    if (!stops.some((t) => attr(t, 'leader') === 'underscore')) continue;
    for (const r of kids(p, 'r')) {
      for (const tab of kids(r, 'tab')) {
        const t = dom.createElementNS(W, 'w:t');
        t.textContent = LINE_MARK;
        r.replaceChild(t, tab);
        changed = true;
      }
    }
  }
  if (changed) zip.file('word/document.xml', new XMLSerializer().serializeToString(dom));
  return changed;
}

/** mammoth's HTML with each marker as a writing line the editor reads. */
export const placeWritingLines = (html: string) => html.split(LINE_MARK).join('<span data-writing-line=""></span>');
