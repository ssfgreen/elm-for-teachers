/** The pupil login store (issue #223): batches, unique usernames, first use, the lock, removal. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { classWithCode } from '../class-joins/test-class.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { createPupilStore } from '../pupils/store.js';
import { forgetPupil } from '../pupils/tables.js';
import { removeMember } from '../pupils/remove.js';
import { verifyPassword } from './hash.js';
import { createPupilLoginStore, MAX_WRONG_TRIES, type PupilLoginStore } from './store.js';
import * as words from './words.js';
import * as hash from './hash.js';

let t: TempDb;
let deps: AppDeps;
let store: PupilLoginStore;
let n = 0;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  store = createPupilLoginStore(t.db, deps.events);
});
afterAll(() => t.cleanup());

async function made(count = 1) {
  const c = await classWithCode(deps);
  const logins = await store.make(c.session.session_id, c.cls.id, count, c.env);
  if (!Array.isArray(logins)) throw new Error('not made');
  return { c, logins };
}

/** `signedIn` with the login's hash as stored now, as a sign-in that just checked it passes. */
const signedIn = async (loginId: string, pupilId: string) => {
  const row = (await t.db.execute('SELECT password_hash FROM pupil_logins WHERE id = ?', [loginId])).rows[0];
  return store.signedIn(loginId, pupilId, String(row?.password_hash));
};

const pupil = () => createPupilStore(t.db).signIn({ provider: 'test', subject: `login-${++n}`, tenant: null });

