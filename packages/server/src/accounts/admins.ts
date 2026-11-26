/**
 * Admins (issue #30). An admin is an account with `is_admin` set. Its sign-in cookie opens the
 * admin routes only while that sign-in is fresh: started within ADMIN_SIGN_IN_HOURS, not ended
 * and not expired. The first admin is set by scripts/admin.mjs; after that admins set the flag
 * here, and the last admin can never be removed.
 *
 * Privacy: the list carries emails and names for the admin screen only; nothing here logs them.
 */
import type { Executor } from '../db/types.js';
import type { Db } from '../db/client.js';
import { hashCode } from './store.js';

/** How long a sign-in opens the admin routes: after this the admin signs in again. */
export const ADMIN_SIGN_IN_HOURS = 12;

export interface AdminAccount {
  id: string;
  name: string | null;
  email: string | null;
  provider: string;
  admin: boolean;
  workspace: { session_id: string; label: string };
}

export interface AdminStore {
  /** The admin account a sign-in id belongs to, when that sign-in is fresh enough; else null. */
  adminForSignIn(signInId: string, now?: Date): Promise<{ id: string; name: string | null; email: string | null; provider: string } | null>;
  isAdmin(accountId: string): Promise<boolean>;
  /** Every account with its workspace, oldest first. */
  listAccounts(): Promise<AdminAccount[]>;
  /** 'last_admin': it would leave no admin, so nothing changed. */
  setAdmin(accountId: string, admin: boolean): Promise<'ok' | 'unknown' | 'last_admin'>;
}

/**
 * Whether deleting workspace `sessionId` would leave no admin: its account is the only admin.
 * Run inside the delete's own transaction, so two deletes cannot both pass it.
 */
export async function isLastAdminWorkspace(tx: Executor, sessionId: string): Promise<boolean> {
  const r = await tx.execute({
    sql: 'SELECT (SELECT COUNT(*) FROM accounts WHERE is_admin = 1) AS n FROM accounts WHERE session_id = ? AND is_admin = 1',
    args: [sessionId],
  });
  return r.rows.length > 0 && Number(r.rows[0]?.n) <= 1;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function createAdminStore(db: Db): AdminStore {
  return {
    async adminForSignIn(signInId, now = new Date()) {
      const since = new Date(now.getTime() - ADMIN_SIGN_IN_HOURS * 3_600_000).toISOString();
      const r = await db.execute(
        `SELECT a.id, a.display_name, a.email, a.provider FROM sign_ins s JOIN accounts a ON a.id = s.account_id
         WHERE s.id_hash = ? AND s.expires_at > ? AND s.created_at > ? AND a.is_admin = 1`,
        [hashCode(signInId), now.toISOString(), since],
      );
      const row = r.rows[0];
      return row ? { id: String(row.id), name: str(row.display_name), email: str(row.email), provider: String(row.provider) } : null;
    },

    async isAdmin(accountId) {
      const r = await db.execute('SELECT 1 FROM accounts WHERE id = ? AND is_admin = 1', [accountId]);
      return r.rows.length > 0;
    },

    async listAccounts() {
      const r = await db.execute(
        `SELECT a.id, a.display_name, a.email, a.provider, a.is_admin, a.session_id, s.label
         FROM accounts a JOIN sessions s ON s.session_id = a.session_id ORDER BY a.created_at, a.id`,
      );
      return r.rows.map((row) => ({
        id: String(row.id),
        name: str(row.display_name),
        email: str(row.email),
        provider: String(row.provider),
        admin: Number(row.is_admin) === 1,
        workspace: { session_id: String(row.session_id), label: String(row.label) },
      }));
    },

    async setAdmin(accountId, admin) {
      return db.transaction(async (tx) => {
        const r = await tx.execute({ sql: 'SELECT is_admin FROM accounts WHERE id = ?', args: [accountId] });
        const row = r.rows[0];
        if (!row) return 'unknown';
        if (!admin && Number(row.is_admin) === 1) {
          const n = await tx.execute('SELECT COUNT(*) AS n FROM accounts WHERE is_admin = 1');
          if (Number(n.rows[0]?.n) <= 1) return 'last_admin';
        }
        await tx.execute({ sql: 'UPDATE accounts SET is_admin = ? WHERE id = ?', args: [admin ? 1 : 0, accountId] });
        return 'ok';
      });
    },
  };
}
