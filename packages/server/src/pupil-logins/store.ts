/**
 * Pupil logins (issue #223): made in batches by the teacher for one class, each a username and a
 * password from words.ts. Only the password's hash is kept (hash.ts); the password itself leaves
 * the server once, in what `make` returns. A login becomes a pupil's the first time it is used
 * (B, `signedIn`); after `MAX_WRONG_TRIES` wrong passwords in a row it is locked until the
 * teacher makes a new password (F). Each try is claimed before its password is checked
 * (`claimTry`), so a burst at the same moment cannot get past the limit.
 *
 * Privacy: no name and no email, for the login or the pupil. `pupil_logins_made` carries the
 * class id and the count only: never a username, password or hash.
 */
import { newUlid, nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Row } from '../db/types.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { memberLabel, type MemberRole } from '../class-joins/store.js';
import { hashPassword } from './hash.js';
import { makePassword, makeUsername } from './words.js';

export const MAX_LOGINS_A_BATCH = 40;
export const MAX_WRONG_TRIES = 5;
/** Tries at a free username before giving up: with the word list's millions, a clash is rare. */
const USERNAME_TRIES = 20;

export interface PupilLogin {
  id: string;
  session_id: string;
  class_id: string;
  username: string;
  /** The pupil who uses it, from its first use; null until then. */
  pupil_id: string | null;
  wrong_tries: number;
  locked: boolean;
  created_at: string;
  used_at: string | null;
}

/** A login with its stored hash: for sign-in (B) only, never sent anywhere. */
export type StoredLogin = PupilLogin & { password_hash: string };

/** What `make` returns: the one place a password is ever seen. */
export interface MadeLogin {
  id: string;
  username: string;
  password: string;
}

/** A login as the teacher's list shows it: "Pupil N" once used and in the class, else null. */
export type ListedLogin = PupilLogin & { label: string | null };

export interface PupilLoginStore {
  /**
   * `count` new logins for the class, logged as `pupil_logins_made`. Undefined when the class is
   * not this workspace's, 'archived' for an archived class. The caller checks the count.
   */
  make(sessionId: string, classId: string, count: number, envelope: ServerEnvelope): Promise<MadeLogin[] | undefined | 'archived'>;
  /** The class's logins in the order they were made. Undefined when the class is not this workspace's. */
  listForClass(sessionId: string, classId: string): Promise<ListedLogin[] | undefined>;
  /** The login with this username (any case, spaces round it ignored), or null. */
  byUsername(username: string): Promise<StoredLogin | null>;
  /**
   * Call on every good sign-in, not only the first: the wrong tries start again (the lock is for
   * `MAX_WRONG_TRIES` in a row), and the first makes the login the pupil's and stamps `used_at`.
   * Safe to repeat. False when the login is another pupil's, or locked (by wrong tries that
   * finished while this one's password was being checked), or its password is no longer the one
   * `passwordHash` was read from (the teacher made a new one meanwhile, #246). Does not unlock a
   * locked login.
   */
  signedIn(loginId: string, pupilId: string, passwordHash: string): Promise<boolean>;
  /**
   * Takes one try before the password is checked, in one statement, so tries at the same moment
   * cannot all read the login as open: at most `MAX_WRONG_TRIES` in a row ever get as far as a
   * password check. Null when the login is locked, its tries are used up, or it is unknown.
   */
  claimTry(loginId: string): Promise<{ wrong_tries: number } | null>;
  /**
   * The claimed try was the right password: it is given back, whatever the sign-in does next, and
   * any lock goes with it. Usually a lock seen now was reached by counting this try (`claimTry`
   * only succeeds on an open login under the limit). Not always: if the right password was sent
   * twice at once, the other sign-in's `signedIn` sets the count to 0 while this try is out, and
   * five wrong tries can then lock the login before this release lifts it. Accepted: it needs the
   * right password twice at once while someone guesses, and it ends as if this try had signed in
   * just before the fifth wrong one (at most five more guesses).
   */
  releaseTry(loginId: string): Promise<void>;
  /**
   * The claimed try was a wrong password: locks the login once its tries reach
   * `MAX_WRONG_TRIES`. Null for an unknown login.
   */
  wrongTry(loginId: string): Promise<{ wrong_tries: number; locked: boolean } | null>;
  /** Delete a login never used. Undefined when it is not this class's, 'used' once it has been used. */
  remove(sessionId: string, classId: string, loginId: string): Promise<'removed' | 'used' | undefined>;
}

export function rowToLogin(r: Row): PupilLogin {
  return {
    id: String(r.id),
    session_id: String(r.session_id),
    class_id: String(r.class_id),
    username: String(r.username),
    pupil_id: r.pupil_id === null || r.pupil_id === undefined ? null : String(r.pupil_id),
    wrong_tries: Number(r.wrong_tries),
    locked: r.locked_at !== null && r.locked_at !== undefined,
    created_at: String(r.created_at),
    used_at: r.used_at === null || r.used_at === undefined ? null : String(r.used_at),
  };
}

