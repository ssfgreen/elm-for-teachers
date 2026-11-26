# 231: pupils sign in with a teacher's login (B of #221)

## What was built

- `POST /api/pupil/login {username, password, code?}`: 204 and the pupil sign-in cookie.
- `packages/server/src/pupils/login.ts`: the steps, with no Fastify (`pupilLogin`). In order: a
  blocked address (429 `too_many_codes`); an unknown username (`dummyVerify`, counted on the
  address, 401 `login_wrong`); a locked login (403 `login_locked`, no password check); a try
  claimed on the login before the password check (`claimTry`, see below); a wrong password
  (`wrongTry`, counted on the login only; the try that locks it already answers `login_locked`);
  a right one gives its try back (`releaseTry`); first use needs the login's own class's live
  code (`checkClassCode`, so an unknown code is counted and answers with `JOIN_STATUS`; another class's live code is 403
  `code_other_class`, not counted); then `admitPupil` as provider `login`, subject the login's id,
  `signedIn` on every good sign-in (false: 409 `login_taken`, or 403 `login_locked` when locked
  meanwhile), then `joins.join` on first use.
- `packages/server/src/pupils/login-routes.ts`: `registerPupilLoginSignIn`, its own plugin under
  `/api/pupil`, repeating the gate (`no-store`, 403 `pupils_off`), `fromSite`, the 64-character body
  limits, `LOGIN_STATUS` (refusal to status), ending a previous pupil sign-in, setting the cookie.
- `app.ts`: registered with the shared `wrongCodes` counter.
- `docs/routes.md`: one row with every refusal code, for D to word. `ARCHITECTURE.md`: the
  `pupils/` line names the login route.

## The lock and tries at the same moment (review round 1)

Checking the lock, then the password, then counting let a burst of wrong passwords all read the
login as open: 50 at once left 50 tries, and a right password in the burst signed in while the
login ended up locked. So `pupil-logins/store.ts` (A's, changed with the orchestrator's leave)
gained:

- `claimTry`: one `UPDATE ... WHERE locked_at IS NULL AND wrong_tries < 5 RETURNING`, before the
  password check. No row back: 403 `login_locked`. At most five tries in a row ever reach scrypt.
- `wrongTry` no longer counts (the claim did): it locks once the tries reach five.
- `releaseTry`: a right password gives its try back, so a pupil with the right password and a
  wrong class code does not lock their own login. It also clears any lock (round 2): with three
  wrong done, a fourth wrong and the right one at once take places 4 and 5, the wrong one locks,
  and the right one would be refused. Usually a lock seen on release was reached by counting this
  try, since `claimTry` only succeeds on an open login under five. Not always (round 3): with the
  right password sent twice at once, one signs in and `signedIn` sets the count to 0 while the
  other's try is out; five wrong tries can then lock the login, and the other's release lifts the
  lock and it signs in. Accepted: it needs the right password twice at once while someone
  guesses, and it ends as if that sign-in had come just before the fifth wrong try (at most five
  more guesses). A store test pins this order. A wrong one in a burst may still answer
  `login_locked` for a moment.
- A password check that throws also gives its try back, so failures cannot use up a login's
  tries while the teacher's list shows it open.
- `signedIn` refuses a locked login. `login.ts` now calls it before `joins.join`, so a login
  locked during the burst joins no class. On that path a first use leaves a `pupils` row (provider
  `login`, subject the login id) with no class and no sign-in; a later first use reuses it. Left
  as it is (round 2): it holds nothing but the login's id.

In a pure burst all five claimed wrong tries may answer `login_locked` (whichever finishes first
locks the login). That is the right message for the pupil.

## Left as it is

- Timing: a wrong password on a known username does two more database writes (`claimTry`,
  `wrongTry`) than an unknown one, which does only `dummyVerify`. The gap is small next to scrypt,
  and the address counter limits probing for usernames, so it stays (orchestrator's call).

## Decisions the brief did not cover

- A blank or spaces-only `code` on first use is treated as no code: 403 `code_needed`, not counted.
- The code a pupil types is trimmed before `checkClassCode` (which normalises it further).
- Refusals answer `{error, code}` like the other pupil routes; the `error` text is the same for
  every refusal, so an unknown username and a wrong password have byte-for-byte the same body.
- `teacher_account` (from `admitPupil`) maps to 403. It cannot happen for provider `login`, but the
  type allows it.
- A refused sign-in is logged at info level with `{reason}` only.

## For the next items

- D (the pupil's form): word the codes in the `docs/routes.md` row. `login_locked` is "Ask your
  teacher for a new password". The form must send `Origin` (a normal fetch from the site does).
- F (Regenerate) unlocks; nothing here clears a lock.
- No migration, no event, no e2e (D brings a screen).
