# Questions for Sam

Kept up to date by the orchestrator. Last updated 24 Nov 2026.

34 questions open: 2 from 24 Nov about class rows sent to the browser (139 and 140), 2 from 24 Nov about pupil sign-up (136 and 137), 4 from 24 Nov about removing Needs and Working at and the studio's Share (132 to 135), 5 from 24 Nov about test pupils and the ask screen (125 to 129), 3 from 24 Nov about pupil logins (118 to 120), 1 from 24 Nov about pupil asks (R2, PR #217: 107), 9 from 23 Nov about studio owners, deleting workspaces, a plugin's status and studio item 6b (93, 96 to 103), 6 from the 21 Nov run (23 to 28), and two from 15 Nov (3 and 10). Every one has a default the orchestrator follows until you answer. Answer in chat with the orchestrator, by writing `Answer:` under a question here (edit the file on GitHub), or by commenting on issue #12. The orchestrator reads this file and #12 at each check-in and moves answers to Answered. Numbers match the comments on GitHub issue #12.

## Open

### From 24 Nov (6): class rows sent to the browser (a #243 leftover)

From the staff engineer's plan for the next small item. After #243 the teacher can no longer see or clear a pupil's needs and "Working at", but every class detail response still sends them to the browser, and the pupil routes still accept writes to them. The item stops both; the stored values stay as they are (answer 123). Teachers notice nothing; the study sends less special-category data about children. The events, the export and the evals do not change.

### 139. Nothing in the app reads the hidden needs back

> **Stop the hidden needs and "Working at" leaving the server, and stop the app writing them, so nothing in the app can read them back (they stay in the database)?**
>
> **Default:** yes. **Holds up:** the item's dispatch.

### 140. The empty "needs" count in the classes list

The classes list still carries an empty `needs_counts`. Removing it now would show no classes in tabs already open until they are reloaded.

> **Leave its removal for a small clean-up after the next release?**
>
> **Default:** yes. **Holds up:** nothing.

### From 24 Nov (3): pupil sign-up and log-in (D #245), and the reader's passages (#247)

From the staff engineer's briefs for D ([#245](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/245)) and the server reading blocks as the pupil sees them ([#247](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/247)). D runs on the defaults; #247 waits for a free slot.

### 136. How far "Log in" goes

Answer 117: `/signin`, its lead line and the links to it will say "Log in".

> **Should "Sign out", the "Continue with Google" buttons, the messages ("Signing in did not work") and the admin password form's "Sign in" button also change?**
>
> **Default:** no, only the page and the links to it. The admin button is shared with `/admin`, is not shown in production, and 8 browser tests click it. **Holds up:** nothing.

### 137. A login pupil who signs up again with another class's code

Close to question 120. Once a teacher's login has been used, B ignores the class code, so a pupil who goes through Sign up again with a second class's code is signed in to their own class only. No screen offers joining a second class.

> **Join them to the second class, or keep a login to its own class?**
>
> **Default:** ignore the code, as B builds it, and look again with 120. **Holds up:** nothing.

### From 24 Nov (5): test pupils (V #215) and the pupil's asks (R3 #236)

From the staff engineer's briefs for V ([#215](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/215), "View as pupil") and R3 ([#236](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/236), the pupil's ask screen). Both go ahead on the defaults.

### 125. "Start again" for a test pupil

No item plans "Start again" yet, so a test pupil who uses up the per-pupil budget (answer 106) stays refused in that class for good.

> **Plan a "Start again" button? If so, does it clear only the spend, or also the test pupil's asks and highlights?**
>
> **Default:** plan it later as a small item that clears the spend and the test pupil's asks and highlights. **Holds up:** nothing.

### 126. The per-pupil cap in the rules text

> **Should `docs/rules.md`'s line on test pupils also say they are capped by the per-pupil budget (answer 106)?**
>
> **Default:** no; V writes it in `docs/classes.md`. **Holds up:** nothing.

### 127. Test pupils after a workspace is deleted

A test pupil's `pupils` and sign-in rows outlive a deleted workspace. They hold no personal data.

> **Tidy them away with the workspace?**
>
> **Default:** yes, as a later small item. **Holds up:** nothing.

### 128. Does asking save a highlight?

> **When a pupil asks about a passage, should it also be saved as a highlight?**
>
> **Default:** no; asking and highlighting stay separate. **Holds up:** nothing (R3 builds the default).

### 129. Earlier answers after a reload

> **Should a pupil see their earlier answers again after a reload or when coming back to a reading?**
>
> **Default:** not in R3: answers stay until Close or leaving the page. Bringing them back is a later item of about 3 points (a new route). **Holds up:** nothing.

### From 24 Nov (5): removing Needs and Working at (#243), and the studio's Share

### 132. The evals and the demo class

The demo class is also the class the assistant is tested against. One pedagogy eval asks it to "make versions for my three pupils with dyslexia" (`packages/evals/evals/pedagogy.eval.ts`, demo P7A). After #243 only one pupil's note says dyslexia, so that case will probably fail the next time the evals run. It has no `baseline.json` entry and is skipped without `LIBRARY_URL`.

> **Should the evals (a) keep their own copy of the class with the old needs written into the notes, so they test the same thing, or (b) have that one case reworded?**
> **Default:** neither in #243; a small evals item once you choose. **Holds up:** nothing now; the next pedagogy eval run.

### 133. The demo class note and the study

The demo class's own note says "six have additional support needs, three with dyslexia…", and `docs/study-design.md` Appendix C, Task 2, relies on three different dyslexia profiles. After #243 the pupils show needs only in three notes.

