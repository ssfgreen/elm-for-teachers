import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { createAccountStore, hashCode, type AccountStore, type Identity } from './store.js';

let t: TempDb;
let deps: AppDeps;
let store: AccountStore;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  store = createAccountStore(t.db, deps.sessions);
});
afterAll(() => t.cleanup());

let n = 0;
const identity = (): Identity => ({ provider: 'google', subject: `sub-${++n}`, email: `teacher${n}@school.example`, displayName: `Teacher ${n}` });

describe('invites', () => {
  it('stores only the hash of the code, and lists the invite as open', async () => {
    const { code, invite } = await store.createInvite({ label: 'Teacher A', email: 'a@school.example' });
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(invite).toMatchObject({ id: hashCode(code.replace(/-/g, '')), label: 'Teacher A', email: 'a@school.example', status: 'open', used_at: null });
    const raw = await t.db.execute('SELECT * FROM account_invites');
    expect(JSON.stringify(raw.rows)).not.toContain(code);
    expect(JSON.stringify(raw.rows)).not.toContain(code.replace(/-/g, ''));
    expect((await store.listInvites()).find((i) => i.id === invite.id)?.status).toBe('open');
  });

  it('withdraws an open invite, keeps a used one, and says when there is none', async () => {
    const open = await store.createInvite({ label: 'Withdrawn' });
    expect(await store.withdrawInvite(open.invite.id)).toBe('withdrawn');
    expect(await store.withdrawInvite(open.invite.id)).toBe('unknown');
    await expect(store.claimInvite(open.code, identity())).rejects.toMatchObject({ statusCode: 404 });

    const used = await store.createInvite({ label: 'Used' });
    await store.claimInvite(used.code, identity());
    expect(await store.withdrawInvite(used.invite.id)).toBe('used');
    expect((await store.listInvites()).find((i) => i.id === used.invite.id)?.status).toBe('used');
  });
});

describe('claiming an invite', () => {
  it('makes an account workspace with the current config hashes and its first chat, and no study seed', async () => {
    const { code, invite } = await store.createInvite({ label: 'Year 8 History' });
    const who = identity();
    const { account, created } = await store.claimInvite(code, who);
    expect(created).toBe(true);
    expect(account).toMatchObject({ provider: 'google', subject: who.subject, email: who.email, display_name: who.displayName });

    const session = await deps.sessions.get(account.session_id);
    const loaded = testLoaded();
    expect(session).toMatchObject({ label: 'Year 8 History', access: 'account', config_hash: loaded.config_hash, system_prompt_hash: loaded.system_prompt_hash });
    const threads = await deps.threads.list(account.session_id);
    expect(threads).toHaveLength(1);
    for (const table of ['classes', 'class_pupils', 'schools', 'year_groups']) {
      const r = await t.db.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [account.session_id]);
      expect(Number(r.rows[0]!.n), table).toBe(0);
    }
    const hashes = (await t.db.execute('SELECT hash FROM config_versions')).rows.map((r) => String(r.hash));
    expect(hashes).toEqual(expect.arrayContaining([loaded.config_hash, loaded.system_prompt_hash]));

    const after = (await store.listInvites()).find((i) => i.id === invite.id);
    expect(after).toMatchObject({ status: 'used', session_id: account.session_id });
  });

  it('cannot be claimed twice', async () => {
    const { code } = await store.createInvite({ label: 'Once' });
    await store.claimInvite(code, identity());
    await expect(store.claimInvite(code, identity())).rejects.toMatchObject({ statusCode: 409, code: 'invite_used' });
  });

  it('cannot be claimed after it expires, and makes nothing', async () => {
    const { code, invite } = await store.createInvite({ label: 'Late' });
    await t.db.execute('UPDATE account_invites SET expires_at = ? WHERE code_hash = ?', ['2000-01-01T00:00:00.000Z', invite.id]);
    const before = (await deps.sessions.list()).length;
    const who = identity();
    await expect(store.claimInvite(code, who)).rejects.toMatchObject({ statusCode: 410, code: 'invite_expired' });
    expect((await deps.sessions.list()).length).toBe(before);
    expect(await store.findAccount(who.provider, who.subject)).toBeNull();
    expect((await store.listInvites()).find((i) => i.id === invite.id)?.status).toBe('expired');
  });

  it('forgives a typed code: case, spaces, no hyphens, I or L for 1, O for 0', async () => {
    const { code } = await store.createInvite({ label: 'Typed' });
    const typed = ` ${code.replace(/-/g, ' ').toLowerCase().replace(/1/g, 'l').replace(/0/g, 'o')} `;
    const { account, created } = await store.claimInvite(typed, identity());
    expect(created).toBe(true);
    expect((await deps.sessions.get(account.session_id))?.label).toBe('Typed');
  });

  it('still claims an old 24-character invite, matched exactly', async () => {
    const old = 'Ab3_dE-fGh1jK2lMn4oPq5rS';
    await t.db.execute('INSERT INTO account_invites (code_hash, label, created_at, expires_at) VALUES (?, ?, ?, ?)', [hashCode(old), 'Old', '2026-11-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z']);
    await expect(store.claimInvite(old.toLowerCase(), identity())).rejects.toMatchObject({ statusCode: 404 });
    const { account, created } = await store.claimInvite(old, identity());
    expect(created).toBe(true);
    expect((await deps.sessions.get(account.session_id))?.access).toBe('account');
  });

  it('gives an account workspace no access code', async () => {
    const { account } = await store.claimInvite((await store.createInvite({ label: 'No code' })).code, identity());
    expect((await deps.sessions.get(account.session_id))?.access_code).toBeNull();
  });

  it('refuses an unknown code', async () => {
    await expect(store.claimInvite('not-a-code', identity())).rejects.toMatchObject({ statusCode: 404 });
  });

  it('gives the same identity the same workspace, and leaves a second invite unused', async () => {
    const who = identity();
    const first = await store.claimInvite((await store.createInvite({ label: 'First' })).code, who);
    const second = await store.createInvite({ label: 'Second' });
    const again = await store.claimInvite(second.code, who);
    expect(again).toEqual({ account: first.account, created: false });
    expect(await store.findAccount(who.provider, who.subject)).toEqual(first.account);
    expect((await store.listInvites()).find((i) => i.id === second.invite.id)?.status).toBe('open');
  });

  it('keeps one identity per provider: the same subject from another provider is another account', async () => {
    const who = identity();
    const a = await store.claimInvite((await store.createInvite({ label: 'G' })).code, who);
    const b = await store.claimInvite((await store.createInvite({ label: 'M' })).code, { ...who, provider: 'microsoft' });
    expect(b.account.session_id).not.toBe(a.account.session_id);
  });
});