describe('make', () => {
  it('stores a hash that verifies, never the password, and the list has no password', async () => {
    const { c, logins } = await made(2);
    expect(logins).toHaveLength(2);
    const row = (await t.db.execute('SELECT * FROM pupil_logins WHERE id = ?', [logins[0]!.id])).rows[0]!;
    expect(row.password_hash).not.toBe(logins[0]!.password);
    expect(String(row.password_hash)).not.toContain(logins[0]!.password);
    expect(await verifyPassword(logins[0]!.password, String(row.password_hash))).toBe(true);
    const list = await store.listForClass(c.session.session_id, c.cls.id);
    expect(list!.map((l) => l.username)).toEqual(logins.map((l) => l.username));
    expect(JSON.stringify(list)).not.toContain(logins[0]!.password);
  });

  it('tries another username when one is taken, in another class or the same batch', async () => {
    const { logins } = await made(1);
    const taken = logins[0]!.username;
    const spy = vi.spyOn(words, 'makeUsername').mockReturnValueOnce(taken).mockReturnValueOnce('fresh-otter-01').mockReturnValueOnce('fresh-otter-01').mockReturnValueOnce('fresh-otter-02');
    try {
      const again = await made(2);
      expect(again.logins.map((l) => l.username)).toEqual(['fresh-otter-01', 'fresh-otter-02']);
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses an archived class and another workspace’s', async () => {
    const c = await classWithCode(deps);
    const other = await classWithCode(deps);
    expect(await store.make(c.session.session_id, other.cls.id, 1, c.env)).toBeUndefined();
    await t.db.execute('UPDATE classes SET archived_at = ? WHERE id = ?', [new Date().toISOString(), c.cls.id]);
    expect(await store.make(c.session.session_id, c.cls.id, 1, c.env)).toBe('archived');
  });

  it('makes none, and logs nothing, when the class is archived while the passwords are hashed', async () => {
    const c = await classWithCode(deps);
    const real = hash.hashPassword;
    const spy = vi.spyOn(hash, 'hashPassword').mockImplementation(async (p) => {
      await t.db.execute('UPDATE classes SET archived_at = ? WHERE id = ?', [new Date().toISOString(), c.cls.id]);
      return real(p);
    });
    try {
      expect(await store.make(c.session.session_id, c.cls.id, 2, c.env)).toBe('archived');
    } finally {
      spy.mockRestore();
    }
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM pupil_logins WHERE class_id = ?', [c.cls.id])).rows[0]!.c).toBe(0);
    expect((await t.db.execute("SELECT COUNT(*) AS c FROM events WHERE kind = 'pupil_logins_made' AND session_id = ?", [c.session.session_id])).rows[0]!.c).toBe(0);
  });
});

describe('use, wrong tries and removal', () => {
  it('finds a login by username in any case, marks it used once, and labels it as the class member', async () => {
    const { c, logins } = await made(1);
    const found = await store.byUsername(`  ${logins[0]!.username.toUpperCase()} `);
    expect(found!.id).toBe(logins[0]!.id);
    const p = await pupil();
    expect(await signedIn(found!.id, p.id)).toBe(true);
    expect(await signedIn(found!.id, (await pupil()).id)).toBe(false);
    expect((await store.listForClass(c.session.session_id, c.cls.id))![0]!.label).toBeNull();
    await createClassJoinStore(t.db, deps.events).join(p.id, { class_id: c.cls.id, session_id: c.session.session_id });
    const [listed] = (await store.listForClass(c.session.session_id, c.cls.id))!;
    expect([listed!.label, listed!.used_at !== null, listed!.pupil_id]).toEqual(['Pupil 1', true, p.id]);
  });

  it('refuses a sign-in that checked a hash the login no longer has (#246), changing nothing', async () => {
    const { logins } = await made(1);
    const id = logins[0]!.id;
    const p = await pupil();
    expect(await store.signedIn(id, p.id, 'scrypt$16384$8$1$stale$stale')).toBe(false);
    const login = (await store.byUsername(logins[0]!.username))!;
    expect([login.pupil_id, login.used_at]).toEqual([null, null]);
    expect(await signedIn(id, p.id)).toBe(true);
  });

  it(`locks after ${MAX_WRONG_TRIES} wrong passwords`, async () => {
    const { logins } = await made(1);
    const id = logins[0]!.id;
    for (let i = 1; i < MAX_WRONG_TRIES; i++) {
      expect(await store.claimTry(id)).toEqual({ wrong_tries: i });
      expect(await store.wrongTry(id)).toEqual({ wrong_tries: i, locked: false });
    }
    expect(await store.claimTry(id)).toEqual({ wrong_tries: MAX_WRONG_TRIES });
    expect(await store.wrongTry(id)).toEqual({ wrong_tries: MAX_WRONG_TRIES, locked: true });
    expect((await store.byUsername(logins[0]!.username))!.locked).toBe(true);
    expect(await store.claimTry(id)).toBeNull();
    expect(await signedIn(id, (await pupil()).id)).toBe(false);
    expect(await store.wrongTry('nope')).toBeNull();
    expect(await store.claimTry('nope')).toBeNull();
  });

  it(`claims at most ${MAX_WRONG_TRIES} tries in a row, even all at once; a right password gives its try back`, async () => {
    const { logins } = await made(1);
    const id = logins[0]!.id;
    const claims = await Promise.all(Array.from({ length: 20 }, () => store.claimTry(id)));
    expect(claims.filter(Boolean)).toHaveLength(MAX_WRONG_TRIES);
    expect((await store.byUsername(logins[0]!.username))!.locked).toBe(false);
    await store.releaseTry(id);
    expect(await store.claimTry(id)).toEqual({ wrong_tries: MAX_WRONG_TRIES });
    const p = await pupil();
    expect(await signedIn(id, p.id)).toBe(true);
    expect((await store.byUsername(logins[0]!.username))!.wrong_tries).toBe(0);
    await store.releaseTry(id);
    expect((await store.byUsername(logins[0]!.username))!.wrong_tries).toBe(0);
  });

  it('a right password checked while the last wrong one locks the login still signs in', async () => {
    const { logins } = await made(1);
    const id = logins[0]!.id;
    for (let i = 1; i < MAX_WRONG_TRIES - 1; i++) {
      await store.claimTry(id);
      await store.wrongTry(id);
    }
    await store.claimTry(id); // the fourth wrong one
    await store.claimTry(id); // the right one, in the fifth place
    expect(await store.wrongTry(id)).toEqual({ wrong_tries: MAX_WRONG_TRIES, locked: true });
    await store.releaseTry(id);
    const login = (await store.byUsername(logins[0]!.username))!;
    expect([login.wrong_tries, login.locked]).toEqual([MAX_WRONG_TRIES - 1, false]);
    expect(await signedIn(id, (await pupil()).id)).toBe(true);
  });

  it('accepted: the right password twice at once, with five wrong between, lifts the lock they set', async () => {
    const { logins } = await made(1);
    const id = logins[0]!.id;
    const p = await pupil();
    await store.claimTry(id); // right try B
    await store.claimTry(id); // right try A
    await store.releaseTry(id);
    expect(await signedIn(id, p.id)).toBe(true); // A: the count is 0 while B is out
    for (let i = 0; i < MAX_WRONG_TRIES; i++) {
      await store.claimTry(id);
      await store.wrongTry(id);
    }
    expect((await store.byUsername(logins[0]!.username))!.locked).toBe(true);
    await store.releaseTry(id); // B
    const login = (await store.byUsername(logins[0]!.username))!;
    expect([login.wrong_tries, login.locked]).toEqual([MAX_WRONG_TRIES - 1, false]);
    expect(await signedIn(id, p.id)).toBe(true);
  });

  it(`locks only after ${MAX_WRONG_TRIES} wrong passwords in a row: every good sign-in starts the count again`, async () => {
    const { logins } = await made(1);
    const id = logins[0]!.id;
    const p = await pupil();
    for (let round = 0; round < 3; round++) {
      for (let i = 1; i < MAX_WRONG_TRIES; i++) {
        await store.claimTry(id);
        await store.wrongTry(id);
      }
      expect(await signedIn(id, p.id)).toBe(true);
    }
    const login = (await store.byUsername(logins[0]!.username))!;
    expect([login.wrong_tries, login.locked, login.pupil_id]).toEqual([0, false, p.id]);
    const firstUse = login.used_at;
    expect(await signedIn(id, p.id)).toBe(true);
    expect((await store.byUsername(logins[0]!.username))!.used_at).toBe(firstUse);
  });

  it('removes a login never used, refuses one used, and not another class’s', async () => {
    const { c, logins } = await made(2);
    const sid = c.session.session_id;
    await signedIn(logins[1]!.id, (await pupil()).id);
    expect(await store.remove(sid, 'other-class', logins[0]!.id)).toBeUndefined();
    expect(await store.remove(sid, c.cls.id, logins[1]!.id)).toBe('used');
    expect(await store.remove(sid, c.cls.id, logins[0]!.id)).toBe('removed');
    expect((await store.listForClass(sid, c.cls.id))!.map((l) => l.id)).toEqual([logins[1]!.id]);
  });

  it('goes when the teacher removes its pupil from the class (#220), and the class’s other logins stay', async () => {
    const { c, logins } = await made(2);
    const sid = c.session.session_id;
    const p = await pupil();
    await signedIn(logins[0]!.id, p.id);
    const member = await createClassJoinStore(t.db, deps.events).join(p.id, { class_id: c.cls.id, session_id: sid });
    expect(await removeMember(t.db, deps.events, sid, c.cls.id, member.id, c.env)).toBe('removed');
    expect((await store.listForClass(sid, c.cls.id))!.map((l) => l.id)).toEqual([logins[1]!.id]);
    expect(await store.byUsername(logins[0]!.username)).toBeNull();
    // Their last class: the pupil goes too.
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM pupils WHERE id = ?', [p.id])).rows[0]!.c).toBe(0);
  });

  it('stays the pupil’s when they are removed from another class they are in', async () => {
    const { c, logins } = await made(1);
    const other = await classWithCode(deps);
    const p = await pupil();
    await signedIn(logins[0]!.id, p.id);
    const joins = createClassJoinStore(t.db, deps.events);
    await joins.join(p.id, { class_id: c.cls.id, session_id: c.session.session_id });
    const there = await joins.join(p.id, { class_id: other.cls.id, session_id: other.session.session_id });
    expect(await removeMember(t.db, deps.events, other.session.session_id, other.cls.id, there.id, other.env)).toBe('removed');
    expect((await store.byUsername(logins[0]!.username))!.pupil_id).toBe(p.id);
  });

  it('goes when its pupil is forgotten, and all of them go with the workspace', async () => {
    const { c, logins } = await made(3);
    const p = await pupil();
    await signedIn(logins[0]!.id, p.id);
    await forgetPupil(t.db, p.id);
    expect((await store.listForClass(c.session.session_id, c.cls.id))!.map((l) => l.id)).toEqual([logins[1]!.id, logins[2]!.id]);
    await deps.sessions.delete(c.session.session_id);
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM pupil_logins WHERE session_id = ?', [c.session.session_id])).rows[0]!.c).toBe(0);
  });
});
