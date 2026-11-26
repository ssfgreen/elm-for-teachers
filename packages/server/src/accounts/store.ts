/**
 * Teacher accounts. An account is one identity from a sign-in provider (provider, subject) and
 * owns exactly one workspace (a session with access 'account'). An account is made by claiming
 * an invite the admin made: the claim creates the workspace, through the normal
 * `sessions.create`, and the account in one transaction.
 *
 * Privacy: the email, name and subject stay in `accounts` and `account_invites`. Nothing here
 * logs them or writes them to an event, and the workspace's label is the invite's label.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Executor, Row, Transaction } from '../db/types.js';
import { newUlid, nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { SessionService } from '../deps.js';
import { conflict, HttpError, notFound } from '../http-error.js';
import { formatCode, newCode, normaliseCode } from '../access/codes.js';

export interface Identity {
  provider: string;
  subject: string;
  email: string | null;
  displayName: string | null;
}

export interface Account {
  id: string;
  session_id: string;
  provider: string;
  subject: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  notice_version: string | null;
  notice_accepted_at: string | null;
}

export type InviteStatus = 'open' | 'used' | 'expired';

export interface Invite {
  /** The code's hash: names the invite in the admin routes. The code itself is never stored. */
  id: string;
  label: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  session_id: string | null;
  status: InviteStatus;
}

export const INVITE_DAYS = 14;
/** How long a sign-in lasts before the person signs in again. */
export const SIGN_IN_DAYS = 30;
export const MAX_INVITE_DAYS = 90;

export interface AccountStore {
  /**
   * A new invite; `code` (`XXXX-XXXX-XXXX`, access/codes.ts) is returned only here, and only the
   * hash of its canonical form is kept. The workspace it makes is called `label`.
   */
  createInvite(input: { label: string; email?: string | null; days?: number }): Promise<{ code: string; invite: Invite }>;
  /** Newest first. */
  listInvites(): Promise<Invite[]>;
  /** Withdraw an unclaimed invite. 'used': it was claimed, and is kept as the record of it. */
  withdrawInvite(id: string): Promise<'withdrawn' | 'used' | 'unknown'>;
  /**
   * The identity's account. An identity that already has one gets it back and the invite is
   * left alone; otherwise the invite (404 unknown, 409 used, 410 expired) makes the workspace
   * and the account. A typed code is forgiven as access/codes.ts says; an old 24-character code
   * from before #29 is matched exactly.
   */
  claimInvite(code: string, identity: Identity): Promise<{ account: Account; created: boolean }>;
  findAccount(provider: string, subject: string): Promise<Account | null>;
  /**
   * The identity's account, made with its workspace (called `label`) if it has none. For the
   * open-door settings only (policy.ts): everyone else needs an invite.
   */
  openAccount(identity: Identity, label: string): Promise<{ account: Account; created: boolean }>;
  recordSignIn(accountId: string): Promise<void>;
  /** A new sign-in for the cookie: returns its id, which is stored only as a hash. */
  startSignIn(account: Pick<Account, 'id' | 'session_id'>, days?: number): Promise<{ id: string; expires_at: string }>;
  /** The account a sign-in id belongs to, or null when unknown, ended or expired. */
  accountForSignIn(id: string): Promise<Account | null>;
  /** End a sign-in (sign-out): the id no longer works anywhere. */
  endSignIn(id: string): Promise<void>;
  recordNoticeAccepted(accountId: string, version: string): Promise<void>;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function rowToAccount(row: Row): Account {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    provider: String(row.provider),
    subject: String(row.subject),
    email: str(row.email),
    display_name: str(row.display_name),
    created_at: String(row.created_at),
    last_sign_in_at: str(row.last_sign_in_at),
    notice_version: str(row.notice_version),
    notice_accepted_at: str(row.notice_accepted_at),
  };
}

function rowToInvite(row: Row, now: string): Invite {
  const used_at = str(row.used_at);
  const expires_at = String(row.expires_at);
  return {
    id: String(row.code_hash),
    label: String(row.label),
    email: str(row.email),
    created_at: String(row.created_at),
    expires_at,
    used_at,
    session_id: str(row.session_id),
    status: used_at ? 'used' : expires_at <= now ? 'expired' : 'open',
  };
}

async function find(x: Executor, provider: string, subject: string): Promise<Account | null> {
  const r = await x.execute({ sql: 'SELECT * FROM accounts WHERE provider = ? AND subject = ?', args: [provider, subject] });
  return r.rows[0] ? rowToAccount(r.rows[0]) : null;
}

/**
 * A new workspace called `label` (access 'account') and its account, inside the caller's transaction.
 * `email` is for showing whose account it is, never for finding or matching one: for Microsoft
 * it is whatever the person's tenant typed in (or their sign-in name), not checked by anyone.
 * Accounts are found only by (provider, subject).
 */
async function insertAccount(tx: Transaction, sessions: Pick<SessionService, 'create'>, identity: Identity, label: string, now: string): Promise<Account> {
  const { session } = await sessions.create(label, { access: 'account', tx });
  const account: Account = {
    id: newUlid(),
    session_id: session.session_id,
    provider: identity.provider,
    subject: identity.subject,
    email: identity.email,
    display_name: identity.displayName,
    created_at: now,
    last_sign_in_at: null,
    notice_version: null,
    notice_accepted_at: null,
  };
  await tx.execute({
    sql: 'INSERT INTO accounts (id, session_id, provider, subject, email, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [account.id, account.session_id, account.provider, account.subject, account.email, account.display_name, now],
  });
  return account;
}