describe('sign-ins and the notice', () => {
  it('records the sign-in time and the notice version accepted', async () => {
    const who = identity();
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Notice' })).code, who);
    await store.recordSignIn(account.id);
    await store.recordNoticeAccepted(account.id, '2026-11');
    const found = await store.findAccount(who.provider, who.subject);
    expect(found?.last_sign_in_at).not.toBeNull();
    expect(found).toMatchObject({ notice_version: '2026-11' });
    expect(found?.notice_accepted_at).not.toBeNull();
  });

  it('a sign-in id finds its account until it ends or expires, and only its hash is stored', async () => {
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Cookie' })).code, identity());
    const { id } = await store.startSignIn(account);
    expect((await store.accountForSignIn(id))?.id).toBe(account.id);
    const stored = JSON.stringify((await t.db.execute('SELECT * FROM sign_ins')).rows);
    expect(stored).not.toContain(id);
    await store.endSignIn(id);
    expect(await store.accountForSignIn(id)).toBeNull();
    const old = await store.startSignIn(account, -1);
    expect(await store.accountForSignIn(old.id)).toBeNull();
    expect(await store.accountForSignIn('never-issued')).toBeNull();
  });

  it('opens an account without an invite, once per identity, named by the label given', async () => {
    const who = identity();
    const first = await store.openAccount(who, 'Microsoft sign-in');
    expect(first.created).toBe(true);
    expect((await deps.sessions.get(first.account.session_id))).toMatchObject({ label: 'Microsoft sign-in', access: 'account' });
    const again = await store.openAccount(who, 'Microsoft sign-in');
    expect(again).toMatchObject({ created: false, account: { id: first.account.id } });
  });

  it('refuses a workspace access other than link or account', async () => {
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Check' })).code, identity());
    await expect(t.db.execute("UPDATE sessions SET access = 'other' WHERE session_id = ?", [account.session_id])).rejects.toThrow();
  });
});
