# Classes (12 Nov 2026)

Sam's answers of 12 Nov are in "Decisions" at the end and folded in below. Built on 12 Nov: C.0,
C.1, C.2, C.3 without paste from a spreadsheet, and C.6 as copying a class, with the demo P7A
(see `docs/HANDOVER.md` 4a8). Built later on 12 Nov: C.4 (curriculum, for classes) and a first
slice of the pedagogy library, with adaptations chosen for pupils ("Pedagogy" below; HANDOVER 4a9).

## The idea

Projects are whatever a teacher wants them to be. Classes are one thing only: the teacher's real
teaching groups, set up once a year, and the place a chat starts from when the work is for them.
Classes change every year, so each belongs to a school and a school year (Sam, 12 Nov):

```
Teacher (the workspace, for now)
└── School            My school (named by the teacher; the demo has its own fictional one)
    └── School year   2026-27 (turns over on 1 August)
        └── Year group    P7, S1, S2 …
            └── Class         7B, P7 Literacy, S2 English set 1 … (starred: in the sidebar)
                └── Pupils    brave-kettle, quiet-comet …  (a made-up label and notes, never a name)
```

A primary teacher stars their one class and finds it in the sidebar under Classes. A secondary
teacher's many classes are in the list that "Classes" opens: one row a class, in a school year
(this one by default, or all), sortable by class, year group, subject, school year or pupils.

Each level holds context the assistant reads in a chat started there:

