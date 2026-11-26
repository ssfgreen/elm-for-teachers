/**
 * The fake OpenID Connect issuer for Playwright, on a fixed port so the app server can be told
 * where it is (AUTH_TEST_ISSUER). Uses the server's own fake issuer from its build, so run
 * `pnpm build` first. Tests only: the app refuses the test provider in production.
 *
 * To sign in as a new person, a test sets a `fake_sub` cookie for 127.0.0.1 in its own browser
 * (`becomeSomeone` in e2e/fakePerson.ts). There is no shared "next login" to set from
 * outside: two specs signing in at once would take each other's.
 */
/* global process, console */
import { startFakeIssuer } from '../packages/server/dist/accounts/fake-issuer.js';

const port = Number(process.env.PORT ?? 3952);
const issuer = await startFakeIssuer({ port });
console.log(`fake issuer on ${issuer.url}`);

const stop = () => void issuer.close().then(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
