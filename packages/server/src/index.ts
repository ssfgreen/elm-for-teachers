import { buildApp } from './app.js';
import { createDeps } from './bootstrap.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const { migrationsApplied, ...deps } = await createDeps(env);
const app = await buildApp(deps, { logger: true });
if (migrationsApplied.length) app.log.info({ applied: migrationsApplied }, 'applied migrations');
if (env.MIGRATE_ON_START === false) app.log.info('MIGRATE_ON_START=false: no migrations at start; run node dist/migrate.js first');
app.addHook('onClose', async () => deps.db.close());

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  const host = env.HOST === '0.0.0.0' || env.HOST === '::' ? 'localhost' : env.HOST;
  app.log.info(`admin: http://${host}:${env.PORT}/admin (listening on ${env.HOST}:${env.PORT})`);
  if (env.PROVIDER === 'mock') app.log.warn('PROVIDER=mock: the assistant returns canned outputs, no model is called');
  else app.log.info({ model: deps.provider.model }, 'provider: elm');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}
