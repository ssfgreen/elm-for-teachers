# 66a: a Features cell per workspace on /admin, and ticks on New workspace

## What was built

- `client/src/screens/admin/FeaturesCell.tsx`: the Features column. Closed, it says what is off
  ("Off: pupils", or "All on"); opened (a `<details>`), one tick per switch in `FEATURE_NAMES`,
  read from the shared list. A tick saves at once through `PUT /api/admin/sessions/:id/features`;
  a refused save puts it back and says "Not saved: <reason>" under the cell. `FeatureTicks` (the
  ticks alone) and `PUPILS_HINT` are shared with the form.
- `useAdminSessions`: `setFeatures(sessionId, patch)` moves the ticks at once, keeps the row the
  server sends back, and on a refusal puts the patched switches back and resolves the reason
  (null when saved). `create(label, study, features?)` sends only the switches that differ from
  their defaults, so an untouched form posts `{ label, study }` as before.
- `NewWorkspaceForm`: a Features fieldset, each tick starting at its `DEFAULT_FEATURES` value
  (`pupils` unticked), with the line "pupils: only matters when the site's PUPILS setting is on".
- `api/admin.ts`: `setFeatures`, and `createSession` takes `features`. `api/types.ts`:
  `AdminSessionRow.features` (optional; absent reads as the defaults).
- `BudgetCell`: "Add £10" may now wrap under the figure. The extra column made the table 19px too
  wide at 1366px with the delete confirm open (`e2e/adminTable.spec.ts`); this gives the room back.

## Tests

`FeaturesCell.test.tsx` (cell, summary, refused save, the form's ticks), `useAdminSessions.test.tsx`
(optimistic move, refused save, switches sent on create), `e2e/adminFeatures.spec.ts` (unticking
spyglass takes the Spyglass toggle out of the workspace on its next load; a new workspace with
pupils ticked has pupils on).

## For the next agent

- An open teacher tab keeps its switches until it reloads; the server enforces a change at once.
- Hiding the reader card and Readings when `pupils` is off is P2b; the pupil accounts panel is 66b.
