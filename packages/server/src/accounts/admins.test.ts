import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { ADMIN_SIGN_IN_HOURS, createAdminStore, type AdminStore } from './admins.js';
import { createAccountStore, hashCode, type Account, type AccountStore } from './store.js';

let t: TempDb;
let accounts: AccountStore;
let admins: AdminStore;
let n = 0;

beforeAll(async () => {
  t = await tempDb();
  accounts = createAccountStore(t.db, testDeps(t.db).sessions);
  admins = createAdminStore(t.db);
});
afterAll(() => t.cleanup());

async function newAccount(label = 'Workspace'): Promise<Account> {
  const { code } = await accounts.createInvite({ label });
  const id = ++n;
  return (await accounts.claimInvite(code, { provider: 'test', subject: `s-${id}`, email: `t${id}@school.example`, displayName: `Teacher ${id}` })).account;
}

const backdate = (signInId: string, hours: number) =>
  t.db.execute('UPDATE sign_ins SET created_at = ? WHERE id_hash = ?', [new Date(Date.now() - hours * 3_600_000).toISOString(), hashCode(signInId)]);

describe('adminForSignIn', () => {
  it('is the admin for a fresh sign-in, and null for anyone else', async () => {
    const a = await newAccount();
    const { id } = await accounts.startSignIn(a);
    expect(await admins.adminForSignIn(id)).toBeNull();
    expect(await admins.setAdmin(a.id, true)).toBe('ok');
    expect(await admins.adminForSignIn(id)).toEqual({ id: a.id, name: a.display_name, email: a.email, provider: 'test' });
    expect(await admins.adminForSignIn('not-a-sign-in')).toBeNull();
  });

  it(`refuses a sign-in that started more than ${ADMIN_SIGN_IN_HOURS} hours ago, though it still works for the workspace`, async () => {
    const a = await newAccount();
    await admins.setAdmin(a.id, true);
    const { id } = await accounts.startSignIn(a);
    await backdate(id, ADMIN_SIGN_IN_HOURS - 0.5);
    expect(await admins.adminForSignIn(id)).not.toBeNull();
    await backdate(id, ADMIN_SIGN_IN_HOURS + 0.5);
    expect(await admins.adminForSignIn(id)).toBeNull();
    expect(await accounts.accountForSignIn(id)).not.toBeNull();
  });

  it('refuses an ended or expired sign-in', async () => {
    const a = await newAccount();
    await admins.setAdmin(a.id, true);
    const ended = await accounts.startSignIn(a);
    await accounts.endSignIn(ended.id);
    expect(await admins.adminForSignIn(ended.id)).toBeNull();
    const expired = await accounts.startSignIn(a);
    await t.db.execute('UPDATE sign_ins SET expires_at = ? WHERE id_hash = ?', [new Date(Date.now() - 1000).toISOString(), hashCode(expired.id)]);
    expect(await admins.adminForSignIn(expired.id)).toBeNull();
  });
});

describe('setAdmin and listAccounts', () => {
  it('lists every account with its workspace and flag', async () => {
    const a = await newAccount('Year 7 maths');
    const listed = (await admins.listAccounts()).find((x) => x.id === a.id);
    expect(listed).toEqual({ id: a.id, name: a.display_name, email: a.email, provider: 'test', admin: false, workspace: { session_id: a.session_id, label: 'Year 7 maths' } });
  });

  it('never removes the last admin, and says when the account is unknown', async () => {
    // Start from no admins at all.
    await t.db.execute('UPDATE accounts SET is_admin = 0');
    const a = await newAccount();
    const b = await newAccount();
    expect(await admins.setAdmin('no-such-account', true)).toBe('unknown');
    await admins.setAdmin(a.id, true);
    expect(await admins.setAdmin(a.id, false)).toBe('last_admin');
    expect(await admins.isAdmin(a.id)).toBe(true);
    await admins.setAdmin(b.id, true);
    expect(await admins.setAdmin(a.id, false)).toBe('ok');
    expect(await admins.setAdmin(b.id, false)).toBe('last_admin');
    // Removing a flag that is not set is not removing an admin.
    expect(await admins.setAdmin(a.id, false)).toBe('ok');
    expect(await admins.isAdmin(b.id)).toBe(true);
  });
});
