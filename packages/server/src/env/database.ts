/** The database settings. */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { emptyToUndefined, optional, type Vars } from './parse.js';

export const databaseVars = {
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().default('file:./data/edw.db')),
  DATABASE_AUTH_TOKEN: optional(z.string()),
  /** `false` (or `0`, `no`, `off`): start without migrating, as on Kubernetes, where a Job runs `node dist/migrate.js` first. On by default (Vercel). */
  MIGRATE_ON_START: z.preprocess((v) => v === undefined || v === '' || !['false', '0', 'no', 'off'].includes(String(v).toLowerCase()), z.boolean()),
};

export interface DatabaseEnv {
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN?: string;
  /** False: createDeps runs no migrations (bootstrap.ts). Unset counts as on. */
  MIGRATE_ON_START?: boolean;
}

/** Resolve `file:./x` against the repo root and create its directory. Other URLs pass through. */
function resolveDatabaseUrl(url: string, root: string): string {
  if (!url.startsWith('file:')) return url;
  const rest = url.slice('file:'.length).replace(/^\/\//, '/');
  if (rest === ':memory:') return url;
  const abs = path.isAbsolute(rest) ? rest : path.resolve(root, rest);
  mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs}`;
}

export function databaseSettings(v: Vars<typeof databaseVars>, root: string): Pick<DatabaseEnv, 'DATABASE_URL'> {
  return { DATABASE_URL: resolveDatabaseUrl(v.DATABASE_URL, root) };
}
