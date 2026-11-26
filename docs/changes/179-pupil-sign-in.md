# 179: pupils sign in with Google or Microsoft on the pupil page

Plan C on #152, item P1. Built on the defaults of questions 71, 72 and 74 (`QUESTIONS.md`).

## What was built

- **The `pupils` switch** (`shared/src/features.ts`): a seventh per-workspace switch, the only one
  off by default. An admin turns it on with the existing `PUT /api/admin/sessions/:id/features`,
  logged as `workspace_features_set`. A stored set, event or bundle from before it has no `pupils`
  key and reads as off (`z.boolean().default(false)`).
- **The OIDC scope** (`server/src/accounts/oidc.ts`): `createOidcProvider(settings, { scope })`.
  Teachers keep `openid email profile`; pupils ask for `openid` only.
- **`server/src/pupils/`**:
  - `store.ts`: the `pupils` table (provider, subject, tenant, created_at, last_sign_in_at) and
    `pupil_sign_ins` (a hash of the cookie's id). Migration `0042_pupil_sign_ins.sql`.
  - `admit.ts`: `pupilIdentity` runs the teachers' `reduceClaims` checks, then keeps only provider,
    subject and tenant (Microsoft's `tid`, else Google's `hd`). `admitPupil` refuses someone with a
    teacher account (`teacher_account`).
  - `cookies.ts`: the pupil cookies, named apart from the teachers' (`__Host-edw_pupil`,
    `__Host-edw_pupil_state`; plain names on `/api/pupil` over http). A pupil sign-in lasts a day.
  - `gate.ts`: `pupilsRefusal(env, workspace?)`: `pupils_off` unless `PUPILS=on`, `feature_off` when
    the workspace's switch is off. P1 calls it without a workspace; P2 passes the class's workspace.
  - `env.ts`: `PUPILS` (`on` or `off`; unset is off: it fails closed, from the review), joined in `server/src/env.ts`.
  - `routes.ts`: `/api/pupil/providers`, `/api/pupil/auth/:provider/start` and `/callback`,
    `/api/pupil/me` (`requirePupil`), `/api/pupil/sign-out`. The same providers and the same
    `sealState`/`openState` as teachers. Without `PUPILS=on` all answer 403 `pupils_off` (the two
    sign-in steps redirect to `/r?error=pupils_off`).
- **`server/src/auth.ts`**: `requirePupil` beside the other guards; `logUrl` drops the query string
  from `/api/pupil/auth/` too.
- **`server/src/accounts/policy.ts`**: teacher sign-in refuses someone known as a pupil
  (`pupil_account`), before looking at the invite or the open doors. `accounts/routes.ts` passes the
  pupil store in (one line); `/signin` has words for it (`landing/codes.ts`).
- **Client**: `screens/pupil/` (`PupilScreen.tsx` on `/r`, `usePupil.ts`, `pupilApi.ts`,
  `messages.ts`). Signed out: one button per provider, a reason after a failed try, a link to the
  teachers' sign-in. Signed in: "You are signed in", "Joining your class is not ready yet", Sign out.
  `LandingScreen.tsx`: "Pupils: sign in" beside the teachers' Sign in when signed out and the server has pupil sign-in on ("Pupils" at
  phone width).
- **Docs**: `docs/routes.md` (a "signed-in pupil" Who and five rows), `ARCHITECTURE.md`, `docs/client-state.md`, `.env.example`.

## What is stored and logged about a pupil

- Stored: provider, subject, tenant, when first and last signed in; a hash of each live sign-in id.
- Never stored: a name, an email, a token. The provider is not asked for them.
- Not in `events`, the call log or the export: no event kind was added and pupils belong to no
  workspace. `pupils/routes.test.ts` checks every table and finds the subject only in `pupils`.
- Log lines: a refusal logs `reason` and the library's error `code` and `name` only, as teachers'
  do. The callback's query string is dropped from the request log.

## Decisions the brief did not cover

- A teacher is refused at pupil sign-in too (the mirror of question 72), so one identity is never
  both. Sam cannot try the pupil page with an account that already has a teacher workspace: use a
  mock Classroom pupil account.
- A pupil sign-in lasts one day (teachers: 30): school laptops are shared, and signing in again is
  one click.
- For Google the tenant is the Workspace domain (`hd`). With `openid` alone Google may leave `hd`
  out; then it is null. Nothing uses it yet.
- The pupil API calls live in `screens/pupil/pupilApi.ts`, not `api/endpoints.ts`, to stay inside
  this item's files.

## Tests

- `pupils/routes.test.ts`: scope `openid`, landing on `/r`, what is kept (Microsoft and Google), the
  same pupil next time, sign-out (and from another site), refusals (cancelled, no state, a teacher
  at the pupil door, a pupil at the teacher door), cookies kept apart, `PUPILS` unset and off, nothing in
  events, any other table or the logs.
- `pupils/gate.test.ts`, `accounts/oidc.test.ts` (scope), `features/features.test.ts` (an admin
  turns pupils on), `shared/src/features.test.ts`.
- `routes.test.ts`: the new Who; admin and teacher rows refuse a pupil's cookie, pupil rows a
  teacher's.
- Client: `PupilScreen.test.tsx`, `messages.test.ts`, `LandingScreen.test.tsx`, `codes.test.ts`.
- `e2e/pupils.spec.ts`: the landing link, signing in on `/r` through the fake issuer, reload, sign
  out; a known pupil turned away at `/signin`.

## What is left

- P2: joining a class by code. It should call `pupilsRefusal(env, workspace)` on every route that
  concerns a class, and add the pupil table's link to a class (and `SESSION_TABLES` if it belongs
  to a workspace).
- The theme switch in the landing nav was already squeezed at 360 to 390px before this change.

## Settings for Sam

- Google Cloud and Microsoft Entra apps: add the redirect addresses
  `<site>/api/pupil/auth/google/callback` and `<site>/api/pupil/auth/microsoft/callback` beside the
  teachers' ones, for each site (production and the preview). Without them the providers refuse the
  pupil sign-in.
- Vercel: to try pupil sign-in, set `PUPILS=on` (DEPLOY.md section 12). Unset, it is off
  everywhere and the landing page shows no pupils' link. The tests and e2e set it on;
  `.env.example` has it commented out (uncomment it for local development), so a self-hosted site
  copied from it keeps pupils out.
- Microsoft: `AUTH_MICROSOFT_TENANT` is shared with teachers (default `organizations`).

## Sam's answers (23 Nov 2026)

Questions 79 and 80: yes (teachers and pupils kept apart both ways; `pupils` in the switches and
the bundle). Question 71: no rule line, as this is a prototype, so the dated rules-table row and
the "Pupils" section of `docs/rules.md` were taken out. The code is unchanged: pupil sign-in still
needs `PUPILS=on`, and a workspace route will still need its `pupils` switch.