/** The invite a code names: an old code exactly as given, else a typed code forgiven (access/codes.ts). */
async function findInvite(x: Executor, code: string): Promise<Row | null> {
  const canonical = normaliseCode(code);
  const hashes = [hashCode(code), ...(canonical && canonical !== code ? [hashCode(canonical)] : [])];
  for (const h of hashes) {
    const r = await x.execute({ sql: 'SELECT * FROM account_invites WHERE code_hash = ?', args: [h] });
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

export function createAccountStore(db: Db, sessions: Pick<SessionService, 'create'>): AccountStore {
  return {
    async createInvite({ label, email = null, days = INVITE_DAYS }) {
      const canonical = newCode();
      const now = new Date();
      const created_at = now.toISOString();
      const expires_at = new Date(now.getTime() + days * 86_400_000).toISOString();
      const code_hash = hashCode(canonical);
      const code = formatCode(canonical);
      await db.transaction((tx) =>
        tx.execute({ sql: 'INSERT INTO account_invites (code_hash, label, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', args: [code_hash, label, email, created_at, expires_at] }),
      );
      return { code, invite: { id: code_hash, label, email, created_at, expires_at, used_at: null, session_id: null, status: 'open' } };
    },

    async listInvites() {
      const now = nowIso();
      const r = await db.execute('SELECT * FROM account_invites ORDER BY created_at DESC, code_hash');
      return r.rows.map((row) => rowToInvite(row, now));
    },

    async withdrawInvite(id) {
      return db.transaction(async (tx) => {
        const r = await tx.execute({ sql: 'SELECT used_at FROM account_invites WHERE code_hash = ?', args: [id] });
        const row = r.rows[0];
        if (!row) return 'unknown';
        if (row.used_at !== null) return 'used';
        await tx.execute({ sql: 'DELETE FROM account_invites WHERE code_hash = ? AND used_at IS NULL', args: [id] });
        return 'withdrawn';
      });
    },

    async claimInvite(code, identity) {
      return db.transaction(async (tx) => {
        const existing = await find(tx, identity.provider, identity.subject);
        if (existing) return { account: existing, created: false };
        const now = nowIso();
        const row = await findInvite(tx, code);
        if (!row) throw notFound('invite');
        const invite = rowToInvite(row, now);
        if (invite.status === 'used') throw conflict('invite already used', 'invite_used');
        if (invite.status === 'expired') throw new HttpError(410, 'invite expired', 'invite_expired');

        const account = await insertAccount(tx, sessions, identity, invite.label, now);
        const used = await tx.execute({ sql: 'UPDATE account_invites SET used_at = ?, session_id = ? WHERE code_hash = ? AND used_at IS NULL', args: [now, account.session_id, invite.id] });
        if (used.rowsAffected !== 1) throw conflict('invite already used', 'invite_used');
        return { account, created: true };
      });
    },

    async findAccount(provider, subject) {
      return find(db.client, provider, subject);
    },

    async openAccount(identity, label) {
      return db.transaction(async (tx) => {
        const existing = await find(tx, identity.provider, identity.subject);
        if (existing) return { account: existing, created: false };
        return { account: await insertAccount(tx, sessions, identity, label, nowIso()), created: true };
      });
    },

    async startSignIn(account, days = SIGN_IN_DAYS) {
      const id = randomBytes(32).toString('base64url');
      const now = new Date();
      const expires_at = new Date(now.getTime() + days * 86_400_000).toISOString();
      await db.transaction(async (tx) => {
        await tx.execute({ sql: 'DELETE FROM sign_ins WHERE account_id = ? AND expires_at <= ?', args: [account.id, now.toISOString()] });
        await tx.execute({
          sql: 'INSERT INTO sign_ins (id_hash, account_id, session_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
          args: [hashCode(id), account.id, account.session_id, now.toISOString(), expires_at],
        });
      });
      return { id, expires_at };
    },

    async accountForSignIn(id) {
      const r = await db.execute('SELECT a.* FROM sign_ins s JOIN accounts a ON a.id = s.account_id WHERE s.id_hash = ? AND s.expires_at > ?', [hashCode(id), nowIso()]);
      return r.rows[0] ? rowToAccount(r.rows[0]) : null;
    },

    async endSignIn(id) {
      await db.transaction((tx) => tx.execute({ sql: 'DELETE FROM sign_ins WHERE id_hash = ?', args: [hashCode(id)] }));
    },

    async recordSignIn(accountId) {
      await db.transaction((tx) => tx.execute({ sql: 'UPDATE accounts SET last_sign_in_at = ? WHERE id = ?', args: [nowIso(), accountId] }));
    },

    async recordNoticeAccepted(accountId, version) {
      await db.transaction((tx) => tx.execute({ sql: 'UPDATE accounts SET notice_version = ?, notice_accepted_at = ? WHERE id = ?', args: [version, nowIso(), accountId] }));
    },
  };
}
