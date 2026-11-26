/**
 * Pupils and curriculum codes named in the assistant's replies. A pupil's label (tidy-puffin)
 * becomes a mention that shows their row of the class's table on hover, and a curriculum code
 * (LIT 2-13a) one that shows the outcome from the app's own curriculum, not a PDF elsewhere.
 * Pure: the Markdown renderer gets them as links with a `#pupil:` or `#curriculum:` address.
 */

export type MentionKind = 'pupil' | 'curriculum';
export type MentionPart = { text: string } | { kind: MentionKind; value: string; text: string };

/** A Curriculum for Excellence code: three or four capitals, a level, a number and a letter. */
const CODE = '[A-Z]{3,4} [0-4]-\\d{2}[a-z]';
const CODE_ONLY = new RegExp(`^${CODE}$`);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pattern(labels: readonly string[]): RegExp {
  // Longest first, so a label that starts another does not cut it short.
  const named = [...labels].filter(Boolean).sort((a, b) => b.length - a.length).map(escape);
  const pupil = named.length ? `(?<![\\w-])(?<pupil>${named.join('|')})(?![\\w-])|` : '';
  return new RegExp(`${pupil}(?<![\\w-])(?<code>${CODE})(?![\\w-])`, 'gi');
}

/** A text cut into plain runs and mentions, in order. */
export function splitMentions(text: string, labels: readonly string[]): MentionPart[] {
  const byLower = new Map(labels.map((l) => [l.toLowerCase(), l]));
  const parts: MentionPart[] = [];
  let at = 0;
  for (const m of text.matchAll(pattern(labels))) {
    const pupil = m.groups?.pupil;
    const code = m.groups?.code;
    // Codes are matched without regard to case only alongside labels; a code is always capitals.
    if (!pupil && (!code || !CODE_ONLY.test(code))) continue;
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push(pupil ? { kind: 'pupil', value: byLower.get(pupil.toLowerCase()) ?? pupil, text: pupil } : { kind: 'curriculum', value: code!, text: code! });
    at = m.index + m[0].length;
  }
  if (at < text.length || parts.length === 0) parts.push({ text: text.slice(at) });
  return parts;
}

/** The codes a link's text is made of ("LIT 2-13a", "ENG 2-12a / ENG 3-12a"), or null if it says anything else. */
export function codesInLinkText(text: string): string[] | null {
  const pieces = text.split(/\s*(?:\/|,|\band\b)\s*/).map((p) => p.trim()).filter(Boolean);
  return pieces.length && pieces.every((p) => CODE_ONLY.test(p)) ? pieces : null;
}

const PREFIX: Record<MentionKind, string> = { pupil: '#pupil:', curriculum: '#curriculum:' };

export const mentionHref = (kind: MentionKind, value: string) => `${PREFIX[kind]}${encodeURIComponent(value)}`;

export function parseMentionHref(href: string | undefined): { kind: MentionKind; value: string } | null {
  for (const kind of Object.keys(PREFIX) as MentionKind[]) {
    if (href?.startsWith(PREFIX[kind])) return { kind, value: decodeURIComponent(href.slice(PREFIX[kind].length)) };
  }
  return null;
}

/** As much of a Markdown syntax tree (mdast) as this needs. */
interface Node {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
}

/** Leaves links, code and HTML as they are: a mention inside a link would be a link in a link. */
const SKIP = new Set(['link', 'linkReference', 'inlineCode', 'code', 'html', 'definition']);

/** A remark plugin: plain text in the reply becomes mention links. */
export function remarkMentions({ labels }: { labels: readonly string[] }) {
  const walk = (node: Node) => {
    if (!node.children || SKIP.has(node.type)) return;
    node.children = node.children.flatMap((child): Node[] => {
      if (child.type !== 'text') {
        walk(child);
        return [child];
      }
      const parts = splitMentions(child.value ?? '', labels);
      if (parts.length === 1 && !('kind' in parts[0]!)) return [child];
      return parts.map((p) => ('kind' in p ? { type: 'link', url: mentionHref(p.kind, p.value), children: [{ type: 'text', value: p.text }] } : { type: 'text', value: p.text }));
    });
  };
  return (tree: Node) => walk(tree);
}
