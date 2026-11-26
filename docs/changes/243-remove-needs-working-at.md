# #243: Needs and Working at removed from the pupil table, the pupil card, the classes list and the assistant's class message

Sam, 24 Nov 2026: "Remove 'needs' and 'Working at' from the student table", with answers 121 to
124. Built on the defaults of questions 132 to 134: the evals are left alone, the demo class
note keeps its first sentence, and copy to next year drops the hidden values.

## What was built, and where

- **Pupil table** (`client/src/screens/classes/PupilTable.tsx`): columns No., Pupil, What helps,
  Note, Adaptations (library), actions. Region and heading "Pupils". The hint loses the line on
  separating needs with commas and gains one: write in the note anything the assistant should
  know, such as a need or a recent grade. The `common-needs` datalist and the Cell's `list` prop
  went. `pupilFields.ts`: `PupilColumn` is `'label' | 'helps' | 'note'`; `parseNeeds` went.
- **Adaptation picker hints** (`AdaptationsCell`, `AdaptationPicker`, `adaptationChoice.ts`): the
  prop `needs` is now `hintsFrom`, and the table passes the pupil's note (`needHints` over it).
  Not What helps ("Visual timetable" would hint visual impairment).
- **Pupil card on a mention** (`components/mentions/PupilMention.tsx`): What helps, Note and
  Adaptations only.
- **Classes list** (`ClassesTable.tsx`): no needs line; the intro says "the class's stage and your
  notes on the class and on each pupil". `YearGroupPage.tsx`: "N pupils". `needsLine` went from
  `styles.ts`. `state/classList.ts` search no longer matches need names. `useClasses.ts` sets
  `needs_counts: {}` rather than copying the old value.
- **Server**: `classes/service.ts` sends `needs_counts: {}` in the classes list (the field stays in
  `ClassesList` so open tabs still parse; a later clean-up can remove it).
- **The assistant** (`gateway/class-message.ts`): a row is `What helps: …`, `Note: …`,
  `Chosen adaptations: …`, or `Nothing noted.`. The intro ends "Pupils with nothing noted are
  there so the class's size and range are clear." Without zero retention: "The teacher keeps a
  table of N pupils; the rows are not given here." A year group chat: "N pupils" per class. The
  heading, intro start, row prefix and closing line are unchanged, so `pupil-scrub.ts` finds old
  and new tables (a test pins it). `gateway/mock-class.ts` names the first pupil whose row is not
  `Nothing noted.` (quiet-comet in the demo).
- **Copy to next year** (`classes/copy.ts`): new rows take label, helps and note only; the old
  class's rows keep their hidden values.
- **Demo class** (`classes/demo.ts`): no needs or working_at; `g()` went; every `helps` is as it
  was. Notes on tidy-puffin, snowy-kite and swift-otter (the brief's wording); mellow-thimble's old
  note went. The class note keeps its first sentence and drops "Grades are the most recent, A to E."
- **Docs**: `docs/classes.md` pupil sections.

## Decisions the brief did not cover

- The classes list intro reads "your notes on the class and on each pupil": the brief's "your
  notes on each pupil" in place of "each pupil's needs" left "your notes and your notes on each
  pupil".
- `gateway/__snapshots__/features-turn.test.ts.snap` was updated: it holds the demo class message
  word for word, and only that part changed.
- e2e: the region is found with `exact: true`, as "Pupils" alone also matches "Pupils who joined".
- The table's new hint is a second line under the first, not folded into it.

## What is left

- Hidden `needs` and `working_at` still reach the browser in the class detail response, and the
  events and export still count needs (format unchanged, as agreed). A later clean-up can drop
  `ClassesList.needs_counts`.
- The pedagogy eval "treats three pupils with dyslexia differently" (`packages/evals`) loses its
  premise, and `docs/study-design.md` Appendix C Task 2 relies on three dyslexia profiles
  (questions 132 and 133). Not changed here. The class message changed and was not evaluated.
- `config/system_prompt_agent.md` still says "its pupils' needs come in a message": still true of
  notes, and left so the prompt hash is unchanged.
