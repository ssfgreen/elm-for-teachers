/** Build the production dependency graph from the environment. */
import { loadAppConfig } from '@edw/shared/node';
import { createCanvasService } from './blocks/index.js';
import { openDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { recordConfigVersions } from './config-versions.js';
import type { AppDeps } from './deps.js';
import type { Env } from './env.js';
import { createEventStore } from './events/store.js';
import { bucketFromEnv } from './assets/bucket.js';
import { createArasaac } from './pictures/arasaac.js';
import { createProvider } from './gateway/index.js';
import { serialiseTransactions } from './serial-db.js';
import { createSessionService } from './sessions/service.js';
import { createAccountStore } from './accounts/store.js';
import { createThreadService } from './threads/service.js';

export async function createDeps(env: Env): Promise<AppDeps & { migrationsApplied: string[] }> {
  const db = serialiseTransactions(openDb({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN }));
  // Off where migrations run as their own step first (migrate.ts, built as dist/migrate.js, run by a Kubernetes Job).
  const applied = env.MIGRATE_ON_START === false ? [] : (await migrate(db)).applied;
  const loaded = loadAppConfig(env.CONFIG_DIR);
  await recordConfigVersions(db, loaded);
  const p = loaded.config.provider;
  const provider = createProvider({
    kind: env.PROVIDER,
    model: p.model,
    temperature: p.temperature,
    baseUrl: env.ELM_PROXY_BASE_URL,
    apiKey: env.ELM_PROXY_API_KEY,
    chatPath: env.ELM_PROXY_CHAT_PATH,
    responsesPath: env.ELM_PROXY_RESPONSES_PATH,
    reasoningEffort: loaded.config.agent.reasoning_effort,
    maxOutputTokens: p.max_output_tokens,
  });
  const events = createEventStore(db);
  const canvas = createCanvasService(db, events);
  const threads = createThreadService(db, canvas, events);
  const sessions = createSessionService(db, loaded, events, threads);
  const accounts = createAccountStore(db, sessions);
  return { env, db, loaded, provider, sessions, accounts, threads, events, canvas, bucket: bucketFromEnv(env), pictures: createArasaac(), migrationsApplied: applied };
}