export const normaliseUsername = (typed: string): string => typed.trim().toLowerCase();

export function createPupilLoginStore(db: Db, events: Pick<EventStore, 'appendServer'>): PupilLoginStore {
  const classRow = async (sessionId: string, classId: string) =>
    (await db.execute('SELECT archived_at FROM classes WHERE session_id = ? AND id = ?', [sessionId, classId])).rows[0];

  return {
    async make(sessionId, classId, count, envelope) {
      const c = await classRow(sessionId, classId);
      if (!c) return undefined;
      if (c.archived_at) return 'archived';
      // Hashed before the transaction: scrypt is slow on purpose, and the write lock is shared.
      const passwords = Array.from({ length: count }, makePassword);
      const hashes = await Promise.all(passwords.map(hashPassword));
      return db.transaction(async (tx) => {
        // Again inside: the class may have been archived while the passwords were hashed.
        const still = (await tx.execute({ sql: 'SELECT archived_at FROM classes WHERE id = ?', args: [classId] })).rows[0];
        if (!still || still.archived_at) return 'archived' as const;
        const made: MadeLogin[] = [];
        const now = nowIso();
        for (const [i, password] of passwords.entries()) {
          const id = newUlid();
          let username: string | null = null;
          for (let tries = 0; tries < USERNAME_TRIES && !username; tries++) {
            const candidate = makeUsername();
            const r = await tx.execute({
              sql: `INSERT INTO pupil_logins (id, session_id, class_id, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT (username) DO NOTHING`,
              args: [id, sessionId, classId, candidate, hashes[i]!, now],
            });
            if (r.rowsAffected === 1) username = candidate;
          }
          if (!username) throw new Error('no free username');
          made.push({ id, username, password });
        }
        await events.appendServer(sessionId, 'pupil_logins_made', { class_id: classId, count }, envelope, tx);
        return made;
      });
    },

    async listForClass(sessionId, classId) {
      if (!(await classRow(sessionId, classId))) return undefined;
      const r = await db.execute(
        `SELECT l.*, m.role, m.number FROM pupil_logins l
         LEFT JOIN class_members m ON m.class_id = l.class_id AND m.pupil_id = l.pupil_id
         WHERE l.session_id = ? AND l.class_id = ? ORDER BY l.created_at, l.rowid`,
        [sessionId, classId],
      );
      return r.rows.map((row) => ({
        ...rowToLogin(row),
        label: row.role === null || row.role === undefined ? null : memberLabel({ role: row.role as MemberRole, number: row.number === null ? null : Number(row.number) }),
      }));
    },

    async byUsername(username) {
      const r = await db.execute('SELECT * FROM pupil_logins WHERE username = ?', [normaliseUsername(username)]);
      const row = r.rows[0];
      return row ? { ...rowToLogin(row), password_hash: String(row.password_hash) } : null;
    },

    async signedIn(loginId, pupilId, passwordHash) {
      const r = await db.execute(
        `UPDATE pupil_logins SET pupil_id = ?, used_at = COALESCE(used_at, ?), wrong_tries = 0
         WHERE id = ? AND locked_at IS NULL AND (pupil_id IS NULL OR pupil_id = ?) AND password_hash = ?`,
        [pupilId, nowIso(), loginId, pupilId, passwordHash],
      );
      return r.rowsAffected === 1;
    },

    async claimTry(loginId) {
      const r = await db.execute(
        'UPDATE pupil_logins SET wrong_tries = wrong_tries + 1 WHERE id = ? AND locked_at IS NULL AND wrong_tries < ? RETURNING wrong_tries',
        [loginId, MAX_WRONG_TRIES],
      );
      const row = r.rows[0];
      return row ? { wrong_tries: Number(row.wrong_tries) } : null;
    },

    async releaseTry(loginId) {
      await db.execute('UPDATE pupil_logins SET wrong_tries = MAX(wrong_tries - 1, 0), locked_at = NULL WHERE id = ?', [loginId]);
    },

    async wrongTry(loginId) {
      const r = await db.execute(
        `UPDATE pupil_logins SET locked_at = CASE WHEN locked_at IS NULL AND wrong_tries >= ? THEN ? ELSE locked_at END
         WHERE id = ? RETURNING wrong_tries, locked_at`,
        [MAX_WRONG_TRIES, nowIso(), loginId],
      );
      const row = r.rows[0];
      return row ? { wrong_tries: Number(row.wrong_tries), locked: row.locked_at !== null } : null;
    },

    async remove(sessionId, classId, loginId) {
      const r = await db.execute('SELECT pupil_id, used_at FROM pupil_logins WHERE id = ? AND session_id = ? AND class_id = ?', [loginId, sessionId, classId]);
      const row = r.rows[0];
      if (!row) return undefined;
      if (row.pupil_id !== null || row.used_at !== null) return 'used';
      const d = await db.execute('DELETE FROM pupil_logins WHERE id = ? AND pupil_id IS NULL AND used_at IS NULL', [loginId]);
      return d.rowsAffected === 1 ? 'removed' : 'used';
    },
  };
}
