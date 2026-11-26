# 220: the pupils who joined a class, and Remove

Plan on #152, item P2b2. Built on P2a (#209), P2b1 (#212) and R1 (#213). No migration.

## What was built

- **`server/src/pupils/remove.ts`**: `removeMember(db, events, sessionId, classId, memberId,
  envelope, tables = PUPIL_TABLES)`, one write transaction:
  - the member is read inside the transaction (so a second Remove at the same moment finds
    nothing): `not_found` for a member not in this workspace's class, `test_pupil` for the
    teacher's test member;
  - one `removed_pupils` row (new random id, workspace, class, day);
  - member-keyed tables: keep-anonymised rows move to the new id, delete rows go, before the
    membership (a table may have a foreign key to `class_members`);
  - pupil-keyed tables that have a `class_id` column (found with `PRAGMA table_info`): this
    class's rows only, so the `class_members` row goes and other classes are untouched;
  - when the pupil has no class left: every pupil-keyed table's rows go, `pupils` last, as
    `forgetPupil` does, so the sign-in cookie gets 401;
  - logs `class_pupil_remove {class_id}`.
  It reads `PUPIL_TABLES` and does not change `tables.ts`.
- **`DELETE /api/sessions/:sessionId/classes/:id/members/:memberId {envelope}`**
  (`class-joins/routes.ts`): 204; 404 for another workspace's class or a member not in the class;
  409 `test_pupil`. No pupils switch check and no archived check, like Close.
- **`class-joins/store.ts`**: `membersOf` lists `role = 'pupil'` only. `join` numbers with
  `nextNumber`: max(highest number held, numbered members + the class's `removed_pupils` rows) + 1,
  so a number is never given twice in a class.
- **Event** `class_pupil_remove` (`shared/src/events/classes.ts`): the class id only. Server-only.
- **Client**:
  - `api/classMembers.ts`: `listClassMembers`, `removeClassMember`, `hasClassMembers`; spread into
    `createSessionApi`. `endpoints.classMember` for the DELETE.
  - `screens/classes/pupil-sign-in/classMembers.ts` (pure: wording, count, provider name, day,
    `removeRefusal`, `showJoinedCard`), `useClassMembers.ts` (state), `JoinedPupilsCard.tsx`,
    mounted in `ClassSidebar.tsx` below the class code card.
- **e2e**: `e2e/classMembers.spec.ts`. `e2e/pupilClass.ts` now also returns the workspace id, its
  token and the class id (three fields added, nothing else changed).

## Decisions

- The card is drawn when someone has joined, whatever the switches and even for an archived class.
  With no one in it, it is drawn only while pupils can join (class codes in the api and the class
  not archived), and says "No pupils have joined yet." With pupils off and no one in it there is
  nothing to show, so no card.
- The new client methods are not in `state/features.ts` `PUPIL_METHODS` (I may not change it, and
  they must stay with pupils off).
- After a Remove, or a refusal, the list is loaded again from the server rather than edited in
  place. A refusal says why (`not_found`: "no longer in this class").
- The row's label is tied to Remove with `aria-describedby`; the element id is the class id and
  the row's position, never the member id.
- Two Removes at once: the first gives 204 and the second 404 (the member is gone), with one
  `removed_pupils` row and one event.
- Pupil-keyed keep-anonymised rows of a class the pupil already left: when their last class goes
  they are deleted, as `forgetPupil` does (a class they left has its own record already).
- A Remove that went through but whose list could not reload says "Removed, but the list could
  not reload. Reload the page." (review round 1).

## Left

From review round 1, left as they are for later items:

- `remove.ts` repeats `forgetPupil`'s deletion for the last class: a later item can let
  `forgetPupil` take a transaction and call it from there.
- `remove.ts` runs `PRAGMA table_info` for each pupil-keyed table on every Remove: this needs
  another way to find `class_id` when the database moves to Postgres.
- `removed_pupils` has no index on `class_id`, which `join`'s `nextNumber` counts by: a later
  migration if the table grows.
- A highlight saved while a Remove runs can stay under the old member id: `reader/` checks the
  membership and then inserts outside one transaction. Out of scope here.
- A removed pupil can join again while the code is open, as a new Pupil N
  (the default taken on 23 Nov); Renew stops that.
