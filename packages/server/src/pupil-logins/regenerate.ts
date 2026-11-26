/**
 * A new password for one pupil login (issue #246, F of #221), for a pupil who forgot theirs or
 * whose login is locked. Works on a login used or not, locked or not. In one transaction it:
 *
 *   - sets the new password's hash;
 *   - unlocks the login and starts its wrong tries again;
 *   - ends every sign-in of the login's pupil, if it has one, so they are signed out everywhere;
 *   - logs `pupil_password_reset`, the class id only.
 *
 * The old password stops at once, even for a sign-in already under way with it: that sign-in's
 * `signedIn` (store.ts) and then its `startLoginSignIn` (pupils/store.ts) each go ahead only while
 * the login still has the hash it checked. The second is one statement with its insert, so the
 * sign-in either starts before this transaction (and is ended by it) or does not start at all.
 *
 * The password leaves the server once, in what this returns, like `make`'s. Ending the pupil's
 * sign-ins ends any other way they signed in too: a pupil from a login has only this one.
 */
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { endSignInsOf } from '../pupils/store.js';
import { hashPassword } from './hash.js';
import type { MadeLogin } from './store.js';
import { makePassword } from './words.js';

/**
 * A new password for the class's login. Undefined when the class is not this workspace's or the
 * login is not in it; 'archived' for an archived class.
 */
export async function newPassword(
  db: Db,
  events: Pick<EventStore, 'appendServer'>,
  sessionId: string,
  classId: string,
  loginId: string,
  envelope: ServerEnvelope,
): Promise<MadeLogin | undefined | 'archived'> {
  const sql = `SELECT l.username, l.pupil_id, c.archived_at FROM pupil_logins l JOIN classes c ON c.id = l.class_id
               WHERE l.id = ? AND l.class_id = ? AND l.session_id = ? AND c.session_id = ?`;
  const args = [loginId, classId, sessionId, sessionId];
  const before = (await db.execute(sql, args)).rows[0];
  if (!before) return undefined;
  if (before.archived_at) return 'archived';
  // Hashed before the transaction, as `make` does: scrypt is slow on purpose.
  const password = makePassword();
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    // Again inside: the class may have been archived, or the login removed, meanwhile.
    const now = (await tx.execute({ sql, args })).rows[0];
    if (!now) return undefined;
    if (now.archived_at) return 'archived' as const;
    await tx.execute({ sql: 'UPDATE pupil_logins SET password_hash = ?, wrong_tries = 0, locked_at = NULL WHERE id = ?', args: [hash, loginId] });
    if (now.pupil_id !== null && now.pupil_id !== undefined) await endSignInsOf(tx, String(now.pupil_id));
    await events.appendServer(sessionId, 'pupil_password_reset', { class_id: classId }, envelope, tx);
    return { id: loginId, username: String(now.username), password };
  });
}
