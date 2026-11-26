#!/usr/bin/env node
/**
 * Makes the first admin (issue #30), against the database in .env (the Turso settings for the
 * live site). After the first, admins set the flag in /admin. Runs no migrations: deploy first.
 *
 *   pnpm --filter @edw/shared build && pnpm --filter @edw/server build
 *   node scripts/admin.mjs --invite "<workspace name>" [--site https://...]   # a link and its invite id
 *   node scripts/admin.mjs --admin <invite id>                                # set the flag
 *
 * `--admin` finds the account the invite made (account_invites.session_id), never by email: an
 * email is whatever the person's Microsoft tenant typed in, and is never used to find anyone.
 * It shows the account and asks you to type yes. An invite not yet claimed changes nothing.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'packages/server/dist');
if (!existsSync(join(server, 'accounts/admins.js'))) {
  console.error('Build first: pnpm --filter @edw/shared build && pnpm --filter @edw/server build');
  process.exit(2);
}
const load = (p) => import(join(server, p));
const { loadEnv } = await load('env.js');
const { openDb } = await load('db/client.js');
const { createAccountStore } = await load('accounts/store.js');
const { createAdminStore } = await load('accounts/admins.js');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const label = opt('--invite');
const inviteId = opt('--admin');
if (!label === !inviteId || (inviteId !== undefined && !/^[0-9a-f]{64}$/.test(inviteId))) {
  console.error('Usage: node scripts/admin.mjs --invite "<workspace name>" [--site <url>] | --admin <invite id (64 hex characters)>');
  process.exit(2);
}

const env = loadEnv();
const db = openDb({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
const where = env.DATABASE_URL.startsWith('file:') ? 'the local database' : 'the hosted database';
try {
  const cols = (await db.execute('PRAGMA table_info(accounts)')).rows.map((r) => String(r.name));
  if (!cols.includes('is_admin')) {
    console.error(`${where} has no accounts.is_admin yet: deploy this version first (it runs migration 0029).`);
    process.exitCode = 1;
  } else if (label) {
    // An invite makes no workspace until it is claimed, so no sessions service is needed here.
    const noSessions = { create: () => Promise.reject(new Error('not used')) };
    const { code, invite } = await createAccountStore(db, noSessions).createInvite({ label: label.trim() });
    const site = (opt('--site') ?? env.AUTH_BASE_URL ?? '').replace(/\/$/, '');
    console.log(`Invite for "${invite.label}" in ${where}, until ${invite.expires_at}:`);
    console.log(`  ${site}/join/${code}`);
    console.log('Sign up with it, then run:');
    console.log(`  node scripts/admin.mjs --admin ${invite.id}`);
  } else {
    // The invite's id is the hash of its code; once claimed it names the workspace it made, and
    // that workspace has exactly one account (accounts.session_id is unique).
    const r = await db.execute(
      `SELECT a.id, a.provider, a.display_name, a.last_sign_in_at, a.created_at, a.is_admin, s.label
       FROM account_invites i JOIN accounts a ON a.session_id = i.session_id JOIN sessions s ON s.session_id = a.session_id
       WHERE i.code_hash = ? AND i.used_at IS NOT NULL`,
      [inviteId],
    );
    const a = r.rows[0];
    if (!a) {
      console.error(`No claimed invite with that id in ${where}: sign up with the link first. Nothing changed.`);
      process.exitCode = 1;
    } else if (Number(a.is_admin) === 1) {
      console.log('That account is already an admin.');
    } else {
      console.log(`The account that invite made, in ${where}:`);
      console.log(`  account id:   ${a.id}`);
      console.log(`  provider:     ${a.provider}`);
      console.log(`  name:         ${a.display_name ?? '(none)'}`);
      console.log(`  last sign-in: ${a.last_sign_in_at ?? '(never)'}`);
      console.log(`  workspace:    "${a.label}", made ${a.created_at}`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('Is this you? Make it an admin? Type yes: ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'yes') {
        console.log('Nothing changed.');
      } else {
        await createAdminStore(db).setAdmin(String(a.id), true);
        console.log('Done: it signs in to /admin.');
      }
    }
  }
} finally {
  db.close();
}
