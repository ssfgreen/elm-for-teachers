# 209: pupils sign up with a class code

Plan on #152, item P2a. Built on the defaults of questions 90 to 92 (Sam, 23 Nov 22:40: "Use
sensible defaults").

## What was built

- **Two structural commits first** (no behaviour change): the wrong-code counter moved from
  `access/routes.ts` to `server/src/http/wrong-codes.ts`; `SESSION_TABLES` and the migrate test's
  table list are one entry per line.
- **Migration `0047_class_joins.sql`**: `class_codes` (one live code a class, kept plain),
  `class_members` (pupil, class, role `pupil` or `teacher_test`, number; a partial unique index keeps
  one test member a class) and `removed_pupils` (random id, workspace, class, day). All three are in
  `SESSION_TABLES`, so deleting a workspace deletes them.
- **`server/src/class-joins/`**:
  - `codes.ts`: eight characters of the access codes' alphabet, shown `XXXX-XXXX`.
  - `store.ts`: make (keeps the code it has), renew (the old one stops at once), close, read;
    `join` (the next number, or the membership the pupil already has); members of a class; classes
    of a pupil. `memberLabel()` is the one place "Pupil N" is made ("Test pupil" for the teacher's
    own).
  - `join.ts`: `checkClassCode` (typed code, counted when wrong) and `liveClass` (looked at again on
    the way back from the provider: a code closed meanwhile is refused).
  - `member.ts`: `memberOf` and `requireMember` for R1 and R2. Use `requireMember` after
    `requirePupil`; it sets `request.member` and refuses `not_member`, `class_archived`,
    `pupils_off` or `feature_off` (403).
  - `routes.ts`: the teacher's `GET`/`POST /classes/:id/code` and `GET /classes/:id/members`.
  - `test-class.ts`: tests only, a workspace with pupils on, a class and its code.
- **`server/src/pupils/`**:
  - `routes.ts`: `start?code=` checks the code (counted) and seals it in the state cookie; the
    callback checks it again, admits and joins. `POST /api/pupil/join` for a signed-in pupil;
    `/me` adds the pupil's open classes.
  - `admit.ts`: someone new without a code is refused, `code_needed`. A known pupil signs in
    without one.
  - `tables.ts`: `PUPIL_TABLES`, `pupilColumns()` and `forgetPupil()`. `tables.test.ts` fails
    when a column naming a pupil or a membership is missing from the list.
- **`app.ts`**: one wrong-code counter, given to both the access route and the pupil routes.
- **Event** `class_code_set` (`shared/src/events/classes.ts`): class id and action. Server-only.
- **Client**: `screens/pupil/ClassCode.tsx` ("First time? Class code" before the sign-in buttons,
  and the join form for a signed-in pupil with no class); `PupilScreen` shows "You are Pupil 3 in
  8B" and "There is nothing to do yet"; `pupilApi.ts` `joinClass`; four new messages.
  `api/endpoints.ts` has `classCode` and `classMembers` for P2b1's code card.
- **e2e**: `e2e/classCodes.spec.ts`, and `e2e/pupilClass.ts` (a workspace with pupils on, the demo
  class and a code made through the route). `e2e/pupils.spec.ts` now signs in with a code.

## What is stored and logged about a pupil

- New: which class they are in, their number in it, when they joined.
- `class_code_set` carries the class id and the action: never the code, never a pupil. A pupil
  joining is not an event.
- Nothing in the call log or the export. `class-joins/routes.test.ts` reads the export of a
  workspace with a joined pupil and finds no pupil id, subject, member id or tenant.
- The code is never logged: `start?code=` is under `/api/pupil/auth/`, whose query string the
  request log drops (`auth.ts` `logUrl`); `/join` carries it in the body.

## Decisions the brief did not cover

- A new pupil without a code is refused with `code_needed` ("The first time, type your class code
  before you sign in."). This changes P1: before, anyone could sign in on `/r`. The P1 tests and
  `e2e/pupils.spec.ts` now sign in with a code.
- A code renewed or closed while the pupil was at the provider: someone new is refused
  (`code_unknown`); a known pupil is signed in without joining and can type the new code on `/r`.
- The code is typed before the sign-in buttons (one page, no "check the code" step); a wrong one
  comes back as `/r?error=code_unknown` before the provider is asked.
- An archived class refuses with `class_archived` and is not counted as a wrong code. A code is not
  closed when its class is archived (that is `classes/*`, not this item); it just stops working.
- Make and renew need pupils on (403 `pupils_off` or `feature_off`); close and read do not.
- One `POST /classes/:id/code {action}` rather than three routes.
- The test member takes no number and is "Test pupil", so the first real pupil is still Pupil 1.
- Numbers are the class's highest plus one: after a Remove (P2b) of the last pupil, that number
  comes back. Store a counter if that matters.
- A pupil may be in more than one class; `/r` shows one line for each open class. The join form
  shows only when they have none.
- `/me` lists only classes that are open (not archived, pupils on in the workspace).
- `class_code_set` has no session id in its payload: the event's own `session_id` is the workspace.
- `PUPIL_TABLES` entries say whether a table is keyed by the pupil (`pupils.id`) or by their
  membership (`class_members.id`); `forgetPupil` handles membership-keyed tables first, while
  `class_members` is still there. `pupilColumns()` finds every foreign key to `pupils` or
  `class_members`, and every `pupil_id` or `member_id` column with no foreign key; the guard test
  compares it with the list.
- `keep-anonymised` rewrites the column to the `removed_pupils` id for the row's class. Foreign keys
  are on (`db/client.ts`), so a keep-anonymised table must have no foreign key on that column (the
  guard test checks this) and is found by its name; a pupil-keyed one needs a `class_id`. No table
  uses it yet: R1's reader activity should be `member_id TEXT` with no `REFERENCES`.
- Outside the brief's lists, one line each: `shared/src/events/serverOnly.ts` (the new kind),
  `shared/src/schemas.test.ts` (the kind count), `docs/dev-spec.md` (the event row),
  `server/src/env/site.ts` and `access/routes.test.ts` (the counter's new home), `e2e/pupils.spec.ts`
  (a code to sign in).

## What is left

- P2b1: the code card on the class page, using `classCode` and `classMembers`.
- P2b: Remove, calling `forgetPupil()`; names when "collect names" is on (question 90).
- V: "View as pupil" adds a `teacher_test` member with `join(pupilId, cls, 'teacher_test')`.
- R1 and R2: put `requireMember` on each pupil route inside a class; add their tables to
  `PUPIL_TABLES` (keyed by member; no foreign key if they are to be kept anonymised).
