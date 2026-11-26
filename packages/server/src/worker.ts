/**
 * The jobs worker: `node packages/server/dist/worker.js`. Runs due jobs (jobs/) until SIGTERM
 * or SIGINT, then finishes the job in hand and exits. For Kubernetes; on Vercel the cron route
 * (jobs/routes.ts) runs the same jobs instead. Runs no migrations: the migrate Job does.
 */
import { openDb } from './db/client.js';
import { loadEnv } from './env.js';
import { JOB_KINDS } from './jobs/kinds.js';
import { workLoop } from './jobs/loop.js';
import { serialiseTransactions } from './serial-db.js';

const env = loadEnv();
const db = serialiseTransactions(openDb({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN }));
const stop = new AbortController();
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => stop.abort());

console.log('jobs worker: started');
try {
  await workLoop(db, { kinds: JOB_KINDS, signal: stop.signal });
} finally {
  db.close();
}
console.log('jobs worker: stopped');
