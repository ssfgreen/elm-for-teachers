/**
 * A plugin's passport, schema `passport/1` (docs/plugin-platform.md section 8). It says who stands
 * behind a plugin and what it is for: the named authors, which versions it covers, and four
 * sections, each written and approved by named authors. No territory yet (Sam, 21 Nov).
 *
 * This folder imports only `zod` and `node:crypto`, so the studio can copy it as it is.
 * `passport.cases.json` is the shared check that both copies agree.
 */
import { z } from 'zod';

export const PASSPORT_SCHEMA = 'passport/1';
export const SECTION_NAMES = ['contents', 'expected_use', 'tested_use', 'risks'] as const;
export type SectionName = (typeof SECTION_NAMES)[number];
/** Each section's name as a teacher reads it. */
export const SECTION_LABEL: Record<SectionName, string> = {
  contents: 'Contents',
  expected_use: 'Expected use',
  tested_use: 'Tested use',
  risks: 'Risks',
};

/** The same rules as the plugin manifest's id and version (plugin/manifest.ts), copied to stay self-contained. */
const PLUGIN_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
/** The plugin content hash without the passport files (plugin/passport-files.ts `coveredHash`). */
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;
/** A studio author id: no spaces and no `@`, so an email address can never stand in for one. */
const AUTHOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

const authorId = z.string().regex(AUTHOR_ID, 'an author id is the studio id, never an email');

const section = z
  .object({
    text: z.string().trim().min(1, 'text is empty: leave the section null if it is not answered'),
    written_by: z.array(authorId),
    approved_by: z.array(authorId),
    drafted_by_assistant: z.boolean(),
  })
  .strict();

const passportSchema = z
  .object({
    schema: z.literal(PASSPORT_SCHEMA),
    plugin: z
      .object({
        id: z.string().regex(PLUGIN_ID, 'id must be owner/name in lower case'),
        version: z.string().regex(SEMVER, 'version must be semver, such as 1.2.0'),
      })
      .strict(),
    covers: z.array(
      z
        .object({
          version: z.string().regex(SEMVER, 'version must be semver, such as 1.2.0'),
          content_hash: z.string().regex(CONTENT_HASH, 'content_hash must be sha256:<64 hex>'),
        })
        .strict(),
    ),
    authors: z
      .array(z.object({ id: authorId, name: z.string().trim().min(1, 'name is empty') }).strict())
      .refine((list) => new Set(list.map((a) => a.id)).size === list.length, 'an author id is listed twice'),
    issuer: z.null(),
    sections: z
      .object({
        contents: section.nullable(),
        expected_use: section.nullable(),
        tested_use: section.nullable(),
        risks: section.nullable(),
      })
      .strict(),
  })
  .strict();

export type Passport = z.infer<typeof passportSchema>;
export type Section = NonNullable<Passport['sections'][SectionName]>;

/** Parses `passport.json`, or throws a message that names the field. */
export function parsePassport(raw: unknown): Passport {
  const result = passportSchema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? issue.path.join('.') : '(top level)';
  throw new Error(`passport.json: ${where}: ${issue?.message ?? 'not a passport'}`);
}
