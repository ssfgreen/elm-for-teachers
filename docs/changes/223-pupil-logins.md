# 223: the teacher makes and lists pupil logins (item A of #221)

Server only. The card is item E; signing in with a login is item B; Regenerate (which unlocks) is F.

## What was built

- Migration `0048_pupil_logins.sql`: one table, `pupil_logins` (id, session_id, class_id,
  username UNIQUE, password_hash, pupil_id NULL, wrong_tries, locked_at NULL, created_at,
  used_at NULL), indexed on session and class.
- `packages/server/src/pupil-logins/`:
  - `words.ts`: 260 words (animals, food, places, things, describing words), three to eight
    letters, avoiding first names, colours that name people, slang and teasing (59 taken out and
    67 put in after review). `words.test.ts` has a
    block list; read the list again before adding to it. `makeUsername()` two words and two digits,
    `makePassword()` two words and three digits, both with `randomInt` from `node:crypto`.
  - `hash.ts`: scrypt (N 16384, r 8, p 1, 32-byte key, 16-byte salt each), stored as
    `scrypt$N$r$p$salt$hash` so the cost can change later; `timingSafeEqual`; `dummyVerify(password)`
    does the same work against a hash nothing matches and returns false.
  - `store.ts`: `make` (hashes before the write transaction, retries a taken username up to 20
    times with `ON CONFLICT (username) DO NOTHING`, logs `pupil_logins_made` in the same
    transaction), `listForClass` (in the order made; label "Pupil N" through `memberLabel` once the
    login's pupil is a member of the class), `byUsername` (trims and lower-cases what was typed),
    `signedIn` (every good sign-in), `wrongTry` (locks at `MAX_WRONG_TRIES` = 5 in a row),
    `remove` (never-used only). `make` checks the class is not archived again inside the transaction.
  - `teacher-routes.ts`: `POST`, `GET` `/api/sessions/:sessionId/classes/:id/logins` and
    `DELETE .../logins/:loginId`, as in `docs/routes.md`.
- Event `pupil_logins_made {class_id, count}`, server-only (`SERVER_ONLY_KINDS`).
- `pupil_logins` in `PUPIL_TABLES` (`delete`, keyed by pupil, before `pupils`) and in
  `SESSION_TABLES` (before `classes`).

## Decisions the brief left open

- The make response carries `Cache-Control: no-store`, as it holds passwords.
- Make returns 200 (as the class code route does), not 201.
- "Not in the export": the `pupil_logins` table is not exported (the export knows nothing of it).
  The `pupil_logins_made` event is in `events.jsonl` like every event, with the class id and count
  only; `export/` was not to be changed. The guard test checks no username, password or hash is in
  the export.
- Deleting a login is not logged (the brief names only `pupil_logins_made`).
- Listing and deleting work with pupils off (as reading and closing a class code do); only make is
  refused. Deleting works for an archived class.
- `label` is null for a used login whose pupil is not (yet) a member of the class. B should join
  the pupil to the class on first use, so this is only a moment.
- `signedIn` is called on every good sign-in: it sets wrong tries back to 0 each time, so the lock
  is for 5 wrong passwords in a row, and on the first it makes the login the pupil's. It is false if
  the login is already another pupil's, and it does not unlock a locked login.
- There is no limit on how many batches a class can have (40 a batch only). Left as it is after review.
- Classes are never deleted (only archived), so "goes with its class" is covered by the workspace.

## For B (sign-in with a login)

- `byUsername(typed)` then, if found and not locked, `verifyPassword(password, login.password_hash)`;
  if not found, `dummyVerify(password)`. On a wrong password `wrongTry(id)`; when it reports
  `locked`, show "Ask your teacher for a new password".
- First use needs the class code (question 110): B checks it against `login.class_id`.
- `signedIn(id, pupilId)` on every good sign-in, not only the first.

## Left

- F: Regenerate (a new password, which also clears `wrong_tries` and `locked_at`). The store has no
  method for it yet.
- A pupil row for a login: `pupils.provider` needs a value for login pupils; that is B's.
