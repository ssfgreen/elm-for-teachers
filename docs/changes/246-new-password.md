# 246: a new password for a pupil login

Item F of #221, replacing P3b. Answers questions 92, 111, 113 and 116. No migration (the columns
exist since 0048). One new event kind.

## What was built

- **`shared`**: `pupil_password_reset`, payload `{ class_id }` only, server-only
  (`events/classes.ts`, `events.ts`, `events/serverOnly.ts`; 98 kinds).
- **`server/src/pupil-logins/regenerate.ts`**: `newPassword(db, events, sessionId, classId,
  loginId, envelope)`. Makes and hashes the password before the transaction, as `make` does. In
  one transaction it checks again that the login is in this workspace's class and the class is not
  archived, sets the new hash with `wrong_tries = 0` and `locked_at = NULL`, deletes every
  `pupil_sign_ins` row of the login's pupil (if it has one), and logs `pupil_password_reset`.
  Returns `{ id, username, password }`, undefined (404) or `'archived'` (409).
- **Route** `POST /api/sessions/:sessionId/classes/:id/logins/:loginId/password {envelope}` in
  `teacher-routes.ts`: `{ login }`, `Cache-Control: no-store`, the same gate as Make (403
  `pupils_off` or `feature_off`). Row in `docs/routes.md`.
- **The old password stops at once** (question 92), at two points:
  - `PupilLoginStore.signedIn` takes the hash the sign-in checked and matches on it
    (`AND password_hash = ?`). In `pupils/login.ts`, when `signedIn` refuses and the hash now
    stored differs from the one checked (or the login is gone), the refusal is `login_wrong`;
    otherwise as before (`login_locked` or `login_taken`).
  - A new password can also land after `signedIn` and before the route starts the sign-in (on
    first use the class join is between). So `pupilLogin` returns `checked` (the login id and the
    hash), and the route starts the sign-in with `PupilStore.startLoginSignIn`, an
    `INSERT … SELECT … WHERE EXISTS` on the login still having that hash; null gives 401
    `login_wrong`. Write transactions are serial, so the sign-in either starts before the new
    password (and the new password's transaction ends it) or does not start. Found in review.
  - On first use, a sign-in refused this late has already made the login the pupil's and joined
    the class. Accepted: the pupil signs in later with the new password as that same pupil.
- `pupils/store.ts` has `endSignInsOf(tx, pupilId)`, which `regenerate.ts` uses inside its
  transaction.
- **Client**: `api/pupilLogins.ts` `newPupilPassword`, `endpoints.pupilLoginPassword`;
  `hasPupilLogins` now needs all four calls. `usePupilLogins` has `confirmingNewPassword`,
  `askNewPassword`, `cancelNewPassword`, `confirmNewPassword` (the same one-request rule and
  late-answer guard), and `madeBy` (`'make'` or `'new-password'`). `PupilLoginsCard`: **New
  password** on each row while pupils can join and no passwords panel is open, `aria-describedby`
  its row's username box; the second click is in group "New password". `LoginSlips` takes a
  `title` (default "New logins"). `pupilLogins.ts` has `CONFIRM_NEW_PASSWORD`, the two titles,
  `NEW_PASSWORD_RELOAD_FAILED` and `newPasswordRefusal`.

## Decisions the brief did not cover

- Asking for a New password puts away a Delete being asked on any row, and the other way round,
  so only one second-click question is open at a time.
- While a row's question is open, that row shows neither New password nor Delete.
- A Make puts away a New password being asked, the question is not drawn while passwords are on
  show, and a confirm then does nothing: a New password never replaces a batch on screen. Found
  in review.
- A 404 reads "That login is no longer in this class." (as Delete's).
- If the list cannot reload after a New password, the new password stays on screen and the card
  says "The new password was made, but the list could not reload."
- `signedIn`'s third argument is required, not optional, so no caller can skip the check. The
  store and teacher-route tests pass the stored hash through a small helper.
- A login deleted while a sign-in was checking it now gives `login_wrong` (was `login_taken`).

## Tests

- `pupil-logins/regenerate.test.ts`: every server acceptance point, including the races: the new
  password made while the old one's check is open, and made between `signedIn` and the sign-in's
  start (used login, and first use). Each is refused `login_wrong` with no `pupil_sign_ins` row.
  Both were seen failing before their fix.
- Client: `usePupilLogins.test.ts`, `PupilLoginsCard.test.tsx`, `LoginSlips.test.tsx`,
  `pupilLogins.test.ts`, `api/pupilLogins.test.ts`.
- e2e `e2e/pupilPassword.spec.ts`: lock by five wrong tries, New password twice, old password
  401, old cookie 401, new password 204, not Locked after reload, one event with `{class_id}`.

## What is left

- The pupil's page does not say why they were signed out; they see the sign-in screen (D's).
- Nothing tells the teacher which pupil a login belongs to beyond its label, as before.
