import { htmlToText } from '../html.js';

export interface EoLink {
  url: string;
  /** The curriculum area, as the page names it: `Numeracy and mathematics`. */
  name: string;
}

/**
 * The English experiences and outcomes PDFs linked from the Education Scotland page: files
 * under /media/ whose names end `-eo` (or `-es-os`, `-esos`). That leaves out the Gaelic
 * versions (ending `-gaelic`), the combined "all" and "responsibility of all" files (the same
 * text again) and the early level modern languages benchmarks, for now.
 */
export function findEoLinks(html: string, base: string): EoLink[] {
  const seen = new Set<string>();
  const out: EoLink[] = [];
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    const file = /^\/media\/[a-z0-9]+\/([a-z0-9-]+)\.pdf$/i.exec(href)?.[1];
    if (!file || !/-(eo|es-os|esos)$/i.test(file)) continue;
    const url = new URL(href, base).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const name = htmlToText(m[2]!)
      .replace(/^PDF file:\s*/i, '')
      .replace(/\s*\(PDF[^)]*\)\s*$/i, '')
      .trim();
    out.push({ url, name });
  }
  return out;
}
