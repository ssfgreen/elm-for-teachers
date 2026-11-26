import TurndownService from 'turndown';
import { decodeEntities, htmlToText } from '../html.js';

const FILE_RE = /\.(pdf|docx?|pptx?|xlsx?|odt|odp|zip)$/i;

export interface LinkedFile {
  url: string;
  text: string;
}

function service(): TurndownService {
  const t = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
  // Text is for grep, not for rendering back: no backslashes before full stops and hyphens.
  t.escape = (s: string) => s;
  t.remove(['script', 'style', 'object', 'embed', 'noscript', 'form', 'button', 'svg']);
  // An embedded video or document becomes a link to it.
  t.addRule('iframe', {
    filter: 'iframe',
    replacement: (_content, node) => {
      const src = node.getAttribute('src');
      if (!src || !/^https:\/\//.test(src)) return '';
      const title = node.getAttribute('title') || `Embedded from ${new URL(src).hostname}`;
      return `\n\n[${title}](${src})\n\n`;
    },
  });
  // Pictures with no description say nothing to a reader of the text.
  t.addRule('decorativeImage', { filter: (node) => node.nodeName === 'IMG' && !(node.getAttribute('alt') ?? '').trim(), replacement: () => '' });
  // WordPress file blocks repeat each link as a "Download" button.
  t.addRule('fileButton', {
    filter: (node) => node.nodeName === 'A' && /wp-block-file__button/.test(node.getAttribute('class') ?? ''),
    replacement: () => '',
  });
  t.addRule('spacer', { filter: (node) => /wp-block-spacer/.test(node.getAttribute?.('class') ?? ''), replacement: () => '' });
  return t;
}

/** WordPress post HTML as markdown, keeping links. Nothing in it is run: it is only parsed. */
export function htmlToMarkdown(html: string): string {
  return service()
    .turndown(html)
    .replace(/^(\s*)(-|\d+\.)\s{2,}/gm, '$1$2 ')
    .replace(/^#{1,6}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Files the post links to (PDFs, Word documents, slides, zips), once each, in order. */
export function linkedFiles(html: string): LinkedFile[] {
  const seen = new Map<string, LinkedFile>();
  for (const m of html.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href="([^"]+)"/i.exec(m[1]!)?.[1];
    if (!href) continue;
    const url = decodeEntities(href);
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!FILE_RE.test(path)) continue;
    const text = htmlToText(m[2]!);
    const known = seen.get(url);
    if (!known) seen.set(url, { url, text: text || path.split('/').pop()! });
    else if (known.text.toLowerCase() === 'download' && text) known.text = text;
  }
  return [...seen.values()];
}
