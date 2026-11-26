# 215: View as pupil

What a teacher sees: a **View as pupil** button in the class page header, beside Copy and
Archive. It opens `/r` in a new tab as the class's test pupil ("You are Test pupil in 8B"), with a
strip across the top: "Test pupil (you)" and **Back to teacher**, which signs out and closes the
tab. Shown only with pupils on (server and workspace) and the class not archived.

## Where

- Server: `server/src/class-joins/view-as-pupil.ts` (the route, registered in `app.ts`) and
  `view-as-pupil.test.ts` (also covers `/me`, `/join`, the member list, Remove, the reader with
  the test member, spend and the pupil budget).
- `server/src/pupils/routes.ts`: `/me` lists the test pupil's class and says `pupil.test`;
  `POST /join` refuses a test pupil with 403 `test_pupil`.
- Shared: the `class_view_as_pupil` event (`{class_id}`), server-only.
- Client: `api/viewAsPupil.ts` (spread into `participant.ts`),
  `screens/classes/view-as-pupil/{ViewAsPupilButton.tsx,openTestPupilTab.ts}`, mounted in
  `ClassPage.tsx`; `screens/pupil/{TestPupilBanner.tsx,useTestPupil.ts}`, mounted once in `App.tsx`.
- e2e: `e2e/viewAsPupil.spec.ts`.

## Decisions

- The route answers 204 and sets the pupil cookie as the provider callback does; the client then
  sends the waiting tab to `/r`. The cookie-setting lines now exist three times (callback, B #231,
  here): a later small item can make one helper.
- Ending the browser's earlier pupil sign-in works only on https, where the pupil cookie's path
  is `/`. On http (localhost) its path is `/api/pupil`, so the browser does not send it to
  `/api/sessions/...`: the old `pupil_sign_ins` row stays live until it expires, though the
  browser's cookie is replaced by the test pupil's. Not changed in code.
- `pupils/routes.test.ts` gained `test: false` in one expectation: `/me` now always carries
  `test`, as the brief asks, so that line had to change. No other line of it changed.
- If the browser blocks the new tab, the button says "Your browser blocked the new tab. Allow
  pop-ups for this site and try again." and does not call the server.
- Back to teacher only changes the banner; `PupilScreen` is not told. If the tab cannot close,
  the banner says "Signed out. You can close this tab." while the page below still shows the
  class until reloaded.
- `test_pupil` words on /r: "A test pupil stays in its own class. Go back to the teacher page to
  view another class." (only reachable if the class were archived while the tab is open).
- The banner asks `/api/pupil/me` itself, apart from `usePupil`: one extra call on `/r`.

## Left

- "Start again" (clear the test pupil's highlights and asks, reset its budget): a later item.
- Progress screens must leave the test member out of their counts (`role = 'teacher_test'`).
- One helper for setting the pupil cookie.
