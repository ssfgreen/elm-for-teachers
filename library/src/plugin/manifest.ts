/**
 * A plugin's manifest, `plugin.json`, format version 1 (docs/plugin-platform.md section 9).
 * It is data only: identity, what others may reuse, the collections and their paths, the tools
 * from a fixed set, and the settings a teacher can change. `parseManifest` refuses anything else
 * with a message that names the field.
 */
import { z } from 'zod';
import type { CollectionMeta } from '../core/types.js';

export type CollectionKind = NonNullable<CollectionMeta['kind']>;
export const COLLECTION_KINDS = ['documents', 'pedagogy', 'curriculum'] as const satisfies readonly CollectionKind[];

/**
 * The fixed tool set and the kind of collection each works on. The names are the library's
 * operations (`server/api.ts`); `tool-kinds.test.ts` checks the two agree. The later tools
 * (`look_up`, `checklist`, `template`) join when their kinds of collection exist.
 */
export const TOOL_KINDS = {
  search: 'documents',
  grep: 'documents',
  list: 'documents',
  read: 'documents',
  entries: 'pedagogy',
  entry: 'pedagogy',
  claims: 'pedagogy',
  facets: 'pedagogy',
  structure: 'curriculum',
  outcomes: 'curriculum',
  benchmarks: 'curriculum',
} as const satisfies Record<string, CollectionKind>;
export type Tool = keyof typeof TOOL_KINDS;
const TOOLS = Object.keys(TOOL_KINDS) as [Tool, ...Tool[]];

/** What others may do with a plugin's content, from a short fixed list. */
export const REUSE = ['use_only', 'adapt_with_credit', 'adapt_freely'] as const;
export const SETTING_TYPES = ['boolean', 'choice', 'choices', 'number', 'entries'] as const;
/** Effects are built into the runner, which applies them (R3); a plugin cannot add one. */
export const SETTING_EFFECTS = ['hide_ids', 'favour_ids', 'min_rating', 'facet'] as const;
export const VIEWS = COLLECTION_KINDS;

/** The setting types each effect can take. */
const EFFECT_TYPES: Record<(typeof SETTING_EFFECTS)[number], readonly (typeof SETTING_TYPES)[number][]> = {
  hide_ids: ['entries'],
  favour_ids: ['entries'],
  min_rating: ['choice'],
  facet: ['choice', 'choices'],
};

/**
 * `major.minor.patch`, with an optional pre-release; no leading zeros (semver.org). Build metadata
 * (`+...`) is left out on purpose: it plays no part in ordering, and a `+` in `name@<ver>` addresses
 * reads as a space in a query string.
 */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const PLUGIN_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const COLLECTION_ID = /^[a-z0-9][a-z0-9-]*$/;
const SETTING_KEY = /^[a-z][a-z0-9_]*$/;

/** A path inside the plugin folder: relative, forward slashes, no `..` or empty part. */
export function isInsidePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
const insidePath = z.string().refine(isInsidePath, 'must be a relative path inside the plugin, with no ".." part');

const option = z.object({ value: z.string().min(1), label: z.string().min(1) }).strict();

const setting = z
  .object({
    type: z.enum(SETTING_TYPES, { errorMap: () => ({ message: `type must be one of ${SETTING_TYPES.join(', ')}` }) }),
    label: z.string().min(1),
    default: z.unknown(),
    options: z.array(option).min(1).optional(),
    effect: z.enum(SETTING_EFFECTS, { errorMap: () => ({ message: `effect must be one of ${SETTING_EFFECTS.join(', ')}` }) }),
    collection: z.string().optional(),
  })
  .strict();

const baseSchema = z
  .object({
    format: z.literal(1, { errorMap: () => ({ message: 'format must be 1' }) }),
    id: z.string().regex(PLUGIN_ID, 'id must be owner/name, in lower case letters, digits and hyphens'),
    version: z.string().regex(SEMVER, 'version must be semver, such as 1.2.0'),
    name: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    publisher: z.string().optional(),
    reuse: z.enum(REUSE, { errorMap: () => ({ message: `reuse must be one of ${REUSE.join(', ')}` }) }).default('adapt_with_credit'),
    reuse_note: z.string().optional(),
    collections: z
      .array(
        z
          .object({
            id: z.string().regex(COLLECTION_ID, 'a collection id is lower case letters, digits and hyphens'),
            kind: z.enum(COLLECTION_KINDS, { errorMap: () => ({ message: `kind must be one of ${COLLECTION_KINDS.join(', ')}` }) }),
            path: insidePath,
          })
          .strict(),
      )
      .default([]),
    skills: z.array(insidePath).default([]),
    tools: z
      .array(
        z
          .object({
            tool: z.enum(TOOLS, { errorMap: () => ({ message: `tool must be one of ${TOOLS.join(', ')}` }) }),
            collection: z.string().optional(),
            use_when: z.string().optional(),
            settings: z.array(z.string()).optional(),
          })
          .strict(),
      )
      .default([]),
    settings: z.record(z.string().regex(SETTING_KEY, 'a setting key is lower case letters, digits and _'), setting).default({}),
    browse: z.object({ view: z.enum(VIEWS), collection: z.string() }).strict().optional(),
    use_in: z.array(z.string()).default([]),
    tests: z.string().optional(),
  })
  .strict();
