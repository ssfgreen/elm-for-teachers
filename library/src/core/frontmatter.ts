import { Document, isMap, isSeq, parse } from 'yaml';

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Splits YAML frontmatter from a markdown file. A file without frontmatter has empty data. */
export function parseFrontmatter(text: string): ParsedMarkdown {
  const m = FENCE.exec(text);
  if (!m) return { data: {}, body: text };
  const parsed: unknown = parse(m[1] ?? '');
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  return { data, body: text.slice(m[0].length) };
}

/**
 * Writes a markdown file with frontmatter. Keys keep their order, undefined values are left
 * out, and lists are written on one line (`level: [Early, First]`).
 */
export function writeFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const doc = new Document(clean);
  if (isMap(doc.contents)) for (const pair of doc.contents.items) if (isSeq(pair.value)) pair.value.flow = true;
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trimEnd()}\n`;
}

/** A frontmatter field as a list of strings, whether it was written as a list or a single value. */
export function asList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}
