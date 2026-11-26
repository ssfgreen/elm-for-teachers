/**
 * Writes `PASSPORT.md`, the teacher's prose layer, from a parsed `passport.json` (docs/plugin-platform.md
 * section 8). Both come from the same answers, so the Markdown is never edited by hand. Pure and
 * deterministic: the same passport always gives the same text.
 */
import { SECTION_LABEL, SECTION_NAMES, type Passport, type Section } from './schema.js';

const NOT_ANSWERED = 'Not answered.';

export function renderPassport(passport: Passport): string {
  const names = new Map(passport.authors.map((a) => [a.id, a.name]));
  const out: string[] = [
    `# Passport for ${passport.plugin.id} ${passport.plugin.version}`,
    'This file is written from `passport.json`: change that, not this.',
    passport.issuer === null ? 'A self-report by its authors. No organisation has checked it.' : '',
    '## Authors',
    passport.authors.length === 0 ? NOT_ANSWERED : passport.authors.map((a) => `- ${a.name} (\`${a.id}\`)`).join('\n'),
    '## Versions it covers',
    passport.covers.length === 0
      ? 'None. A version the passport does not cover is treated as Ask first.'
      : passport.covers.map((c) => `- ${c.version}, content hash \`${c.content_hash}\``).join('\n'),
  ];
  for (const name of SECTION_NAMES) {
    const s = passport.sections[name];
    out.push(`## ${SECTION_LABEL[name]}`);
    if (!s) out.push(NOT_ANSWERED);
    else out.push(s.text.trim(), whoLine(s, names));
  }
  return `${out.filter((p) => p !== '').join('\n\n')}\n`;
}

/** Who wrote and approved a section, by name where the author is listed, else by id. */
function whoLine(s: Section, names: ReadonlyMap<string, string>): string {
  const list = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(', ');
  const parts: string[] = [];
  if (s.drafted_by_assistant) parts.push(s.written_by.length ? `Drafted with an assistant by ${list(s.written_by)}.` : 'Drafted by an assistant.');
  else parts.push(s.written_by.length ? `Written by ${list(s.written_by)}.` : 'No writer named.');
  parts.push(s.approved_by.length ? `Approved by ${list(s.approved_by)}.` : 'Not yet approved by an author.');
  return `_${parts.join(' ')}_`;
}