| Level | Holds |
| --- | --- |
| Year group | A note, files, skills, curriculum focus (shared by its classes) |
| Class | Stage and subject, a note about the class, the pupils' needs (a note, a table or both), supports available, curriculum focus and where the class is in it, files, skills |
| Pupil | A label, what helps, and a note (a need or a grade goes here since #243). One row in the class's table |

A chat is started in one of three places: a **class** (it sees the class and its year group), a
**year group** (it sees the year group, its classes' notes and each class's number of pupils) or **nowhere** (as now).

This matches what teachers asked for in the make kit: the Classes zone already has Class profile,
Already covered, Supports available, About my class note, What is stored and Adapt for the whole
class (`client/src/make/catalogue.ts`, now on the `archive/make-kit` branch). The study's tasks are given to teachers verbally, and they
make their own projects and chats; no task content lives in the product (Sam, 13 Nov 2026). The
demo class P7A that a study workspace starts with ("Study workspaces" below) is the class they can
work with.

## How it relates to projects

**Recommendation: its own tables and screens, sharing the machinery underneath.** A class is not a
project with a flag, because it has structure (year groups, pupils), a yearly life (move pupils, roll
over) and data a project never holds (needs). But files, instructions and skills work the same, so:

- **Files:** `reference_files` gains `year_group_id` and `class_id`, as it gained `thread_id`. The
  catalogue, `search_references`, `read_reference` and the limits work unchanged; a file has exactly
  one owner.
- **Skills (Sam, 12 Nov):** skills sit above all of these. A teacher writes a skill once, in the
  workspace's own skills list, and imports it into any project, year group or class. So teacher
  skills (T.1 in `docs/plugins.md`, the old P.3) are built as `skills` owned by the workspace, with
  a link table `skill_uses (skill_id, owner_kind, owner_id, version NULL, created_at, removed_at)`,
  `owner_kind` being project, year group or class. A NULL `version` follows the latest; a number
  pins it. A class chat sees the skills imported into the class and into its year group. This
  replaces P.3's `project_skills` table before it is built, and changes T.1: a plugin is published
  from a project's imported skills, as before.
- **Chats:** `threads` gains `class_id` and `year_group_id`. A chat has at most one of project,
  year group or class. Projects and classes both stay as they are: no teacher has used a project as a
  class yet, so nothing needs moving (Sam, 12 Nov).
- **Screens:** `ProjectScreens.tsx` is 601 lines. First move its Instructions and Context cards
  into their own components (a structural commit), then the class pages reuse them.

## Screens

- **Sidebar:** a **Classes** section above Projects: the starred classes this school year, and
  the class or year group whose page or chat is open. Its chats nest under it as a project's do
  (Class › Chat › Doc). The button beside "Classes" opens the list.
- **Classes list:** the school's name (editable), a school year to show, the table with a star on
  each class, and a form to add a class (name, year group, made if new, and subject).
- **Class page** (#173): its star, name, **Copy to next year** and Archive across the top; the
  lists in the main column (its **Chats**, then **Pupils**; readings and Progress are
  to join them); a sidebar on the right with **Class details** (stage, subject, year group),
  **Ask or start a chat** ("Start a chat for 7B"), **About this class** (the note),
  **Curriculum**, **Pupil reader** and **What is kept**. When the page is narrower than 62rem the
  sidebar goes under the lists.
- **Pupil reader card** (#186): **Follow-ups** (how many a pupil may ask after one answer, 0 to
  10) and **Pupil budget** (each pupil's default budget, £0 to £5, to the penny; "0.5", "£0.50"
  and "50p" all mean 50p). Each saves as it changes; an empty box goes back to config's
  `reader.follow_ups_max` or `reader.pupil_budget_gbp`, marked "(default)" and read when asked, so
  a class that has not chosen follows config. Copy to next year carries them. Logged as
  `class_reader_settings` with the class's id and the values in force after the change (question 81,
  #195). Nothing uses them yet (R2 will).
- **Safety instruction** (#195, on the same card): what the reader's model is told about keeping
  pupils safe. Each class starts with config's `reader.safety_instruction` and can keep its own
  version (up to 2,000 characters, saved on blur); it cannot be saved empty, and "Back to the
  default" goes back to config's text. Typing the default's text exactly also goes back to the
  default. Copy to next year carries a class's own version. Logged as `class_reader_safety_set`
  with whether it is the default, a hash and the length, never the text (question 88, Sam 23 Nov 2026).
- **Class code card** (#212, above the Pupil reader card): the code pupils join the class with at
  `<site>/r/join` (#245). No code: **Make a code**. A code: the code in a read-only box labelled "Class code",
  **Copy**, **Renew** (a second click; the old code stops at once) and **Close** (a second click;
  back to "Make a code"). Not shown for an archived class. The code is never in a button, link or
  label, so the interaction log never carries it; `class_code_set` has ids only.
- **Pupil logins** (#232, between Class code and Pupils who joined): a username and password for
  a pupil who signs in without Google or Microsoft (A's routes, #223). **How many** (1 to 40) and
  **Make N logins**, only while pupils can join. After a Make, **New logins** shows each username
  and password once, with **Print slips** (one slip per login, several to a page: the class, the
  site's address, username, password and how to get in; no class code, question 118's default,
  `CODE_ON_SLIPS` in `slips.ts`) and **Done** (a second click; the passwords cannot be shown
  again). The list: each login "Not used yet" or its pupil's label, "Locked" after five wrong
  passwords, and **Delete** (a second click) while never used. **New password** (#246) on every
  login, used or not, locked or not, while pupils can join and no passwords are on show: a second
  click ("Make a new password? The old one stops working at once and the pupil is signed out.",
  **Make new password**) shows the new one once in the same panel, titled **New password**, with
  Print slips and Done. The old password stops at once, the login unlocks, and its pupil is signed
  out everywhere; the pupil stays the same pupil, in the same classes. Shown while pupils can join,
  or whenever the class has logins. A pupil who uses a login reads "Teacher login" under Pupils who
  joined (question 119's default, `providerName`). Logged as `pupil_logins_made` (class id and
  count) and `pupil_password_reset` (class id) by the server; no username or password reaches the
  research data.
- **Pupils who joined** (#220, below the Class code card): how many have joined, a row for each
  ("Pupil N", the provider they sign in with, the day they joined; never the teacher's test pupil)
  and **Remove** (a second click: "Renew the code to stop them joining again"). Shown whenever
  someone has joined, even with pupils switched off or the class archived, so a child's data can
  always be removed; empty, only while pupils can join ("No pupils have joined yet."). Remove
  (`server/src/pupils/remove.ts`) leaves a `removed_pupils` row; the pupil's reader highlights and
  asks in the class (each ask with its passage and reply) stay under its id, and only what names
  them goes: the membership, and when it was their last class the pupil and their sign-ins too
  (question 105; `docs/rules.md`). A removed pupil may join again, while the code is open, as
  a new Pupil N: a class never gives a number twice. Logged as `class_pupil_remove`, the class id
  only; the button's accessible name is "Remove" and nothing more.
- **View as pupil** (#215, in the header beside Copy and Archive): opens `/r` in a new tab as the
  class's **test pupil**, so the teacher sees what pupils see. Shown only with pupils on and the
  class not archived. One test pupil a class, made by the server on the first click (provider
  `teacher_test`, no number, shown as "Test pupil"; the first real pupil is still Pupil 1); later
  clicks sign in as the same one. `/r` shows "Test pupil (you)" with **Back to teacher**, which
  signs out and closes the tab. The test pupil is not in Pupils who joined, cannot be removed and
  cannot join another class. Its highlights and asks are kept like a pupil's (not research data)
  and must be left out of Progress counts when Progress comes; their cost counts in the workspace's spend and Usage. The
  per-pupil budget caps it like any pupil, and nothing resets that until a later "Start again".
  Logged as `class_view_as_pupil`, the class id only.
- **The `pupils` switch** (#212): off (the default), the class page has no Pupil reader card, no
  Readings and no Class code card (`client/src/state/features.ts`). The prompt library stays. The
  Pupils who joined card stays while anyone is in the class.
- **Year group page:** the same without pupils; its classes listed with their number of pupils.
- **In the chat:** a chip in the message bar names the class ("◎ 7B · Second level"), as the
  make kit's Class profile card shows. Clicking it opens the class page.

## Pupils

Two ways in, and a teacher can use either or both:

1. **A note**, free text: "5 pupils with dyslexia, 2 autistic pupils who find group work hard,
   reading ages from P5 to S1."
2. **A table**, one row per pupil:

| No. | Pupil | What helps | Note | Adaptations (library) |
| --- | --- | --- | --- | --- |
| 1 | amber-otter | Amber overlay, sans serif 14 pt, reading pen | Dyslexic. Loses their place in long paragraphs. | Wider spacing (trialling) |
| 2 | quiet-kettle | Tasks in 3 steps at most, a timer | Sits near the front | |
| 3 | paper-comet | Key words with pictures | EAL (Polish), early acquisition. Grade D last term. | |

- **No Needs or Working at columns** (Sam, 24 Nov 2026, #243; questions 121 to 124). The teacher
  writes in the note anything the assistant should know, such as a need or a recent grade; what to
  write is up to them, and the table's hint says so. The `needs` and `working_at` columns stay in
  the database, hidden: rows written before keep their values, the API still accepts and returns
  both, and the class detail response still carries them to the browser. Nothing shows them, the
  table never sends them, and the model is not told them. The events and the export still count
  needs per class (`needs_counts`, format unchanged), so a table written from now on counts none.

- **Numbers** (12 Nov): each pupil also has a number in the class, from 1, given when they join
  it and never given twice there (a pupil who leaves keeps theirs; one moved in takes the next).
  The teacher cannot edit it. A class copied to next year numbers its new rows afresh, so the
  number, like the label, is no identity across years. The model sees "Pupil 3, amber-otter", so
  "pupil 3's version" works too. Migration 0025 numbered the pupils already there in table order.
  The number is not in the table's hash, so hashes logged before it still match.

- **Labels** are made up for the teacher, as branch names are: an adjective and a thing
  (amber-otter, quiet-kettle), unique in the class, from fixed word lists in code (no model call).
  The lists hold no first names, so a label can never be, or be taken for, a real pupil's name, and
  each is easy to say and tell apart ("make quiet-kettle's version"). A button deals a new one; the
  teacher can type their own code instead, and the box says "your own code, never a name or
  initials". The teacher keeps the key to who is who outside the tool.
- "What helps" and the note are free text.
- **Moving a pupil** to another class keeps the row (`class_id` changes; logged `pupil_move`).
  Leaving archives it. Paste from a spreadsheet adds rows.
- **What the model sees:** the note and the table, as data about the class, never as instructions.
  The table goes in as rows, so "quiet-kettle's version" works: each row gives What helps, Note
  and Chosen adaptations, or "Nothing noted." for a pupil with none (never the hidden needs or
  working_at). A model not set for zero data retention gets only the number of pupils. A
  year-group chat gets each class's note and its number of pupils, not the per-pupil rows (Sam,
  12 Nov; counts of needs went with #243).

### The data question: option B (Sam, 12 Nov; the ethics contacts check it before it ships)

This is the part to settle first. Needs such as dyslexia or ADHD are health data, a special
category under UK GDPR. A label like "Pupil 1" is not anonymous if the teacher can look up who it
is: it is pseudonymous personal data, and the school is its controller. It also sits awkwardly with
the note under every chat box: "Don't enter personal data" (PLAN.md decision, 10 Nov).

Options, from least to most data:

| Option | What is kept | Cost |
| --- | --- | --- |
| A. Notes only | The class note (counts and needs), no table | Weakest per-pupil differentiation |
| B. Table, not kept in research data | The table is stored for the teacher, sent to the model, and in the export only as counts and a hash (as P.5 does for pupils' work) | Analysis cannot see exactly what the model was told |
| C. Table, kept in full | As B, but the export has the rows | Simplest; most to justify to ethics |

**Sam chose B.** So:

- The rows are stored for the teacher and sent to the model, and nowhere else in full.
- Our logs: the events and the gateway log write `[pupil table: <class id>, <n> rows, <hash>]` in
  place of the rows at the time, as P.5 does for pupils' work, so nothing is cleaned up later.
  The export has counts of each need per class and the hash, so analysis can tell when the table
  changed and what kind of needs it held, but not the rows. Since #243 the table no longer writes
  needs, so new tables count none; what a teacher puts in a note is not counted.
- The class notes are free text and could hold anything, but they are kept like a project's
  instructions (the teacher's content); the note's box says not to name pupils.
- Models: the table goes only to models on the `zero_retention` list, as P.5 plans; the picker
  shows the others as unavailable in a class chat with a table, with the reason.
- The What is stored card (make kit) on the class page says plainly what is kept, where and for
  how long. Wording checked with the same contacts as P.5 before it ships.

The study's own register is fictional, so the study itself needs none of this.

## Curriculum

**Now: experiences and outcomes.** The `education-scotland-eo` library collection already has every
E&O, one per line with its code (`MNU 2-03a: I can …`). The Curriculum card offers a picker over it:
curriculum area, then the class's level (filled from its stage), then tick outcomes or search by
words or code. Each pick stores the code, its text as picked and the collection version, so a later
change to the library does not silently change the class.

**Next: Know, Do, Understand.** The refreshed curriculum from the Curriculum Improvement Cycle
replaces E&Os and benchmarks with Know, Do and Understand statements for each curriculum area.
Education Scotland released first drafts this month; the final versions are due in January 2027 and
the curriculum is introduced from August 2028. So the class stores curriculum items generically:

```
class_curriculum (id, owner_kind, owner_id, framework, code, kind, text, source_version, status, created_at, removed_at)
  framework: 'cfe-eo' | 'cfe-kdu'
  kind:      'eo' | 'know' | 'do' | 'understand'
  status:    'planned' | 'now' | 'done'
```

`status` is the make kit's Already covered card: done, now and next. A KDU collection is added to
the library when the statements are final, and the picker gains a framework choice; nothing in the
class tables changes. The model gets the "now" items in full and the done ones as codes.

**Built (12 Nov).** As above, with `class_curriculum` in migration 0023 plus `updated_at`, for
classes only (`owner_kind` is always `class` so far). The picker is a search box over the E&O
collection at the class's level (from its stage, else its year group's name), with an area and a
level to change, and "Add as" now, next or done; a code the class has is shown as added. The
sidebar's **Curriculum** section shows what the class in view is on now (the class whose page or
chat is open, else the first starred class this year). A click on an item opens the Curriculum
screen on that outcome; with nothing on now, the section offers to pick, which opens the class's
page.

**Curriculum screen (built 12 Nov, `0e5cc62`).** Built as a screen, not left as a proposal: the
sidebar's Curriculum heading opens a Curriculum screen for the class in view
(`client/src/screens/curriculum/`), with the areas and organisers down the side, the outcomes at the
class's level beside them, a search, the benchmarks on each, and the class's own items marked and
listed at the top. Each outcome has an Ideas button for the pedagogy aligned to it. Picking
outcomes stays on the class's page.

## Pedagogy (12 Nov 2026, first slice)

The pedagogy library (`library/pedagogy-sample/HANDOFF.md`) is what a class's needs and
curriculum are matched to. It is served by the library server and reached over HTTP, like the
E&Os (`docs/plugins.md`, "Pedagogy collections").

- **Matching curriculum.** A `curriculum_ref` entry is named after its code (`LIT 2-16a` is
  `cur-CUR-lit-2-16a`), and principles, activities and subject pedagogies name the ones they
  align to. So a class's "now" items find their pedagogy by structure, not by search.
- **Matching needs.** Needs are barriers, not diagnoses. A pupil row keeps its free-text note and
  what helps, and can carry **library adaptations**, each with a status (confirmed, trialling,
  stopped) and the pupil's own settings (cream background, 14pt), which win for that pupil. The
  picker offers first the adaptations the pupil's note hints at (`needHints` over the note since
  #243: "Dyslexic…" hints dyslexia; not over What helps, where "Visual timetable" would hint
  visual impairment; dyslexia, autism, ADHD, EAL…), says that is a hint, not a rule, and keeps every other one on offer. An adaptation
  that changes the learning goal (a modification) needs a second click that says so.
- **What the model gets** (class and year group chats): after the class message, a pedagogy
  message with the rules (cite claim ids; needs as barriers; modifications only where the
  teacher chose them; apply cautions; all draft), the format rules, the cautions for the class,
  the adaptations chosen for its pupils, its curriculum now and what aligns to it, what to steer
  away from, and a map of the rest, read with `pedagogy_read` or found with `pedagogy_find`. Which
  pupil has which adaptation is in the pupil table, so option B covers it.
- **Citations.** A reply cites claims as `[[clm-…]]`; before the turn commits, any claim not
  retrieved in the turn is taken out, and the chat shows each as an "i".

### Sam's answers (12 Nov, evening)

1. **The gateway log keeps everything for now**, the pupil rows and adaptations included: this
   is a pilot, and the data is kept on secure university servers. It may change after advice
   from a lawyer and the university's ethics contacts. **To switch back** to option B's
   shape-only log, set `"pupil_rows_in_gateway_log": "shape"` in `config/app.config.json` (the
   code default). Nothing else changes: events and the export keep only the table's shape either
   way, and turns logged meanwhile keep the rows (remove them from `gateway_calls` if needed).
2. **The study:** study workspaces get class data and the pedagogy library. Nothing turns them
   off; grounding needs the chat to be for a class (open question below).
3. **Draft content:** fine to show; it is a research project for now. Licences are worked out
   later; a source not yet confirmed reads "(licence unconfirmed)".
4. **The sidebar's Curriculum:** Sam to look at it locally first.

### Study workspaces (built 12 Nov, Sam's choice)

A workspace made on `/admin` with "Start with the demo class and a demo chat" (on by default)
starts with P7A, adaptations chosen for tidy-puffin, steady-crayon, mellow-thimble, calm-lantern
and bouncy-compass from their rows, its curriculum (LIT 2-16a now, ENG 2-19a next, LIT 2-14a
done), and a chat for the class with three turns written in advance (`server/src/study/`): a plan
from the curriculum and its benchmarks citing the pedagogy library, a reading task, and
tidy-puffin's version with a Spyglass flag. The turns' ids start `t_demo_` and `study_seed` names
them (Sam confirmed the event, 12 Nov). It opens on the demo chat, being the newest. The study's
tasks are given verbally, and teachers make their own projects and chats for them: no task content
lives in the product (Sam, 13 Nov 2026).

### The structured curriculum (built 12 Nov)

`library/collections/cfe-curriculum`: every outcome by area, organiser, sub-organiser, level and
stages, and the benchmarks for Second (P7) and Third (S1) level, each tied to the codes of its row
(library/README.md). The picker browses it by area and organiser, with each outcome's benchmarks;
a class chat gets the benchmarks for what the class is on now. Pedagogy entries still link to
outcomes by their code.

## What the model gets

As `projectMessage` does (`server/src/gateway/context-messages.ts`), a **class message** after the
system prompt and before the history, so the system prompt and its hash stay the same for everyone
and the message stays cached until the class changes:

```
## This class
This chat is for the teacher's class "7B" (Primary 7, Second level; English and literacy),
in year group "P7".
### About the class            (the class note, then the year group's note)
### Pupils and their needs     (the table; option B or C above)
### Supports available         (what is ticked)
### Curriculum                 (now: in full; done: codes)
```

Then the files catalogue and skills, as for a project, from both the class and its year group. The
rule "a chat sees only its own docs" holds: a class chat does not see other chats' documents.

## Readings (23 Nov 2026, #187)

A class's page has a "Readings" section after Chats. The teacher sets one of the workspace's docs
(not deleted) as an article for the whole class, ticks which of the prompt library's prompts it
allows (all to start, at least one) and may give it its own follow-up limit (0 to 10; empty is
the same as the class). The server keeps a frozen copy of the doc as it was then: its live blocks
only, without suggestions, pictures as their asset ids. Editing the doc later does not change the
copy; setting the doc again for the class replaces the reading with a fresh copy. The prompts are
the library's, by id, so a prompt edited later is used as edited. Ticks and the limit can be
changed, and a reading removed (its row stays). An archived class takes no new readings, and
readings are not copied to next year. Pupils see readings later (R1); the copy is what R2 will send
to the model. `server/src/readings/`, `client/src/screens/classes/readings/`.

## Logging and export

Events, each with the full text as projects do, except pupil rows (option B: a hash and counts):
`year_group_create`, `class_create`, `class_update`, `class_archive`, `class_open`, `pupil_add`,
`pupil_update`, `pupil_move`, `pupil_archive`, `curriculum_pick`, `curriculum_status`. `chat_prompt`
gains `class_id` and `year_group_id`. The bundle gains `classes.json` and `year_groups.json`.
These change the research data format, which is Sam's decision (`ARCHITECTURE.md`); they add
files and optional fields only, so earlier data reads as before.

## Order of work (points, in PLAN.md's sense)

| Step | What | Points |
| --- | --- | --- |
| C.0 | Data model and routes: year groups, classes, `threads.class_id` and `year_group_id`, events, export | 3 |
| C.1 | Classes screen, sidebar section, class and year group pages with the note and files (after splitting `ProjectScreens.tsx`) | 8 |
| C.2 | Chats in a class or year group: the chip, the class message, evals (the note and needs used; a year chat does not see pupil rows) | 5 |
| C.3 | Pupils and needs table with made-up labels, paste from a spreadsheet, moving pupils, option B logging, the zero-retention check | 10 |
| C.4 | Curriculum card: E&O picker from the library, done, now and next | done (classes; year groups later) |
| C.5 | Skills: the workspace's skills list and importing into projects, year groups and classes (T.1, rescoped) | with T.1 |
| C.6 | New school year: copy a class into the next (P6A in P6 becomes P7A in P7, both editable), with its pupils as new rows; earlier years drop out of the list by themselves | done |
| Later | KDU statements once final; a school level shared between teachers (needs accounts) | |

## Decisions (Sam, 12 Nov 2026)

1. Pupil data: **option B**. The table is the teacher's and the model's; the research data keeps
   counts and a hash.
2. The workspace is one teacher for now; a school level comes with accounts.
3. A year-group chat sees its classes' notes (and their numbers of pupils), not pupil rows.
4. Projects and classes both stay; nothing to move.
5. Skills are written once at the top level and imported into projects, year groups and classes.
   Pupil labels are made-up two-word names, as branch names are.

6. Classes change every year: a school and a school year on every year group and class, a star
   for the teacher's own classes (per teacher), and a sortable list for many classes.
7. A school's name stays with the teacher: events and the export have its id only.
8. Migration 0022 was replaced, not added to, as it had never run outside the branch.
9. Copying a class into next year brings its pupils, as new rows (no identity across years): label,
   what helps and note; the hidden needs and working_at stay with the old rows (#243, question 134).
10. The stored model calls keep the pupil rows. Sam, 13 Nov 2026 (issue #16): "we don't know what
    behaviour we want yet in terms of removal. For now we just know we want to keep the data, and
    might need to remove it later." A removal is built but **switched off**: no route serves it, no
    control shows it, and `scripts/scrub-pupil-rows.mjs` stops at once. What follows is what it
    would do if switched on, for one workspace or all, a dry run unless `--apply`. In
    each class message in a stored call, it removes the pupil table `classMessage` sent (heading,
    the line before the rows and the rows, in the current and the older row format), except in two
    cases a teacher would have to construct on purpose (`docs/HANDOVER.md` 4a16, "What
    it still cannot see"). It leaves a placeholder with the row count and the sha256 of what was
    removed. When a pupil's note holds our own headings and the table's end is in doubt, it removes
    through to the class message's closing line (the class's curriculum section with it) and counts
    the call `unsure`. The one exception: a class message with no closing line is left alone, rows
    and all, and counted `unsure` too (a real run still goes ahead).
    If a row line would still be left in a class message whose table was removed (`leftover`), a
    real run is refused and names the workspaces. A real run also needs an export of the workspace
    first, and is logged as `pupil_rows_scrub` (counts only). It cannot find anything a teacher or
    the assistant wrote about a pupil in their own words: in a message, a reply or a document, a
    pupil named by label or described stays as it was. Nor does it touch the export already taken,
    the events, or the provider's own copy.

Still open: the wording of the What is stored card and the zero-retention list, with the ethics
and data-protection contacts.
