# 173: the class page's lists and sidebar; Sign in on the front page

## What was built

- `screens/classes/ClassPage.tsx` now draws only the breadcrumbs, the header (star, name, Copy to
  next year, Archive) and a row of two parts. The page is wider (`max-w-320`).
- `screens/classes/ClassLists.tsx`: the main column. The class's chats, newest first, then the
  pupil table (`PupilTable`, unchanged). Readings and Progress go here as sections of their own.
- `screens/classes/ClassSidebar.tsx`: the sidebar on the right (`w-88`), an `<aside>` named
  "About the class". In order: Class details (`ClassDetails`: stage, subject, year group), Ask or
  start a chat (the `PlaceComposer` passed in as `composer`, unchanged), About this class (the
  note), Curriculum (`CurriculumCard`), What is kept. When the page itself is narrower than
  62rem (a container query, `@container` on the page) it stacks under the lists at full width, so
  the pupil table is never squeezed beside it (the page sits beside the workspace's sidebar, so a
  window breakpoint was not enough).
- `screens/landing/LandingScreen.tsx`: `NavAccount`, top right in the nav after the theme switch:
  Sign in to `/signin`, or Your workspace to `/w` when signed in, nothing while the account loads.
  For teachers; nothing was added for pupils.
- Tests: `screens/classes/ClassLayout.test.tsx` (order of the lists and the sidebar's cards, the
  details saving), `LandingScreen.test.tsx` (the nav link signed out and signed in),
  `e2e/classes.spec.ts` (the layout from 1440px to 800px: the pupil table at least 540px wide beside the sidebar, or the sidebar under it), `e2e/landing.spec.ts` (Sign in in the
  nav, top right, at phone width too).

## Decisions

- Chats come before pupils in the main column, not after as the brief listed them: with the
  demo class's twenty pupils the table pushed the chats off the first screen.
- The chat box comes straight after the class details in the sidebar, before the note, so it is
  on the first screen at 1280x800.
- The chat box is not made compact: the composer is drawn as before in a 352px card, and it fits.
- The landing e2e and unit test that said "/ has no Sign in" were changed on purpose.
- `docs/classes.md`'s description of the class page was out of date and is rewritten.

## What is left

- Readings and Progress in `ClassLists` (later items).
- The year group page (`YearGroupPage.tsx`) keeps the old layout: chat box and chats in the main
  column, cards beside. It could follow the class page if Sam wants them to match.
- Pupils' own sign-in page (a later item).
