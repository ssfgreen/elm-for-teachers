/**
 * What a passport must hold before a plugin is published at each level (docs/plugin-platform.md
 * section 8), and whether it covers a given version. Pure: no files, no database.
 */
import { SECTION_LABEL as LABEL, SECTION_NAMES, type Passport, type SectionName } from './schema.js';

export type PublishLevel = 'private' | 'limited' | 'public';

export type ProblemCode =
  | 'no_passport'
  | 'no_authors'
  | 'no_covers'
  | 'not_answered'
  | 'not_approved'
  | 'unknown_writer'
  | 'unknown_approver';

export interface Problem {
  code: ProblemCode;
  section?: SectionName;
  message: string;
}

/** `blocking` stops the publish; `suggestions` are shown and the author may go ahead. */
export interface PublishCheck {
  blocking: Problem[];
  suggestions: Problem[];
}

/**
 * Private checks nothing. Public needs at least one covered version, and every section answered
 * and approved by a named author.
 * Limited shows the same gaps as suggestions (a lighter passport is enough there). At both,
 * naming someone who is not among the authors blocks: that is a wrong claim, not a gap.
 */
export function publishCheck(passport: Passport | null, level: PublishLevel): PublishCheck {
  const out: PublishCheck = { blocking: [], suggestions: [] };
  if (level === 'private') return out;
  const gap = level === 'public' ? out.blocking : out.suggestions;

  if (!passport) {
    gap.push({
      code: 'no_passport',
      message:
        level === 'public'
          ? 'A public plugin needs a passport.'
          : 'A short passport is suggested, so teachers know who stands behind the plugin.',
    });
    return out;
  }

  if (passport.authors.length === 0) gap.push({ code: 'no_authors', message: 'No author is named.' });
  if (passport.covers.length === 0) gap.push({ code: 'no_covers', message: 'The passport does not say which versions it speaks for.' });
  const authors = new Set(passport.authors.map((a) => a.id));

  for (const name of SECTION_NAMES) {
    const s = passport.sections[name];
    if (!s) {
      gap.push({ code: 'not_answered', section: name, message: `${LABEL[name]} is not answered.` });
      continue;
    }
    for (const id of s.written_by.filter((id) => !authors.has(id))) {
      out.blocking.push({
        code: 'unknown_writer',
        section: name,
        message: `${LABEL[name]} names a writer, ${id}, who is not among the authors.`,
      });
    }
    for (const id of s.approved_by.filter((id) => !authors.has(id))) {
      out.blocking.push({
        code: 'unknown_approver',
        section: name,
        message: `${LABEL[name]} is approved by ${id}, who is not among the authors.`,
      });
    }
    if (!s.approved_by.some((id) => authors.has(id))) {
      gap.push({
        code: 'not_approved',
        section: name,
        message: s.drafted_by_assistant
          ? `${LABEL[name]} was drafted by an assistant and no author has approved it.`
          : `${LABEL[name]} has not been approved by an author.`,
      });
    }
  }
  return out;
}

/** True when the passport lists this exact version and content hash. A changed plugin is not covered. */
export function covers(passport: Passport, version: string, contentHash: string): boolean {
  return passport.covers.some((c) => c.version === version && c.content_hash === contentHash);
}

