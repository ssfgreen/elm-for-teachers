# 224: Sign up and Log in, then teacher or pupil

Item C of #221. Built 24 Nov 2026.

## What was built

- `/`: the main action, at the top and in the closing call, is **Sign up** (to `/signup`). The
  nav's Sign in and "Pupils: sign in" are one **Log in** (to `/login`). Signed in, both still offer
  the workspace as before.
- `/signup` and `/login`: `screens/landing/WhoScreen.tsx` (`mode` is `signup` or `login`). Heading
  "Sign up" or "Log in", the line "Are you a teacher or a pupil?", and two large links, "I am a
  teacher" and "I am a pupil", each with a small drawn picture.
- Where they go is one table, `WHO_TARGETS` in `WhoScreen.tsx`: teacher signs up at `/start`, logs
  in at `/signin`; a pupil goes to `/r` either way.
- The pictures: `screens/landing/WhoIcons.tsx`, two inline SVGs, `aria-hidden`, drawn with the
  landing glow colours and the theme's foreground, primary and suggest tokens, so both themes show
  them. Faces use `--landing-face` (in `landing.css`), the light theme's rose in both themes: the
  dark rose read as shadow.
- Wording is in `content.ts` (`SIGN_UP`, `LOG_IN`, `WHO_*`). The FAQ "How do I get in?" now says
  "Choose Sign up, then I am a teacher", and "choose Log in next time"; the closing call's line ends
  "or Log in".
- No new events; the screens log nothing.

## Decisions the brief left open

- The closing call at the foot of `/` was "Get started" too; it is now Sign up, so the page has one
  name for one action. Its line under the title now ends "or Log in", to match the nav.
- "I am a pupil" shows only where pupil sign-in is on (`usePupilsOn`, as the old nav link; review
  round 1). With it off, `/signup` and `/login` show only "I am a teacher" and drop the question
  above it. They do not go straight on to the teacher's page: the answer arrives after the first
  draw, and a redirect then would carry a pupil to the teachers' sign-in without a word.
- `/start` is unchanged and still headed "Get started" (`StartScreen.tsx` was out of bounds).
- Existing e2e tests that clicked "Get started" or "Pupils: sign in" now go through Sign up or Log
  in and a choice (`e2e/landing.spec.ts`, `e2e/pupils.spec.ts`).

## What is left

- Item D: change the two `pupil` entries in `WHO_TARGETS` to `/r/join` and `/r/login`.

Screenshots: `docs/changes/224/`.
