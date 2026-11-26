# Routes and their guards

Every server route, who may call it and what enforces that. `packages/server/src/routes.test.ts`
reads the table below: a route the server registers that is not in it, a row the server does not
register, or a row whose guard lets through a caller its Who rules out (listed below) fails the
test. A new route goes in this table in the same pull request. The test checks the guard, not what
a handler does once the guard has passed.

## Who

| Who | Means | Guard (`server/src/auth.ts`) |
| --- | --- | --- |
| none | Anyone. Each such row says why it is open. | none |
| workspace token | The secret in a workspace's link (`/s/:token`), or a signed-in teacher's token from `/api/account/workspace`. Sent as `Authorization: Bearer`; `?token=` is also taken (see "Left for the board"). Must belong to the `:sessionId` in the path. A closed link's token opens nothing. | `requireParticipant`: 401 without a valid token, 403 for another workspace's |
| access code | The typable code of a link workspace (`XXXX-XXXX-XXXX`). | the handler, with a limit on wrong codes |
| signed-in account | The sign-in cookie of a teacher's account. | `requireAccount`: 401 without a live sign-in |
| signed-in pupil | The pupil sign-in cookie (`pupils/cookies.ts`), from signing in on `/r`. A teacher's sign-in is not one, and a pupil's opens no teacher route. | `requirePupil`: 401 without a live pupil sign-in |
| class member | A signed-in pupil who is a member of the class the route is for (#213: the class of the `:readingId`), the class not archived and pupils on in its workspace. The teacher's test member counts. | `requirePupil`, then `memberOf` (`class-joins/member.ts`): 403 with `not_member`, `class_archived`, `pupils_off` or `feature_off` |
| cron | The `CRON_SECRET` setting, sent as `Authorization: Bearer` by Vercel's cron. Unset, nothing gets in. | the handler compares it with `CRON_SECRET`: 401 otherwise |
| admin | An admin account's sign-in cookie from the last 12 hours, or the admin password outside production (`deployEnv`): locally and on a Vercel preview; refused in Vercel production and with `DEPLOY_ENV=production`. A write with the cookie must carry the site's `Origin`. | `requireAdmin`: 401, or 403 for a cookie write from another site |

The cookie is SameSite=Lax, so a top-level link from another site still carries it. The participant
token is never a cookie, so a link from another site cannot carry it.

## The table

The test checks the Who column by calling each route as callers it must refuse:

- workspace token: no token (401); another workspace's token, where the path has `:sessionId` (403).
- admin: no credentials, a workspace token, and a signed-in teacher who is not an admin (401); for
  a write, an admin's cookie with another site's `Origin` (403); for a row naming `fetchedFromSite`,
  an admin's cookie on a link from another site (403).
- cron: no secret, and a workspace token (401).
- signed-in account: no sign-in (401); for a write, a sign-in cookie with another site's `Origin` (403).
- class member: no sign-in and a teacher's sign-in (401); a signed-in pupil who is not in the class (403); for
  a write, a pupil's cookie with another site's `Origin` (403).

Rows marked "none" or "access code" are not called.

| Method | Path | Who | Guard | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | none | none | Says the server is up, its provider and tool version. Nothing secret. |
| GET | `/api/health/ready` | none | none | 200 when the database answers and every migration is applied, else 503 with `database`, `migrations` (could not compare) or `schema` and a count. For Kubernetes. Nothing secret. |
| GET | `/api/jobs/run` | cron | `CRON_SECRET` in the handler | Runs due jobs (`jobs/`) for up to 120 s and says how many were done, retried, given up or lost. Vercel's cron calls it (`vercel.json`); a GET because that is what the cron sends. |
| GET | `/api/participant` | workspace token | `byParticipantToken` in the handler | Turns a link's token into its workspace id and records the open. No `:sessionId` to match, so the handler checks the token itself (401 without one). |
| GET | `/api/sessions/:sessionId` | workspace token | `requireParticipant` | `config.features`: the workspace's switches; `config.spyglass` is 'off' when its switch is off. |
| GET | `/api/sessions/:sessionId/threads` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/threads` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/threads/:threadId/rename` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/threads/:threadId/name` | workspace token | `requireParticipant` | Calls the model once. |
| POST | `/api/sessions/:sessionId/threads/:threadId/chat` | workspace token | `requireParticipant` | The assistant (gateway, #41 owns its limits). |
| POST | `/api/sessions/:sessionId/threads/:threadId/chat/stream` | workspace token | `requireParticipant` | The assistant, streamed (gateway). |
| POST | `/api/sessions/:sessionId/threads/:threadId/chat/stop` | workspace token | `requireParticipant` | Gateway. |
| GET | `/api/sessions/:sessionId/threads/:threadId/chat` | workspace token | `requireParticipant` | Gateway. |
| GET | `/api/sessions/:sessionId/threads/:threadId/chat/usage` | workspace token | `requireParticipant` | Gateway. |
| GET | `/api/sessions/:sessionId/threads/:threadId/references` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/threads/:threadId/references` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/make` | workspace token | `requireParticipant` | The make kit opens the workspace by its link token too. |
| PUT | `/api/sessions/:sessionId/make` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/make/design` | workspace token | `requireParticipant` | Calls the model; MAKE_DESIGNS_PER_HOUR a workspace. |
| POST | `/api/sessions/:sessionId/events` | workspace token | `requireParticipant` | Refuses the kinds only the server writes (shared `events/serverOnly.ts`). Takes `?token=` for sendBeacon. |
| GET | `/api/sessions/:sessionId/canvas` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/blocks/:command` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/docs/:docId/comments` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/comments` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/comments/:commentId/edit` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/comments/:commentId/resolve` | workspace token | `requireParticipant` |  |
| DELETE | `/api/sessions/:sessionId/comments/:commentId` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/classes` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/demo` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/classes/:id` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/copy` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/archive` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/curriculum` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/curriculum/:itemId/status` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/pupils` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/pupils/:pupilId/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/pupils/:pupilId/move` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/pupils/:pupilId/archive` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/pupils/:pupilId/adaptations` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/adaptations/:adaptationId/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/classes/:id/adaptations/:adaptationId/remove` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/classes/:id/reader-settings` | workspace token | `requireParticipant` | The class's pupil reader settings (#186): values in force, config's defaults, which are set. |
| POST | `/api/sessions/:sessionId/classes/:id/reader-settings` | workspace token | `requireParticipant` | A value sets a field, null goes back to the default: the follow-up limit and pupil budget (numbers) and the safety instruction (#195: text, trimmed, never empty, at most 2,000 characters); 400 out of limits. |
| GET | `/api/sessions/:sessionId/classes/:id/code` | workspace token | `requireParticipant` | The class's live class code (`XXXX-XXXX`), or null (#209). |
| POST | `/api/sessions/:sessionId/classes/:id/code` | workspace token | `requireParticipant` | `action`: make (the code it has, or a new one), renew (the old one stops working) or close; logged as `class_code_set`, ids only. Make and renew answer 403 `pupils_off` or `feature_off` unless pupils are on, 409 for an archived class. |
| GET | `/api/sessions/:sessionId/classes/:id/members` | workspace token | `requireParticipant` | The class's pupils (not the teacher's test member): id, "Pupil N", provider, the day they joined. |
| DELETE | `/api/sessions/:sessionId/classes/:id/members/:memberId` | workspace token | `requireParticipant` | Removes the pupil from the class (#220, `pupils/remove.ts`): 204; 404 for another workspace's class or a member not in it; 409 `test_pupil` for the test member. Works for an archived class and with pupils off. Logged as `class_pupil_remove`, the class id only. |
| POST | `/api/sessions/:sessionId/classes/:id/view-as-pupil` | workspace token | `requireParticipant` | "View as pupil" (#215, `class-joins/view-as-pupil.ts`): makes the class's one test pupil if new (provider `teacher_test`, no number), ends any pupil sign-in this browser had, sets the pupil sign-in cookie: 204. 403 `pupils_off` or `feature_off`, 404 for another workspace's class, 409 `class_archived`. Logged as `class_view_as_pupil`, the class id only. |
| POST | `/api/sessions/:sessionId/classes/:id/logins` | workspace token | `requireParticipant` | `count` 1 to 40 new pupil logins (#223): id, username and password each, one of the two responses that ever hold a password, with the new-password one (`Cache-Control: no-store`). Logged as `pupil_logins_made`, class id and count only. 403 `pupils_off` or `feature_off` unless pupils are on, 409 `class_archived`. |
| GET | `/api/sessions/:sessionId/classes/:id/logins` | workspace token | `requireParticipant` | The class's pupil logins: id, username, used, label ("Pupil N" once used, else null), locked. Never a password. |
| DELETE | `/api/sessions/:sessionId/classes/:id/logins/:loginId` | workspace token | `requireParticipant` | Deletes a login never used; 409 `login_used` once used. |
| POST | `/api/sessions/:sessionId/classes/:id/logins/:loginId/password` | workspace token | `requireParticipant` | A new password for one login, used or not, locked or not (#246, `pupil-logins/regenerate.ts`): `{ login: { id, username, password } }`, `Cache-Control: no-store`. The old password stops at once, the login unlocks and its pupil is signed out everywhere. Logged as `pupil_password_reset`, the class id only. 403 `pupils_off` or `feature_off`, 404 for another workspace's class or a login not in it, 409 `class_archived`. |
| POST | `/api/sessions/:sessionId/schools` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/schools/:id/rename` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/year-groups` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/year-groups/:id/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/year-groups/:id/archive` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/curriculum` | workspace token | `requireParticipant` | Passed through to the library server. |
| POST | `/api/sessions/:sessionId/curriculum/search` | workspace token | `requireParticipant` | Library server. |
| POST | `/api/sessions/:sessionId/curriculum/benchmarks` | workspace token | `requireParticipant` | Library server. |
| POST | `/api/sessions/:sessionId/assets` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/assets/uploads` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/assets/:assetId/complete` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/assets/:assetId` | workspace token | `requireParticipant` | Takes `?token=` for `<img>`. |
| POST | `/api/sessions/:sessionId/pictures/choose` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/projects` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/projects` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/projects/:projectId/rename` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/projects/:projectId/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/projects/:projectId/archive` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/projects/:projectId/delete` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/projects/:projectId/references` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/projects/:projectId/references` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/references/:referenceId/complete` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/references/:referenceId/original` | workspace token | `requireParticipant` | Takes `?token=` for a download link. |
| GET | `/api/sessions/:sessionId/references/:referenceId/pages` | workspace token | `requireParticipant` |  |
| DELETE | `/api/sessions/:sessionId/references/:referenceId` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/usage` | workspace token | `requireParticipant` | Spend by day for the Preferences screen (#50). Reads only. |
| GET | `/api/sessions/:sessionId/budget` | workspace token | `requireParticipant` | Spend and budget (with top-ups) for "£N left" in the chat (#51). Reads only. |
| GET | `/api/sessions/:sessionId/preferences` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/preferences` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/pedagogy` | workspace token | `requireParticipant` | Library server. |
| POST | `/api/sessions/:sessionId/pedagogy/entries` | workspace token | `requireParticipant` | Library server. |
| POST | `/api/sessions/:sessionId/pedagogy/entry` | workspace token | `requireParticipant` | Library server. |
| POST | `/api/sessions/:sessionId/pedagogy/claims` | workspace token | `requireParticipant` | Library server. |
| GET | `/api/sessions/:sessionId/plugins` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/plugins/:pluginId/trust` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/plugins/:pluginId/allow` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/plugin-drafts` | workspace token | `requireParticipant` | 404 `drafts_off` without `PLUGIN_STUDIO_URL` (#158). |
| POST | `/api/sessions/:sessionId/plugin-drafts` | workspace token | `requireParticipant` | The address must be at a `PLUGIN_STUDIO_URL` origin; the server reads the draft's name from there. |
| DELETE | `/api/sessions/:sessionId/plugin-drafts/:draftId` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/reader-prompts` | workspace token | `requireParticipant` | The reader's prompt library (#177). The first call puts config's `reader.default_prompts` in. |
| POST | `/api/sessions/:sessionId/reader-prompts` | workspace token | `requireParticipant` | 409 `too_many_prompts` at 30. |
| PUT | `/api/sessions/:sessionId/reader-prompts/order` | workspace token | `requireParticipant` | Every prompt's id once, in the new order; 409 `prompts_changed` otherwise. |
| PATCH | `/api/sessions/:sessionId/reader-prompts/:promptId` | workspace token | `requireParticipant` |  |
| DELETE | `/api/sessions/:sessionId/reader-prompts/:promptId` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/reading-sources` | workspace token | `requireParticipant` | The docs a reading can be set from (#187): name and chat title, newest first, not deleted. |
| GET | `/api/sessions/:sessionId/classes/:classId/readings` | workspace token | `requireParticipant` | A class's readings, never the copy itself. |
| POST | `/api/sessions/:sessionId/classes/:classId/readings` | workspace token | `requireParticipant` | Stores a frozen copy of the doc. 404 for a doc not this workspace's or deleted; 409 `prompt_unavailable`, `class_archived`. |
| PATCH | `/api/sessions/:sessionId/classes/:classId/readings/:readingId` | workspace token | `requireParticipant` | The prompts and the follow-up limit only. |
| DELETE | `/api/sessions/:sessionId/classes/:classId/readings/:readingId` | workspace token | `requireParticipant` | Soft: the row stays with `removed_at`. |
| POST | `/api/access` | access code | `byAccessCode` in the handler, WRONG_LIMIT wrong codes a minute an address | The front door: a code in, the token out. Open by design; the code is the secret. A closed link answers to no code. |
| GET | `/api/auth/providers` | none | none | Which sign-in buttons to show. |
| GET | `/api/auth/:provider/start` | none | none | Sends the browser to the provider and sets the state cookie. Open by design. |
| GET | `/api/auth/:provider/callback` | none | state cookie, PKCE and nonce (`accounts/oidc.ts`) | The provider sends the browser back here. Open by design; the state cookie ties it to the start. |
| POST | `/api/auth/sign-out` | none | `fromSite` | Ends whatever sign-in the cookie names; 403 from another site. |
| GET | `/api/pupil/providers` | none | none | Which sign-in buttons the pupil page shows. Every `/api/pupil/` route answers 403 `pupils_off` unless `PUPILS=on` (the two sign-in steps send the browser to `/r?error=pupils_off`). The Sign up and Log in screens (`/signup`, `/login`) show "I am a pupil" only when this answers. |
| GET | `/api/pupil/auth/:provider/start` | none | none | Pupil sign-in (#179): sends the browser to the provider, asking for `openid` only, and sets the pupil state cookie. With `?code=`, a class code (#209), sealed in the state; a wrong one counts in the wrong-code counter shared with `/api/access` and comes back as `/r?error=code_unknown`. Open by design. |
| GET | `/api/pupil/auth/:provider/callback` | none | state cookie, PKCE and nonce (`accounts/oidc.ts`) | The provider sends the pupil back here; lands on `/r`. Refuses someone with a teacher account, and someone new without a live class code (`code_needed`); with one, joins the class. Open by design; the state cookie ties it to the start. |
| GET | `/api/pupil/me` | signed-in pupil | `requirePupil` | The provider, `test` (true for a teacher's test pupil, #215), and the pupil's open classes (name, "Pupil N" or "Test pupil"): nothing else is kept about a pupil. |
| POST | `/api/pupil/login` | none | `fromSite`, WRONG_LIMIT unknown usernames and class codes a minute an address | A pupil signs in with a teacher's login (#231, `pupils/login.ts`): `{username, password, code?}`, each at most 64 characters (400 `invalid_request`); 204 and the pupil sign-in cookie. The class code is needed the first time only, and must be the login's class's. Open by design; the password is the secret. Refusals: 401 `login_wrong` (unknown username, counted on the address, or wrong password, counted on the login: the same body); 403 `login_locked` (five wrong in a row, until the teacher makes a new password); 403 `code_needed`, `code_other_class` (not counted); 404 `code_unknown` (counted); 409 `class_archived`; 403 `pupils_off` or `feature_off`; 429 `too_many_codes`; 409 `login_taken`; 403 from another site. Not a research event. |
| POST | `/api/pupil/join` | signed-in pupil | `requirePupil` + `fromSite` | A signed-in pupil types a class code (#209). 404 `code_unknown` (counted), 429 `too_many_codes`, 409 `class_archived`, 403 `pupils_off` or `feature_off`; 403 `test_pupil` for a teacher's test pupil (#215). |
| POST | `/api/pupil/readings/:readingId/asks` | class member | `requirePupil` + `memberOf` + `fromSite` | A pupil's ask in the reader (#214): `{prompt_id, highlighted_text, parent_ask_id?}`, no free text; one model call, answered whole as `{ask: {id, reply, follow_ups_left}}`. Membership is checked before the body is read; an unknown reading is 403 `not_member` like another class's, a removed one 404. 422 for a passage not in the reading or over 1,000 characters; 409 for a prompt not allowed, gone or not ticked here, or no follow-ups left; 404 for a parent that is not their own ask on this reading; 429 for the pupil's or the workspace's budget; 503 without a zero-retention provider; 502 when the call fails (nothing stored or charged). Kept in `reader_asks` and `reader_ask_texts`, never `events` or `gateway_calls`. |
| GET | `/api/pupil/readings` | signed-in pupil | `requirePupil` | The pupil's reader (#213): the readings (not removed) of each of the pupil's open classes, newest first: id, name, class, the day set. |
| GET | `/api/pupil/readings/:readingId` | class member | `requirePupil` + `memberOf` | The reading's frozen copy, its name and class, the prompts it allows as label and ticks only (never the instruction), and the follow-up limit in force. An unknown reading is 403 `not_member` like another class's; a removed one is 404. |
| GET | `/api/pupil/readings/:readingId/highlights` | class member | `requirePupil` + `memberOf` | The pupil's own highlights on the reading. |
| POST | `/api/pupil/readings/:readingId/highlights` | class member | `requirePupil` + `memberOf` + `fromSite` | `{block_id, start, end, category}`: a range in the block's reader text, a category or null. 400 `unknown_block`, `bad_range` or `invalid_request`; 409 `highlights_full` at 200. Not a research event. |
| DELETE | `/api/pupil/readings/:readingId/highlights/:highlightId` | class member | `requirePupil` + `memberOf` + `fromSite` | Removes one of the pupil's own highlights; 404 for anyone else's. |
| GET | `/api/pupil/readings/:readingId/assets/:assetId` | class member | `requirePupil` + `memberOf` | A picture the reading's copy names (404 otherwise), `Cache-Control: private`. |
| POST | `/api/pupil/sign-out` | none | `fromSite` | Ends whatever pupil sign-in the cookie names; 403 from another site. |
| GET | `/api/account/workspace` | signed-in account | `requireAccount` | Hands the signed-in teacher their workspace token, kept in memory only. |
| POST | `/api/account/notice` | signed-in account | `requireAccount` + `fromSite` |  |
| GET | `/api/admin/me` | admin | `requireAdmin` |  |
| GET | `/api/admin/sessions` | admin | `requireAdmin` |  |
| POST | `/api/admin/sessions` | admin | `requireAdmin` |  |
| PATCH | `/api/admin/sessions/:sessionId` | admin | `requireAdmin` |  |
| DELETE | `/api/admin/sessions/:sessionId` | admin | `requireAdmin` |  |
| PUT | `/api/admin/sessions/:sessionId/interactions` | admin | `requireAdmin` |  |
| PUT | `/api/admin/sessions/:sessionId/features` | admin | `requireAdmin` | The workspace's feature switches; logs `workspace_features_set` (`features/routes.ts`). |
| POST | `/api/admin/sessions/:sessionId/access-code` | admin | `requireAdmin` | 409 `link_closed` for a closed link. |
| POST | `/api/admin/sessions/:sessionId/link/replace` | admin | `requireAdmin` | New link and code; the old ones stop working. |
| POST | `/api/admin/sessions/:sessionId/link/close` | admin | `requireAdmin` | The link and code stop working; none issued. |
| GET | `/api/admin/budgets` | admin | `requireAdmin` | Every workspace's spend and budget, for the Budget column (#51). Reads only. |
| POST | `/api/admin/sessions/:sessionId/budget/topup` | admin | `requireAdmin` | Adds £10 to the budget and logs `budget_update` (#51). No undo. |
| GET | `/api/admin/sessions/:sessionId/export` | admin | `requireAdmin` + `fetchedFromSite` | Writes `workspace_export`, so with the cookie only a fetch from this site (see below). |
| GET | `/api/admin/sessions/:sessionId/export.json` | admin | `requireAdmin` + `fetchedFromSite` | As above. |
| GET | `/api/admin/sessions/:sessionId/assets/:assetId` | admin | `requireAdmin` (`allowQuery`) | Images in exported docs; the password may come as `?token=` (where the password works at all: see the admin row above). Reads only. |
| GET | `/api/admin/invites` | admin | `requireAdmin` |  |
| POST | `/api/admin/invites` | admin | `requireAdmin` |  |
| DELETE | `/api/admin/invites/:inviteId` | admin | `requireAdmin` |  |
| GET | `/api/admin/accounts` | admin | `requireAdmin` |  |
| PUT | `/api/admin/accounts/:accountId/admin` | admin | `requireAdmin` |  |

The built client's files (`GET /*`, `@fastify/static`, only when `packages/client/dist` exists)
are public and are not in the table; the test leaves that one route out.

## The export GETs

`GET .../export` and `GET .../export.json` stay GETs: the e2e tests and analysis read
`export.json` with the admin password, which no other site can send. But each writes a
`workspace_export` event, and the admin cookie travels on a link from another site, so with the
cookie `fetchedFromSite` (`export/routes.ts`) lets through only a fetch from this site's own page:
`Sec-Fetch-Site: same-origin`, or an `Origin` equal to `AUTH_BASE_URL`. A link, a typed address
or a browser too old to send fetch metadata gets 403 `export_from_site`. The Download button in
/admin fetches, so it passes.

## Left for the board

Found in the audit (13 Nov 2026), bigger than this item or in files another item holds:

- **`?token=` on every workspace route.** `requestToken` takes the token from the query string on
  every route, though only three need it (`POST /events` for sendBeacon, `GET /assets/:assetId`
  for `<img>`, `GET /references/:referenceId/original` for a download link). A token in a URL can
  reach request logs and browser history. Narrowing it is an `allowQuery` option on
  `requireParticipant`, as `requireAdmin` has, and touches the gateway's tests (#41's files).
- **Rate limits** on the model-calling workspace routes (`chat`, `chat/stream`, `threads/:id/name`,
  `make/design` has its own) are the gateway's and config's: #41.
- **Scoping inside handlers.** The guard checks the token matches `:sessionId`; each handler then
  scopes child ids (thread, doc, comment, asset, reference) by the session. That was spot-checked
  (assets, references, comments, chat), not proved route by route.