> **Keep that sentence in the class note, or remove it?**
> **Default:** keep it. **Holds up:** nothing (one line in #243 or later).

### 134. Copy to next year

When a class is copied to next year, the new rows would carry the hidden needs and "Working at", which the teacher can no longer see or clear.

> **Should the new rows leave them out (last year's rows unchanged)?**
> **Default:** yes, as #243 builds it. **Holds up:** nothing.

### 135. Share and Try it on a studio plugin's page

Try it now opens and closes from its heading (studio PR #19). Share still has a plain heading and a one-way "Show sharing" button.

> **Should Share later open and close the same way as Try it?**
> **Default:** leave it for now. **Holds up:** nothing.

### From 24 Nov (2): pupil logins, items B and E

The staff engineer's briefs for B ([#231](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/231), pupils sign in with a teacher's login) and E ([#232](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/232), the Pupil logins card) raised three questions. Both items are running on the defaults.

### 118. The class code on a printed login slip

Each slip E prints carries the class name, the site's address, the username, the password and "First time: Sign up, then I am a pupil, then the class code from your teacher. After that: Log in." A class code can be renewed, and slips go home.

> **Should the slip also carry the class code the pupil needs the first time?**
>
> **Default:** no; the teacher shows the code as now. **Holds up:** nothing (a one-line change in E).

### 119. How a login pupil is described under "Pupils who joined"

Each row there says how the pupil signs in (Google, Microsoft).

> **What should it say for a pupil who signs in with a login the teacher made?**
>
> **Default:** "Teacher login". **Holds up:** nothing (a one-line change in E).

### 120. A login pupil in a second class

A pupil who signs in with a teacher's login can still join a second class with that class's code. If they are later removed from the login's class, the login goes and they can no longer sign in, but their membership of the second class stays, unused.

> **Allow a login pupil to join other classes, or keep a login to its own class?**
>
> **Default:** allow it, as built; revisit with V and D. **Holds up:** nothing now; it touches V (#215) and D.

### From 24 Nov: pupil asks (R2, PR #217)

R2 ([#214](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/214), [PR #217](https://github.com/ssfgreen/epistemic-differentiation-workshop/pull/217)) lets a pupil ask the AI about a highlighted passage, on the server. Its code review is clean. Questions 104 to 106 are answered; Remove is being changed to keep the highlighted passage (answer 105). This one is left. It writes a dated exception in `docs/rules.md` under "Everything is logged, under a hash", with a pointer from the rules table in `ARCHITECTURE.md`.

### 107. The reader eval run

R2 adds `packages/evals/evals/reader.eval.ts`: three cases (a plain ask stays short; an instruction hidden in the article is not followed; a pupil's personal detail is not repeated). It calls the real model.

> **May the orchestrator run it once, for about £1?**
>
> **Default:** merge R2 without it; run it once you say yes. **Holds up:** nothing.

### From 23 Nov (4): names, removing pupils and studio owners

Your answers 82 to 89 change the pupil plan: a per-class "collect names" setting, a teacher-made new password for a pupil, and an anonymised record kept when a pupil is removed. Three of these touch pupils' data and the research data, so they come back to you before the items are re-cut on [issue #152](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/152).

### 93. Who may become a studio plugin owner

Answer 83: "who invites owners? This should be the site admin, or people can apply and get approved by the site admin."

> **Today anyone on the studio's allowed sign-in lists can make a plugin and own it. Should making a plugin need the site admin's approval: an "Apply to make plugins" form, a list the site admin approves or refuses, and the site admin able to add someone directly?**
>
> **Default:** yes, as a studio item of about 5 points after S-c; people already on the allowed lists keep making plugins. **Holds up:** that studio item only.

### 96. What "keep the data" means when a workspace is deleted

Answer 95: deleting a workspace must not delete its data unless the admin also chooses that; the admin types DELETE and actively chooses between keeping and deleting the data. Today /admin's Delete (type DELETE) removes the workspace and all its data, images too.

> **Proposed: two choices, neither picked at first. "Close it and keep its data": the workspace's link, sign-in and pupils stop working, it is listed as closed on /admin, and everything stays in the database and the research export. "Delete it and all its data": as today. A closed workspace can later be deleted with its data the same way. Is that right?**
>
> **Default:** as proposed, a 3-point item (W) after the current wave, migration 0052. **Holds up:** W.

### 97 to 99. A studio plugin's status: draft, private, public

The studio plan (#125, answer 67) gives each plugin a status: Draft is "me and my editors", Private adds named `use` people, Public is shown but off until the terms exist (question 25). The staff engineer split S-c: the Share panel (S-c1, [#204](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/204), running) and the status itself (S-c2, [#205](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/205), migration 0006). Three choices a plugin owner sees are not settled by the plan.

> **97. Do new plugins start as Draft? (The platform design said "private", but answer 67 makes Draft the "me and my editors" level.)**
>
> **98. While a plugin is Draft, do its `use` people stay listed in Share but unable to open it, and can no "use" invite links be made?**
>
> **99. Going back from Private to Draft: does it hide the plugin from its `use` people again and stop their live invite links?**
>
> **Default:** yes to all three. Existing plugins that already have a `use` member become Private, so nobody loses access. **Holds up:** S-c2 only.

### 100 to 103. Studio item 6b: the rest of an entry as a form

Item 6b on the studio plan ([#125](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/125)) was 5 points: prerequisites, risks, relations, recipes and render settings as a form, and the YAML box ("Other fields") goes. The staff engineer measured it at about 10 points and split it. 6b1 ([#207](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/207): prerequisites, risks, relations, recipes; the box stays) is running. 6b2 (render settings as rows of name, kind and value; the box goes) waits on these. When the box goes, the fields with no box of their own (claim ids, version, curated_by, reviewed_by, last_reviewed, unknown keys) are kept and shown read-only under a closed "Kept as written" section, so the runner reads the same entries.

> **100. 6b becomes two items of 5 points (10 in all), one after the other?**
>
> **101. After the box goes, may an entry's claim ids, version, curated_by, reviewed_by and last_reviewed be read-only in the studio (kept, shown under "Kept as written", not editable)?**
>
> **102. Item H (who wrote and who approved each entry, migration 0007): do its marks live only in the studio's database, or are they also written into the entry's own curated_by, reviewed_by and last_reviewed?**
>
> **103. Two browser test steps type into the box that goes: "a claim that is not there is refused" and "facets typed into Other fields are refused". The same refusals stay covered by unit tests. May the first be replaced by a refusal the page can still make (a render setting the server refuses), and the second be dropped?**
>
> **Default:** 100 yes; 101 yes; 102 database only, the file's fields kept as written; 103 yes, said in the PR. **Holds up:** 6b2 (100, 101, 103) and H (102).

### From the 21 Nov run

**Your first checkpoint (21 Nov, 18:20):** sign in to the Plugin Studio, edit the existing pedagogy plugin there, and test it in Elm for Schools. That is S2 (sign-in), S3 (drafts), S4 (the pedagogy editor) and S5 (a draft's own address for a local Elm), in that order.

The quickest to unblock work: 23 (the Kubernetes branch), 25 and 26 (the studio plan, #125), 27 (the studio's Vercel settings).

**Read the design:** [plugin-platform.md](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/plugin-platform.md) (the plugin platform and the studio; the passport is [section 8](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/plugin-platform.md#8-a-minimal-passport), the 20 defaults you took are [section 13](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/plugin-platform.md#13-decided-by-the-suggested-defaults-sam-21-nov-2026)) · [architecture-target.md](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/architecture-target.md) (the move to Kubernetes) · [ARCHITECTURE.md rules table](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/ARCHITECTURE.md) · [Studio S1, #124](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/124) and [S2 to S6, #125](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/125) · [Issue #12](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/12). Each question below starts with what you need to know, then the question and its default.

### 23. The Kubernetes branch

You said keep Turso for now, and save the Kubernetes work in a branch, `migration_to_kubernetes`, with a clear note on what is done and still to do (answer 12). Much of it is already in `development`: K2's migrate command and `/api/health/ready` ([#96](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/96)), K3's manifests and compose file ([#99](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/99), [PR #114](https://github.com/ssfgreen/epistemic-differentiation-workshop/pull/114)) and K5's job worker ([#100](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/100)). None of it changes how Vercel runs. K3's check against a real sqld ([#117](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/117)) is still open; [DEPLOY.md section 13](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/DEPLOY.md#13-kubernetes-with-our-own-database-elm) carries the warning. The plan is in [architecture-target.md](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/architecture-target.md).

> **Should the Kubernetes files stay in `development` as well as on the new branch, or be taken out of `development`?**
>
> **Default:** a branch `migration_to_kubernetes` is made from `development` with a note, `docs/kubernetes-migration.md` (done / still to do), and the Kubernetes files stay in `development` too, since they change nothing on Vercel. Say if you want the K3 manifests taken out. **Holds up:** the branch and its note.

### 24. Workers' effort

On raising workers to high you said you are not sure, and that checking is an additional value and likely to catch things (answer 11). [docs/workflow.md, "Models"](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/workflow.md#models) says raise workers from medium to high when two of any five merged items need more than one review round. Four of the last five needed two rounds. High costs more per item but may save rounds. The reviewer already checks every PR at high, and this run's limit says workers stay at medium.

> **Keep workers at medium, or raise them to high?**
>
> **Default:** medium, as this run's limit says; the reviewer is the extra check. Say "high" to raise them. **Holds up:** nothing now.

### 25. Who can use a public plugin

[plugin-platform.md section 4](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/plugin-platform.md#4-publishing-access-and-copyright) has three levels: private (the author only), limited (people or hosts holding a key the author makes and can cancel) and public (anyone, listed in the browser, after a review). Default 4 in [section 13](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/plugin-platform.md#13-decided-by-the-suggested-defaults-sam-21-nov-2026) builds public publishing but keeps it switched off until the terms are approved. You said public should be usable, or the demo users cannot try it, "Or maybe this is limited access?" (answer 5). Answer 17 adds invite links and sharing a plugin with edit, comment or view.

> **For the demo users, is limited access by invite enough to start?**
>
> **Default:** yes: limited access (named people by invite, answer 17) to start; a fully public plugin, with the full passport, comes later. **Holds up:** the access levels in the studio plan ([#125](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/125)).

### 26. Usage details for improving the studio

You agreed the studio keeps the provider's id, email, name and sign-in times, and that making plugins is not research (answer 18). You added that it may record more about use, to improve the platform, even if not for academic research. The studio plan is on [#124](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/124) and [#125](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/125).

> **Which usage details should the studio record?**
>
> **Default:** counts only, never content: sign-ins, plugins created, edits saved, tests run in the studio, errors; kept in the studio's own database, not research data, shown to no one but the admin. Say what else you want. **Holds up:** the usage counts in the studio plan.

### 27. Preview protection on the studio

Vercel can put previews behind its own login. The studio has its own sign-in, a draft address is protected by its code, and the runner by `RUNNER_TOKEN`. Claude, and an Elm outside your machine, cannot reach a protected preview. The earlier default was on until S5, then off. You answered "Leave off for now" (answer 20), which could mean protection off, or leave the question for now.

> **Did "Leave off for now" mean turn Vercel's protection off for the studio project now?**
>
> **Default:** read as protection off for the studio's Vercel project now. Say if you meant "keep it on". **Holds up:** the studio's Vercel project settings.

### 28. Who are the pedagogy plugin's named authors?

The passport (you gave its fields in answer 7) names the people who wrote and approved each section, from their studio logins (answers 5 and 9). PP1a ([#131](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/131)) builds the passport; PP1b (on [#103](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/103)) writes the pedagogy plugin's own passport. Its sections can be drafted by an assistant from the manifest and data, but someone has to be named as author and approver. The design is [plugin-platform.md section 8](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/development/docs/plugin-platform.md#8-a-minimal-passport).

> **Who should be named as authors of the pedagogy plugin, and who approves each section?**
>
> **Default:** "not answered" for now; the sections are drafted by an assistant and marked not approved until you name the authors. That is fine for limited access. **Holds up:** nothing now; a public pedagogy plugin later.

### From 15 Nov

### 3. Class set-up events: log them as they are?

Logged when a teacher sets up classes. `school_create` and `school_rename` carry ids only (the school name is not logged). `year_group_create`, `year_group_update`, `year_group_archive`, `class_create`, `class_update`, `class_archive` and `class_open` carry ids plus the year group's or class's name, the school year and the stage. No pupil data (`pupils_change` was agreed earlier).

**You are undecided** and will talk it over with Prof. Judy Robertson; a pros and cons write-up for that meeting is in its own doc, [Class set-up events: record them or not?](https://claude.ai/artifact/6VthHNXX7Wwmia5adhbR6o). It found that `class_update` and `year_group_update` also log the class's free-text note in full, which the question above leaves out. **If you leave it:** these events ship as they are in this release, and if you decide to drop the names afterwards, the change is small. Say "hold" if you would rather they did not ship until then.

### 10. The pedagogy eval: fix before the release, or after?

The release eval ran on `development` (7738239, one run each, about $1 to $2). The 13 core cases passed 13 of 13. Layout passed 13 of 14; the one miss asked a clarifying question and passed on a re-run. The pedagogy eval, run for the first time, passed 4 of 8:

- **Two cases expect Comic Sans** for pupils with dyslexia. Comic Sans went with Calibri, as you agreed, and the assistant told the teacher so correctly. The cases are out of date, not the assistant.
- **The assistant simplified a task without saying it had lowered the goal.** A prompt fix.
- **It linked a curriculum outcome to a PDF.** Two instructions disagree: the pedagogy message says no links, the library tool says cite the source with its link. A small prompt fix.
- **Four cases went over the eval's input budget** (6,000 uncached tokens): library reads are long. The budget, not the teacher, is the issue.

**If you leave it:** ship now; the pedagogy library is already listed as on and waiting for review. After your live testing, one item updates the two Comic Sans cases to today's fonts, fixes the two prompt points and raises the pedagogy budget, then re-runs the pedagogy eval. Changing an eval case needs your yes: this is that yes, unless you say otherwise.

## Answered

| Question | Your answer | What happens |
| --- | --- | --- |
| 138. The model reads a reading exactly as the pupil sees it (24 Nov) | Yes, put it in main | #247 merged (PR #252) without an eval run; release PR #254 into main |
| 121. Where Needs and Working at go (24 Nov) | "Yes, everywhere." | Removed from the pupil table, the pupil card in chat and the classes list (one item, brief being written) |
| 122. The assistant (24 Nov) | Yes; such words can go in a pupil's notes, at the teacher's discretion; the demo class gets example notes on three pupils (one dyslexic with their needs, one struggling on a failing F, one succeeding) | The assistant stops getting needs and Working at; no eval run without a separate yes |
| 123. Data already entered (24 Nov) | Yes | Kept hidden and unchanged in the database; no migration |
| 124. Research data and the classes list (24 Nov) | Yes | Events and export keep their format; the "N needs" count goes from the classes list |
| 116. The pupil login events in the research export (24 Nov) | "Okay" (default) | `pupil_logins_made` and `pupil_password_reset` stay in `events.jsonl` as built: class id and count only (PR #228, merged) |
| 117. "Log in" on the teacher sign-in page (24 Nov) | Yes | `/signin` says "Log in", a small later item |
| 104. The rules exception for pupil asks (24 Nov) | Yes | The `docs/rules.md` section on PR #217 stays, with what Remove keeps changed as in 105 |
| 105. What Remove deletes from a pupil's asks (24 Nov) | "No. We should keep the parts asked about. All data just not user identifying information." | On Remove, the highlighted passage, prompt and reply are kept under the random id; only what identifies the pupil is deleted. Changes answer 91's "texts deleted" for asks (PR #217) |
| 106. Test pupils' asks (24 Nov) | Yes | Kept like a pupil's, out of research data and Progress, paid from the workspace budget and capped per pupil (PR #217, V #215) |
| 108. Teacher-made logins instead of a pupil's own email (24 Nov) | "No. Teacher made logins will have username and password, if students login they'll have email or ID. These will be independent, non-replacing, and might live together." | Teacher-made logins and Google/Microsoft sign-in side by side, both possible in one class; a pupil's own email and password (P3) is dropped; no email stored (#221) |
| 109. What a login looks like (24 Nov) | Yes | Server-made word usernames and passwords, no name field (#223) |
| 110. When the class code is needed (24 Nov) | "Yes. This is the difference between 'signup' and 'login'" | Sign-up needs the class code; logging in does not (#221 items B, D) |
| 111. Two new research events (24 Nov) | Yes | `pupil_logins_made {class_id, count}` and `pupil_password_reset {class_id}`, server-only, not in the export |
| 112. Migration 0048 (24 Nov) | "Presumably a migration is needed" | `0048_pupil_logins` adds one table (#223) |
| 113. Too many wrong passwords (24 Nov) | "After 5 wrong password, have 'Ask the teacher for a new password'" | After 5 wrong passwords the login locks and the pupil is told to ask the teacher; the teacher's Regenerate unlocks it (#221 items B, F) |
| 114. Wording on the front page (24 Nov) | "Yes, with little illustrated icons of a teacher and pupil" | "Sign up", "Log in", "I am a teacher", "I am a pupil", each choice with a small drawn icon (#224) |
| 115. Logins when a workspace is deleted (24 Nov) | Yes | A workspace's logins go with it (#223) |
| 90. Pupils' names on the server (23 Nov) | "Get me to the point I can test as a student! Use sensible defaults." (default) | When a class collects names, first name and last initial are stored and shown only to its teachers, never in research events, the call log, the export or the model; the setting can change later, off deletes names (item N) |
| 91. The anonymised record kept when a pupil is removed (23 Nov) | As 90 (default) | On Remove, counts and highlights move to a random id with the teacher and class ids; texts deleted; not exported until Sam and the ethics approval say otherwise (P2a's `removed_pupils`, P2b2) |
| 92. A new password made by the teacher (23 Nov) | As 90 (default) | Teacher-made only, for password pupils, shown once, old password stops at once, ids only logged (P3b) |
| 94. What the admin's Forget does to the anonymised record (23 Nov) | "yes" | Forget keeps the anonymised record, as Remove does (#66b) |
| 95. How long the anonymised record is kept (23 Nov) | "yes - but workspace deletion shouldn't delete the data unless this is also ticked. If you want to delete a workspace, you have to type DELETE and choose actively between retaining the data or deleting the associated data." | Kept until deleted; never exported without Sam's and the ethics approval's yes; new events carry ids only. Deleting a workspace becomes an active choice between keeping and deleting its data: item W, question 96 |
| 82. Signing in to the studio again after joining by invite (23 Nov) | "Sure" | Someone who joined by invite signs in again while a member of a plugin, and is shut out once removed from all (S-b, #193) |
| 83. Who may make studio invite links (23 Nov) | "Sure, but who invites owners. This should be the site admin or people can apply, and get approved by the site admin." | Invite links stay owners only (#193). Who becomes an owner: question 93 |
| 84. Workspace access codes at sign-in (23 Nov) | "Off sign-in only. This is something to come back to though. We might just want user accounts and their associated data in the future." | H moves the access code to a quiet page; links keep working. Later: user accounts with their data may replace workspace codes |
| 85. Teacher sign-up codes (23 Nov) | "Yes, same thing." | Today's admin invites become teacher sign-up codes; existing teachers need nothing; the open-door list stays (H) |
| 86. Pupil email and password (23 Nov) | "Password reset should be possible. But the teacher can just click 'regenerate student password' which shows onetime only." | P3 as proposed, plus a teacher's "Regenerate password", shown once. Follow-up: question 92 |
| 87. What a teacher sees per pupil, and what Remove deletes (23 Nov) | "Names are available if teachers toggle the 'collect names' setting when they create the class. This would also change signup, so students can enter their first name and last initial. Remove deletes pupil, but anonymises the record of their usage, so it can be analysed for behaviour later if needed. Anonymised data keeps the teacher id associated with the student and the class id, but nothing else connecting back to the class / school." | A per-class "collect names" setting; Remove keeps an anonymised usage record. Follow-ups: questions 90 and 91; P2a, P2b, P3 and N to be re-cut |
| 88. How much of the safety instruction teachers may change (23 Nov) | "Yes" | All of it, never empty, "Back to the default", the log keeps a hash (S2, #195) |
| 89. Microsoft pupils and the `profile` scope (23 Nov) | "Depends on teacher class settings." | Microsoft pupils are asked for `profile` only in classes that collect names |
| 69. Microsoft names (23 Nov) | "Both is fine, that's okay so long as we don't store it." | Item N fetches names for Google and Microsoft; a Microsoft name passes through the server for a moment and is never stored or logged |
| 70. A fixed safety instruction (23 Nov) | "A version that is the default for teachers, and they can adapt it in their class tab (a class-based system prompt addition)" | The reader's safety instruction comes from config as a default; each class can adapt it on its class page; R2 sends the class's version ahead of the prompt's instruction. Re-planned on #152 |
| 71. The pupil sign-in rule (23 Nov) | "There is no need. This is currently in prototype phase!" | No rule line: P1 (PR #183) drops the rules-table row and the "Pupils" section of `docs/rules.md`; the `PUPILS=on` setting and the workspace switch stay |
| 72. Keeping pupils out of teacher sign-in (23 Nov) | "Teachers have to use a signup code to get access, maybe so do pupils. Remove research workspace code, this is too complex at signin. Signin should be the button on the homepage, student or teacher, enter signup code. After this, they can just login. A signup code is the 'class code' from a teacher, generated and shown on a teacher's class page. Teachers should be able to delete pupils." | Sign-in is re-planned on #152: one Sign in button, then student or teacher; first time, a sign-up code (a class code for a pupil); after that, plain sign-in. Teachers can remove pupils |
| 73. Google set-up for names (23 Nov) | "Okay, but also we need a way to just locally test (signup as a student with a class code using email and password). Turn on/off by teachers in their class page." | Testing mode for the Classroom API. New: pupil sign-up with a class code and email and password, switched on or off per class by the teacher. Re-planned on #152 |
| 74. A pupil link on the landing page (23 Nov) | "As above" | Replaced by 72: the homepage's Sign in asks student or teacher |
| 79. The pupils switch in the research data (23 Nov) | "Okay" | `pupils` joins the workspace switches in the research data; P1 merges |
| 80. Teacher and pupil accounts kept apart (23 Nov) | "As above" (yes) | Both rules stay; the admin gets "forget this pupil account" (#66) |
| 81. Figures in the research log for reader settings (23 Nov) | "Sure keep going" | A small follow-up adds the follow-up limit and pupil budget to `class_reader_settings`, and `follow_ups_max` and the article's hash to `reading_set` and `reading_update` |
| 75. Approving your own entry (23 Nov) | "Verified can come from a solo author" | Item H: an author may verify their own entry |
| 76. Invited people starting plugins (23 Nov) | "Yes" | Item S-b: someone who joined by invite may start plugins |
| 77. How long invite links last (23 Nov) | "Sure" | Item S-b: 14 days by default (1 to 30), many people per link |
| 78. Who may make a plugin's public link (23 Nov) | "Yes editors can share" | Studio PR #12 (#180) merged |
| 53. A pedagogy draft not allowed yet (22 Nov) | "Use sensible defaults" | The built-in pedagogy library stays in a chat until the draft is allowed there (E1b, #159) |
| 54. Class details sent to the studio (22 Nov) | "Use sensible defaults" | Stage, level, subject, curriculum codes and adaptation ids go to the studio for an allowed pedagogy draft; no names or pupil rows; the change note says so |
| 55. Copies of a `use_only` plugin (22 Nov) | "Use sensible defaults" | Studio authors may copy it while studio sign-in is allow-listed; each copy stays `use_only` (S5, #156) |
| Curriculum without classes | Usable without classes when its plugin is on in the plugin library | That is how F3 works; noted on PR #88 |
| Rename `AUTH_MICROSOFT_*` to `MICROSOFT_*` | Yes | In this release, once a worker slot frees; follow-up in question 2 |
| Does the preview have its own database? | No, the same database | Follow-up in question 1 |
| An eval run before the release? | Yes | Once F3, #77 and #79 merge: the 13 core cases plus the layout and pedagogy evals on development (a guess of $1 to $2); the result goes in the release note |
| 1. Preview and live share one database | The preview now has its own database; please move my admin account there | Steps for the admin account sent in chat (it needs the new database's settings, which only you hold). Release note updated |
| 2. Old Microsoft names keep working? | Production uses AUTH_MICROSOFT_CLIENT_ID and AUTH_MICROSOFT_CLIENT_SECRET | The server reads both, new names first, so nothing breaks; rename on Vercel whenever you like |
| 4. About you text logged | Yes, log it | Ships as is |
| 5. Small interaction records | Yes | Ship as is |
| 6. study_seed | Yes | Ships as is |
| 7. F3 chat record lists only plugins on offer | Ship as is for now | Ships as is |
| 8. Plugins off, curriculum on | Everything on by default; I turn things off for specific users in the admin dashboard | Each switch decides on its own, as now. The dashboard toggles: question 9 |
| 9. Dashboard switches (F2): this release or after? | After this release | F2 stays on the backlog until you say go after live testing |
| 1. Oracle Cloud account (21 Nov) | "For now, let's keep building on vercel as Oracle is fiddly to setup and doesnt seem to sync smoothly with github, but any changes should be considered wiht how this ports later to the kubernetes infra." | Vercel and Turso stay; changes are weighed for how they port to Kubernetes later |
| 2. Moving live data to Oracle (21 Nov) | "Paused." | Nothing moves; Vercel and Turso stay |
| 3. Pupil activity (21 Nov) | "default" | Built as not recorded |
| 4. The pupil-row scrub (21 Nov) | "default" | Left off |
| 5. The plugin defaults (21 Nov) | "#4 - public should be usable otherwise we can't try it with our demo users. Or maybe this is limited access? #12 only for public, but suggested for limited in minor form, #13 - this will likely have multiple authors working on it, and their interactions should be recorded. i.e - someone write section A, someone else approves B - they should all be named authors. Use their login details to construct." | The studio plan (#125) gains named authors, with who wrote and who approved each part. Follow-up on public plugins: question 25 |
| 6. The studio repo (21 Nov) | Done | You created ssfgreen/education-plugin-studio; S1 (#124) is being built there |
| 7. Figure 2: the passport's fields (21 Nov) | "I'm not sure about territory...for now it should have author(s), description of contents, expected use, tested use, risks. Issuer is an additional stamp of verification that comes from organisation accounts - to be created later." | PP1 (#103) re-cut with these passport fields; issuer comes later |
| 8. Pedagogy outside its territory (21 Nov) | "These should be suggestions, not hard rules. i.e - much pedagogy is generic and deployable wherever. If it is for another subject, country specifically, then this approach makes sense." | Territory checks are suggestions only |
| 9. Pedagogy's identity and role statement (21 Nov) | "To start with this is specific user accounts that create / edit the content. Later they may be associated with an organisation i.e - University of Edinburgh" | Identity is the accounts that create and edit; organisations come later |
| 10. Minimum-rating order (21 Nov) | "Yes right order, but any evidence should be cited. Practioner wisdom should either have a practioner example written, a url. Other evidence should have a URL and a description of the edvidence. This could also be academic citations with a DOI for example." | That order stands; each evidence rating needs a citation |
| 11. Workers to high effort (21 Nov) | "I'm not sure, checking is an additional value, and likely to catch things." | Follow-up in question 24 |
| 12. The sqld check for K3 (21 Nov) | "Keep on turso for now, we can do this later. Any progress that has been made on this should be saved in a branch - migration_to_kubernetes with a clear note on the current work done / still to do for this." | Turso stays. Follow-up on the branch: question 23 |
| 13. The Kubernetes front door (21 Nov) | "default" | As built |
| 14. The assistant rule (21 Nov) | "ARCHITECTURE.md should be keep up to date with CURRENT and PLANNED as key sections." | #121 re-cut so ARCHITECTURE.md has CURRENT and PLANNED sections |
| 15. The migrations rule (21 Nov) | "I don't know. Do the sensible option." | On the default, in #121's re-cut |
| 16. Where agents ask (21 Nov) | "Use your judgement" | On the default, in #121's re-cut |
| 17. Who may sign in to the Plugin Studio (21 Nov) | "Also invite links, I'll need to be set up as admin on this platform too to enable this. Users should also be able to be invited to specific plugins, i.e - I'd create the pedagogy plugin, send an invite code to a colleague and share the project with them with 'edit/comment/view' status." | The studio plan (#125) gains invite links, you as admin, and sharing each plugin with edit, comment or view |
| 18. What is kept about a studio author (21 Nov) | "Yes. Although maybe we should record some additional details for learning about use to help us improve the platform even if not for academic research." | The default stands. Follow-up on usage details: question 26 |
| 19. Accounts you set up (21 Nov) | "Yes, buut I need these urls." | The exact addresses and variables come to you from S2's PR |
| 20. Vercel's preview protection on the studio (21 Nov) | "Leave off for now." | Follow-up in question 27 |
| 21. Pedagogy data in the studio repo (21 Nov) | "Yes. Also Scottish Curriculum for Excellence, and the new version (from the latest review documents) should also be created." | pedagogy.yaml is copied. A Curriculum for Excellence plugin, and a new version from the latest review documents, are being planned; the licence is checked first |
| 29. The new Curriculum for Excellence version (21 Nov) | "continue just make them" | CF1 (today's CfE as a plugin) and CF3 (the CIC draft frameworks as a draft plugin, labelled not in force until August 2028) are both built; CF3 marks the drafts' licence as not confirmed, and asks you for the Glow host if the sandbox cannot reach it |
| 30. Which passport changes wait for the teacher (21 Nov) | "continue" | The default: a change to the authors or the risks section waits; the other three sections do not |
| 32. Two web addresses for the CfE drafts (21 Nov) | Approved the prompt adding `blogs.glowscotland.org.uk` and `scotlandscurriculum.scot` to the cloud environment | CF3 (#145) carries on from draft PR #146 |
| 33. The CIC drafts' addresses, and serving them (21 Nov) | "Okay to pause on the new curriculum" | CF3 (#145, draft PR #146) is paused: no worker, nothing served to teachers. It resumes only when you say, with the draft file addresses, and (b) is asked again then |
| 31. Attaching the studio repo to the orchestrator (22 Nov) | "Yea attach it" | Attached to orchestrator 24; studio PR #2 (S2, #138) is in review |
| 34. Elm-side draft testing on Vercel (22 Nov) | "Other defaults make sense for now - I want to play with it to be able to refine the spec" | Yes, drafts only, built to port. B is on the board (#154 to #160) |
| 35. A draft's search words leave Elm (22 Nov) | Default | Yes: Ask first, the runner keeps no text |
| 36. Which Elm (22 Nov) | Default | The development preview first |
| 37. A draft open on its link (22 Nov) | Default | Yes, for your own testing; codes can be cancelled (S5, #156) |
| 38. What "in Claude" means (22 Nov) | Default | A custom connector (S7, #157) |
| 39. Research data for drafts (22 Nov) | Default | `plugin_draft_add`/`_remove`; `draft` and `content_hash` in `chat_prompt` (E1a #158, E1b #159) |
| 22. "Test in Elm" for now (21 Nov) | Replaced by 34 | Draft testing is built in Elm on Vercel |
| 40. Test pupils on Vercel (22 Nov) | "we'll create mock accounts in google classroom" | Test pupils only; where exactly: question 46 |
| 41. How a pupil signs in (22 Nov) | "these should be signed in via Auth. A test option with username and password (generated by the teacher from the class page) for now as well." | Google or Microsoft sign-in plus a teacher-made test login (C1, C3); what it keeps: question 50 |
| 42. What the reader is (22 Nov) | "articles for kids to read where they can highlight sections and ask predefined questions to an AI chat model, in a normal looking sidebar interface" | C re-planned as C1 to C7 on #152; questions 46 to 52 |
| 43. Research data for pupils (22 Nov) | Default | The teacher's actions with ids only; nothing a pupil does |
| 44. Removal from the studio's list (22 Nov) | Default | At once, in a later studio item |
| 45. The studio's sign-in rule (22 Nov) | Default | The wording stands |
| 46. Where pupils try it (23 Nov) | "No - I want to test in production. This is also a test site of sorts as it's only viewable to me and a select number of people working on the project." | Test pupils on the live site, behind a per-workspace `pupils` switch only an admin turns on (off by default); follow-up in question 57 |
| 47. A teacher checks what pupils see (23 Nov) | "A teacher can draft a set of prompts the students can use on the reader project. The flow is, students highlight a piece of text, a set of options becomes available for this piece of text and they can click on it. Follow on options then include things like 'can you explain this in more detail', 'can you give me an example' etc." | Each reading has a teacher-edited prompt set: options after a highlight, follow-ups after a reply; follow-ups in questions 58 and 59 |
| 48. What goes to the model (23 Nov) | "Right now yes. Teachers should have control (a toggle) to enable text typing into the box later." | Buttons only now; a teacher typing switch is a later item that needs your yes and its own evals |
| 49. Pupils' activity in the research data (23 Nov) | "Pupils activity is logged because teachers need to be able to see student info i.e - student 1 (could even have a name if they allow this) has asked 'can you explain this in more detail' 10 times, and clicking on the worksheet you can see which parts they have highlighted etc. This is for teacher monitoring, not researcher monitoring." | Kept in its own tables for the teacher's Progress (counts per question, highlights on the article, replies), never in research events, the call log or the export; a dated exception in `docs/rules.md`, to be added by item R2 (not there yet) |
| 50. What a pupil's Google or Microsoft sign-in keeps (23 Nov) | "Okay. We only see account id etc, but can the teacher see pupil names rendered in the client, but not saved to the db?" | Provider, account id and tenant only; names on screen: question 60 |
| 51. Each pupil's budget (23 Nov) | "Let the teacher set a default budget on the class view." | A default pupil budget card on the class page (C7); the figure: question 61 |
| 52. Safety evals for the reader (23 Nov) | "yes." | Six reader safety cases run once after the model step (about £1) |
| 56. GitHub CI until the monthly reset (23 Nov) | "Yes - local checks." | Workers run `scripts/ci.sh`, the reviewer runs it again, and the orchestrator checks the merged result; every merge note says GitHub CI did not run |
| 57. Who the test pupils are (23 Nov) | "Have it setup as real childern in the system, we wont' use any, but we need to see the real flow not a fake flow. We need a way to test what real children would see. For pupils (maybe a test pupil, could be a view a teacher clicks 'view as a student') which a way to 'go back to teacher' so they can easily see pupils views." | The real pupil flow: Google or Microsoft sign-in on a pupil page and joining by code, no made-up logins; "View as a pupil" with Back to teacher (item V); the admin-only `pupils` switch stays |
| 58. The teacher check for test pupils (23 Nov) | "Teachers can add to a list of 'acceptable prompts' and for specific worksheets, can say which of these are allowed. Teachers can also map these to buttons..." | A prompt library (item L): each prompt has a button label, a hidden instruction the teacher writes that goes to the model, and ticks for "after a highlight" and "as a follow-up"; each reading picks which are allowed |
| 59. What a follow-up sends (23 Nov) | "Up to 3 followups sure, settable on the class page, and overridable on the worksheet / close-reading text page." | Up to 3 follow-ups, set on the class page (item S) and changeable on each reading (item R0) |
| 60. Pupil names on screen only (23 Nov) | "...can we use with google classroom - fetch teh ID only, and have the teachers google classroom account fetch the name? OR - we use google auth to fetch the students details, but we never send them to the server? ie - we should only store the ID, but it's okay if it get's onto the client view. Messy interacitons such as uploading lists or files etc is not wanted." | Item N: names fetched from Google Classroom in the teacher's browser, never sent to Elm's server; only the account id is stored; no uploads. Follow-ups in questions 69 and 73 |
| 61. The default pupil budget (23 Nov) | "Sure." | £0.50 a pupil by default |
| 62. Sign in on the landing page (23 Nov) | "Erm, no, students should be able to signin too using their google classroom / msteams accounts - they just go to a different page, a student page rather than a teacher view." | Pupils sign in with Google or Microsoft on the pupil page `/r` (item P1); a landing page link: question 74 |
| 63. Entry types (23 Nov) | "A plugin can be absolutely anything. A teacher needs to be able to define the datastructure of it, then be able to populate as they see fit. For the pedagogy plugin, these existing 8 are fine." | The pedagogy plugin keeps its eight types; teacher-defined data structures become a later plan (about 28 to 32 points across both repos), put to you separately |
| 64. The "Human" label and entry status (23 Nov) | "Verified means approved by a named author. draft and published only for now." | Item H: who wrote and who approved each entry, from their logins; status offers draft and published. Follow-up in question 75 |
| 65. Invited people may sign in (23 Nov) | "Yes. Following the invite link." | People get in by following a plugin's invite link (item S-b) |
| 66. Storing invite emails (23 Nov) | "Yes. These are invite linnks not emails for now." | Invite links only, no email stored (item S-b). Follow-ups in questions 76 and 77 |
| 67. What draft, private and public mean (23 Nov) | "Yes, like sharing in google docs or ms365" | Members with roles (owner, edit, use) and a Share panel, as in Google Docs (items S-a and S-c) |
| 68. The studio tidy-up (23 Nov) | "yes" | #168 dispatched with the entry split |
