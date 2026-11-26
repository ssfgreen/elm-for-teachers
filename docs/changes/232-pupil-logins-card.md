# 232: the Pupil logins card

Item E of #221. Client only, on A's routes (#223). No migration, no new event.

## What was built

- **`client/src/api/pupilLogins.ts`**: `listPupilLogins`, `makePupilLogins(classId, count, envelope)`,
  `deletePupilLogin(classId, loginId)` (no body: the route reads none), `hasPupilLogins`, and
  `MAX_LOGINS_A_BATCH = 40` (the server's, which the client cannot import). Spread into
  `createSessionApi`; `endpoints.pupilLogins` and `endpoints.pupilLogin`. Not in `PUPIL_METHODS`,
  so list and Delete stay with pupils off.
- **`screens/classes/pupil-sign-in/`**:
  - `pupilLogins.ts` (pure): the wording, `loginCount` (a whole number from 1 to 40),
    `makeLabel`, `loginStatus`, `canDelete`, `showLoginsCard`, `makeRefusal`, `deleteRefusal`.
  - `slips.ts` (pure): `slipsHtml`, the print document. The steps line is built from
    `landing/content.ts`'s `SIGN_UP`, `WHO_PUPIL` and `LOG_IN`. `CODE_ON_SLIPS = false`.
  - `usePupilLogins.ts`: the list (the server's, reloaded after each Make and Delete), one request
    at a time (a ref, so two clicks in one tick send one; the first load counts, so Make waits for
    it), a generation per class so an older class's answer is dropped and does not free the next
    class's request, and `made`, the only place passwords live.
  - `LoginSlips.tsx`: the once-only "New logins" panel, Print slips and Done. `printInFrame`
    writes the slips into a hidden iframe (`srcdoc`, title "Login slips") and prints on its load.
    The iframe goes on `afterprint`, on Done and when the panel unmounts.
  - `PupilLoginsCard.tsx`: the card. Mounted in `ClassSidebar.tsx` between Class code and Pupils
    who joined, keyed by class.
  - `classCode.ts`: `siteAddress(origin)`. `classMembers.ts`: `login: 'Teacher login'` in
    `providerName`.
- **e2e**: `e2e/pupilLogins.spec.ts`.

## Decisions

- **The two open wordings**, each a one-line change: no class code on the slips is
  `CODE_ON_SLIPS` in `slips.ts` (set it true and the card reads the code through `getClassCode`
  when printing); "Teacher login" is the `login` entry of `PROVIDERS` in `classMembers.ts`.
- Make is hidden while the New logins panel is open, so a second Make cannot replace passwords
  not yet printed or written down.
- A refused Make or Delete does not reload the list ("leaves the list as it was"). A Make whose
  reload fails keeps the passwords on screen and says the list could not reload; a Delete whose
  reload fails says to reload the page.
- In the panel each login is its username over its password, each with a visible label: a
  password can be 21 characters, which two columns in the sidebar cut off. A list row is the
  username, then its status, "Locked" and Delete beneath.
- The labels are `<label>` elements in the panel and `aria-label` in the list; either way the
  interaction log reads "Username" or "Password", never the value.
- The card's hint: "A username and password for each pupil who signs in without Google or
  Microsoft." Make's label reads "Make logins" while the count is not 1 to 40.

## What is left

- F: a Regenerate button on each row (it unlocks a locked login); the row has room for it next to
  Delete.
- Once B (#231) has merged: an e2e showing a login used through B's route reads "Pupil 1" in the
  list and "Teacher login" under Pupils who joined. Used and locked rows are unit-tested only.
- The slips were printed only with `print` stubbed, in Chromium; a real print dialog was not
  tried, nor Firefox or Safari.
- `siteAddress` repeats `pupilAddress`'s scheme-stripping; `pupilAddress` could use it (left, as
  the review agreed).