const manifestSchema = baseSchema.superRefine(checkReferences);

export type Manifest = z.infer<typeof baseSchema>;
export type Setting = Manifest['settings'][string];
export type ToolUse = Manifest['tools'][number];

/** Checks what one field says about another: ids are unique, and every reference is to something there. */
function checkReferences(man: Manifest, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const kinds = new Map<string, CollectionKind>();
  man.collections.forEach((c, i) => {
    if (kinds.has(c.id)) issue(['collections', i, 'id'], `two collections are called ${c.id}`);
    kinds.set(c.id, c.kind);
    // One folder inside another would put the inner collection's files in the outer's version.
    for (const other of man.collections.slice(0, i)) {
      if (other.path === c.path) issue(['collections', i, 'path'], `two collections are at ${c.path}`);
      else if (c.path.startsWith(`${other.path}/`)) issue(['collections', i, 'path'], `${c.path} is inside ${other.path}, the folder of ${other.id}`);
      else if (other.path.startsWith(`${c.path}/`)) issue(['collections', i, 'path'], `${other.path}, the folder of ${other.id}, is inside ${c.path}`);
    }
  });

  const declared = new Set<string>();
  man.tools.forEach((t, i) => {
    const wanted = TOOL_KINDS[t.tool];
    const pair = `${t.tool} ${t.collection ?? ''}`;
    if (declared.has(pair)) issue(['tools', i, 'tool'], `${t.tool} is declared twice for ${t.collection ?? 'the plugin'}`);
    declared.add(pair);
    if (t.collection !== undefined) {
      const kind = kinds.get(t.collection);
      if (kind === undefined) issue(['tools', i, 'collection'], `no collection called ${t.collection}`);
      else if (kind !== wanted) issue(['tools', i, 'tool'], `${t.tool} works on a ${wanted} collection, and ${t.collection} is ${kind}`);
    } else if (![...kinds.values()].includes(wanted)) {
      issue(['tools', i, 'tool'], `${t.tool} works on a ${wanted} collection, and the plugin has none`);
    }
    for (const key of t.settings ?? []) {
      const own = man.settings[key];
      if (!own) issue(['tools', i, 'settings'], `no setting called ${key}`);
      else if (own.collection !== undefined && t.collection !== undefined && own.collection !== t.collection) {
        issue(['tools', i, 'settings'], `${key} is for ${own.collection}, and this tool is on ${t.collection}`);
      }
    }
  });

  for (const [key, s] of Object.entries(man.settings)) {
    const at = (field: string) => ['settings', key, field];
    if (!EFFECT_TYPES[s.effect].includes(s.type)) issue(at('effect'), `${s.effect} needs a setting of type ${EFFECT_TYPES[s.effect].join(' or ')}`);
    if (s.collection !== undefined && !kinds.has(s.collection)) issue(at('collection'), `no collection called ${s.collection}`);
    const needsOptions = s.type === 'choice' || s.type === 'choices';
    if (needsOptions && !s.options) issue(at('options'), `a ${s.type} setting needs options`);
    if (!needsOptions && s.options) issue(at('options'), `a ${s.type} setting has no options`);
    const problem = defaultProblem(s);
    if (problem) issue(at('default'), problem);
  }

  if (man.browse) {
    const kind = kinds.get(man.browse.collection);
    if (kind === undefined) issue(['browse', 'collection'], `no collection called ${man.browse.collection}`);
    else if (kind !== man.browse.view) issue(['browse', 'view'], `the ${man.browse.view} view cannot show ${man.browse.collection}, which is ${kind}`);
  }
}

/** Why a setting's default does not fit its type and options, or null when it does. */
function defaultProblem(s: Setting): string | null {
  const values = new Set((s.options ?? []).map((o) => o.value));
  const d = s.default;
  switch (s.type) {
    case 'boolean':
      return typeof d === 'boolean' ? null : 'the default must be true or false';
    case 'number':
      return typeof d === 'number' && Number.isFinite(d) ? null : 'the default must be a number';
    case 'entries':
      return Array.isArray(d) && d.every((v) => typeof v === 'string') ? null : 'the default must be a list of ids';
    case 'choice':
      return typeof d === 'string' && values.has(d) ? null : 'the default must be one of the options';
    case 'choices':
      return Array.isArray(d) && d.every((v) => typeof v === 'string' && values.has(v)) ? null : 'the default must be a list of the options';
  }
}

/** Reads and checks a manifest; throws an Error naming each field that is wrong. */
export function parseManifest(raw: unknown): Manifest {
  const parsed = manifestSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message));
  throw new Error(`plugin.json: ${lines.join('; ')}`);
}
