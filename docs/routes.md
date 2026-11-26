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
| POST | `/api/sessions/:sessionId/schools` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/schools/:id/rename` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/year-groups` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/year-groups/:id/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/year-groups/:id/archive` | workspace token | `requireParticipant` |  |
| GET | `/api/sessions/:sessionId/needs-groups` | workspace token | `requireParticipant` | Refuses with 403 `feature_off` when `needs_groups` is off. |
| POST | `/api/sessions/:sessionId/needs-groups` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/needs-groups/:id/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/needs-groups/:id/archive` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/needs-groups/:id/classes` | workspace token | `requireParticipant` |  |
| DELETE | `/api/sessions/:sessionId/needs-groups/:id/classes/:classId` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/needs-groups/:id/adaptations` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/needs-groups/:id/adaptations/:adaptationId/update` | workspace token | `requireParticipant` |  |
| POST | `/api/sessions/:sessionId/needs-groups/:id/adaptations/:adaptationId/remove` | workspace token | `requireParticipant` |  |
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
| POST | `/api/access` | access code | `byAccessCode` in the handler, WRONG_LIMIT wrong codes a minute an address | The front door: a code in, the token out. Open by design; the code is the secret. A closed link answers to no code. |
| GET | `/api/auth/providers` | none | none | Which sign-in buttons to show. |
| GET | `/api/auth/:provider/start` | none | none | Sends the browser to the provider and sets the state cookie. Open by design. |
| GET | `/api/auth/:provider/callback` | none | state cookie, PKCE and nonce (`accounts/oidc.ts`) | The provider sends the browser back here. Open by design; the state cookie ties it to the start. |
| POST | `/api/auth/sign-out` | none | `fromSite` | Ends whatever sign-in the cookie names; 403 from another site. |
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
