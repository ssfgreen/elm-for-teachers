# 245: pupils sign up on /r/join and log in on /r/login; /signin says "Log in"

Item D of #221, plus answer 117. Client only: no server, shared or migration change.

## What was built

- **Routes** (`App.tsx`): `/r/join` (`PupilJoinScreen`, `screens/pupil/JoinScreen.tsx`) and
  `/r/login` (`PupilLoginScreen`, `LoginScreen.tsx`). `/r` is still where a signed-in pupil lands.
- **`/r/join`, "Sign up"**: step 1 "Class code" and **Next**, on once 8 letters or digits are typed
  (`wholeClassCode` in `ClassCode.tsx`, which also writes it `ABCD-EFGH`). Step 2: "Class code
  ABCD-EFGH" with **Change** (back to step 1, the code kept), "Continue with …" per provider
  (`pupilStartUrl(id, code)`), and "Username and password from your teacher" (`PupilLoginForm` in `PasswordForm.tsx`),
  which posts `{username, password, code}`. "Been here before? Log in" links to `/r/login`.
- **`/r/login`, "Log in"**: providers with no code, the same form with no `code` key, "First
  time? Sign up with your class code" and "A teacher? Log in on the teacher page". It shows "You
  have signed out." for `?signed_out=1`.
- **`SignInFrame.tsx`** (new, not in the brief's list): the frame both screens share. It sends a
  pupil already signed in to `/r`, says "Pupil sign-in is switched off here." with pupils off, and
  holds `ProviderLinks`. Kept apart so neither screen imports the other.
- **`usePupil.ts`**: `usePupilSignIn()` for the two screens (who is signed in, the providers).
  `usePupil()` no longer loads the providers: `/r` does not show them any more.
- **`loginApi.ts`**: `pupilLogin(body)` gives `{ ok: true }` or `{ refused: code }`.
- **`messages.ts`**: words for `login_wrong`, `login_locked`, `code_other_class`, `login_taken`.
  `messages.test.ts` lists every code in the server's `LOGIN_STATUS` by hand: add to both.
- **Signed-out `/r`**: `pupilErrorPage(reason)` in `PupilScreen.tsx`. Code reasons
  (`code_needed`, `code_unknown`, `class_archived`, `too_many_codes`, `feature_off`) go to
  `/r/join?error=…`, anything else to `/r/login?error=…`, none to `/r/login`. Sign out goes to
  `/r/login?signed_out=1`. The server still sends every failure to `/r?error=`.
- **Who screen**: pupil targets `/r/join` and `/r/login`; "I am a pupil" shows whenever pupil
  sign-in is on, even with no provider (`usePupilsOn`).
- **Class code card**: `pupilAddress` gives `<site>/r/join`.
- **Answer 117**: `/signin` is headed "Log in", "Teachers and admins both log in here."; `/start`
  says "…or log in if you have signed up before." and "Already signed up? Log in". The admin
  password form's button (`admin/PasswordGate.tsx`) still says "Sign in", as the brief left it.
- **e2e**: new `pupilJoinLogin.spec.ts` and helper `pupilSignUp.ts`; `pupils`, `classCodes`,
  `classCode`, `classMembers`, `reader`, `readerAsks`, `whoScreen` and `landing` updated.

## Decisions

- **Next waits for exactly 8 letters or digits.** `cleanClassCode` allows 9 characters, so
  `ABCDEFGHJ` (9 letters) leaves Next off. The code is sent as `ABCD-EFGH` (the server takes it
  either way).
- **The username and password fields are uncontrolled** (refs, read on submit). A controlled
  input's value shows as its `value` attribute, so the page's markup held both (review round 1).
  The button knows only whether each field has something in it.
- **The last try's reason goes once the pupil moves on**: Next on `/r/join` drops `?error=` (it
  does not come back after Change); a refusal of the form on `/r/login` drops `?error=` and
  `?signed_out=1`, so only one message shows.
- **`PupilLoginForm`**, not `PasswordForm`, so it is not confused with the admin's form that
  `/signin` imports.
- **Step 2 takes focus** on the "Class code ABCD-EFGH" line, so a screen reader hears the step
  change.
- **The login form is a plain group with an `h2`**, not a named region: a region named "Username
  and password from your teacher" also matched a label search for "Username".
- **Buttons**: the form says **Sign up** on `/r/join` and **Log in** on `/r/login`.
- `LandingScreen.test.tsx`'s `/signin` case changed its expected line too (the words changed);
  the brief named only the `/start` case.

## What is left

- The code is lost when a provider round trip fails (page memory only, as planned): the pupil
  types it again on `/r/join`.
- A pupil who cancels Google while signing up lands on Log in (errors are routed by reason), which
  links to Sign up.
- A login pupil cannot join a second class this way (question 137).
