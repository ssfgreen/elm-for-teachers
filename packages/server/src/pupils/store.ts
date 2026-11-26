/**
 * Pupils who sign in on the pupil page (issue #179). A pupil is one identity from a sign-in
 * provider, kept as the provider, the subject and the tenant only: never a name or an email
 * (the provider is asked for `openid` alone). A pupil is not a teacher account and has no
 * workspace; joining a class comes later (#152 P2).
 *
 * Privacy: nothing here logs a subject or writes to `events`; a sign-in id is stored only as a hash.
 */
import { randomBytes } from 'node:crypto';
import type { Row } from '../db/types.js';
import { newUlid, nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Transaction } from '../db/types.js';
import { hashCode } from '../accounts/store.js';
import { PUPIL_SIGN_IN_DAYS } from './cookies.js';

/** What is kept about a pupil, and all of it. */
export interface PupilIdentity {
  provider: string;
  subject: string;
  /** Microsoft: the directory (tenant) id; Google: the Workspace domain (`hd`); null when none. */
  tenant: string | null;
}

export interface Pupil extends PupilIdentity {
  id: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface PupilStore {
  findPupil(provider: string, subject: string): Promise<Pupil | null>;
  /** The identity's pupil, made if new; records the sign-in time and keeps the tenant up to date. */
  signIn(identity: PupilIdentity): Promise<Pupil>;
  /** A new sign-in for the cookie: returns its id, which is stored only as a hash. */
  startSignIn(pupilId: string, days?: number): Promise<{ id: string; expires_at: string }>;
  /**
   * `startSignIn` for a pupil who signed in with a teacher's login (#246): only while the login
   * still has the password hash that was checked, in the same statement as the insert. Null when
   * the teacher made a new password meanwhile (or the login is gone). A new password ends the
   * pupil's sign-ins in one transaction with the hash change, so a sign-in is either ended by it
   * or never started.
   */
  startLoginSignIn(pupilId: string, login: { id: string; password_hash: string }, days?: number): Promise<{ id: string; expires_at: string } | null>;
  /** The pupil a sign-in id belongs to, or null when unknown, ended or expired. */
  pupilForSignIn(id: string): Promise<Pupil | null>;
  /** End a sign-in (sign-out): the id no longer works anywhere. */
  endSignIn(id: string): Promise<void>;
}

/** Ends every sign-in of the pupil, inside the caller's transaction: they are signed out everywhere. */
export async function endSignInsOf(tx: Pick<Transaction, 'execute'>, pupilId: string): Promise<void> {
  await tx.execute({ sql: 'DELETE FROM pupil_sign_ins WHERE pupil_id = ?', args: [pupilId] });
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function rowToPupil(row: Row): Pupil {
  return {
    id: String(row.id),
    provider: String(row.provider),
    subject: String(row.subject),
    tenant: str(row.tenant),
    created_at: String(row.created_at),
    last_sign_in_at: str(row.last_sign_in_at),
  };
}

export function createPupilStore(db: Db): PupilStore {
  const find = async (provider: string, subject: string): Promise<Pupil | null> => {
    const r = await db.execute('SELECT * FROM pupils WHERE provider = ? AND subject = ?', [provider, subject]);
    return r.rows[0] ? rowToPupil(r.rows[0]) : null;
  };

  /** A sign-in for the pupil; with `login`, only while that login still has `password_hash`. */
  const start = async (pupilId: string, days: number, login: { id: string; password_hash: string } | null) => {
    const id = randomBytes(32).toString('base64url');
    const now = new Date();
    const expires_at = new Date(now.getTime() + days * 86_400_000).toISOString();
    const values = [hashCode(id), pupilId, now.toISOString(), expires_at];
    const made = await db.transaction(async (tx) => {
      await tx.execute({ sql: 'DELETE FROM pupil_sign_ins WHERE pupil_id = ? AND expires_at <= ?', args: [pupilId, now.toISOString()] });
      const r = login
        ? await tx.execute({
            sql: `INSERT INTO pupil_sign_ins (id_hash, pupil_id, created_at, expires_at) SELECT ?, ?, ?, ?
                  WHERE EXISTS (SELECT 1 FROM pupil_logins WHERE id = ? AND password_hash = ?)`,
            args: [...values, login.id, login.password_hash],
          })
        : await tx.execute({ sql: 'INSERT INTO pupil_sign_ins (id_hash, pupil_id, created_at, expires_at) VALUES (?, ?, ?, ?)', args: values });
      return r.rowsAffected === 1;
    });
    return made ? { id, expires_at } : null;
  };

  return {
    findPupil: find,

    async signIn({ provider, subject, tenant }) {
      const now = nowIso();
      await db.transaction((tx) =>
        tx.execute({
          sql: `INSERT INTO pupils (id, provider, subject, tenant, created_at, last_sign_in_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (provider, subject) DO UPDATE SET tenant = excluded.tenant, last_sign_in_at = excluded.last_sign_in_at`,
          args: [newUlid(), provider, subject, tenant, now, now],
        }),
      );
      const pupil = await find(provider, subject);
      if (!pupil) throw new Error('pupil not saved');
      return pupil;
    },

    async startSignIn(pupilId, days = PUPIL_SIGN_IN_DAYS) {
      const started = await start(pupilId, days, null);
      if (!started) throw new Error('sign-in not started');
      return started;
    },

    startLoginSignIn: (pupilId, login, days = PUPIL_SIGN_IN_DAYS) => start(pupilId, days, login),

    async pupilForSignIn(id) {
      const r = await db.execute('SELECT p.* FROM pupil_sign_ins s JOIN pupils p ON p.id = s.pupil_id WHERE s.id_hash = ? AND s.expires_at > ?', [hashCode(id), nowIso()]);
      return r.rows[0] ? rowToPupil(r.rows[0]) : null;
    },

    async endSignIn(id) {
      await db.transaction((tx) => tx.execute({ sql: 'DELETE FROM pupil_sign_ins WHERE id_hash = ?', args: [hashCode(id)] }));
    },
  };
}
