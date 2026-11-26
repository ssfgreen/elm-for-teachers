/**
 * The migrate command: `node packages/server/dist/migrate.js`, or `pnpm --filter @edw/server migrate`.
 * Always runs, however it is started; the work is in migrate-cli.ts. Exits 0 when the schema is current.
 */
import { loadEnv } from './env.js';
import { runMigrations } from './migrate-cli.js';

process.exitCode = await runMigrations(loadEnv());
