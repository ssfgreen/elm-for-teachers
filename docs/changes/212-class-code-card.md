# 212: the class code card, and the `pupils` switch on the class page

Plan on #152, item P2b1. Built on P2a (#209, #211): its teacher routes are used as they are.

## What was built

- **`client/src/api/classCode.ts`**: `getClassCode`, `setClassCode` (make, renew, close) on the
  existing `endpoints.classCode`, and `hasClassCode(api)`. Spread into `createSessionApi`
  (`api/participant.ts`), optional on `SessionApi` like readings.
- **`SessionInfo.config.features`** (`api/types.ts`): the server already sent it; now typed.
- **`client/src/state/features.ts`**: `featureApi(api, features)`, pure. With `pupils` off, or no
  switches sent, it takes the readings, reader settings and class code methods (`PUPIL_METHODS`)
  off a copy of the api. Called where `WorkspaceApp.tsx` makes the api object. Screens already draw
  a card or section only when its methods are there, so nothing else changed for hiding.
- **`client/src/screens/classes/pupil-sign-in/`**:
  - `classCode.ts`: the confirm questions, `refusalMessage` (by the refusal's code) and
    `pupilAddress` (the site without its scheme, then `/r`).
  - `useClassCode.ts`: the code, loaded once per class; one change at a time; Renew and Close
    wait for a second click. The code shown is always the server's.
  - `ClassCodeCard.tsx`: mounted in `ClassSidebar.tsx` above the Pupil reader card. Not drawn for
    an archived class or without class codes in the api.
- **e2e**: `e2e/classCode.spec.ts` (make, Copy, Renew, Close; pupils off hides all three; the
  export has `class_code_set` three times and never either code). The three reader specs
  (`classReaderSettings`, `classReaderSafety`, `readings`) make their workspace with
  `features: { pupils: true }`.

## Decisions

- Absent switches read as the defaults, so pupils are off: an older server would hide the cards.
  The server has sent `features` since #62, so this does not happen in practice.
- Wording: Renew asks "Give the class a new code? The old code stops working at once."; Close asks
  "Close the code? No one can join with it until you make a new one." The pupils' address is shown
  without `https://`.
- Copy uses `navigator.clipboard.writeText`. If the browser refuses, the code is selected in its
  box and the card says to copy it with Ctrl+C. "Copied." shows only for the code that was copied.
- `refusalMessage` tells `pupils_off` (the site's `PUPILS` setting) from `feature_off` (the
  workspace's switch); with the switch off the card is hidden anyway, so a teacher sees these only
  if the switch changes while the page is open.
- The brief's name `e2e/classCode.spec.ts` sits beside P2a's `e2e/classCodes.spec.ts` (the pupil's
  side). Kept as the brief says.

## What is left

- P2b2: the list of pupils who joined, in the same folder (`GET .../members` is there).
- The card does not show when a code was made or how many have joined.
