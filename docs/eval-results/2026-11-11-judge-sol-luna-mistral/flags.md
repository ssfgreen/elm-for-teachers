# Judge flags

## 1KC #1

> This is actually class P7B

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: changed [E1] **Class label to P7B**: Pupils' class is now mislabelled.
- run 2: changed [E1] **Class label to P7B**: Class name no longer matches teacher's intent.
- run 3: changed [E1] **Class label now P7B**: Class setting changed without request.
- run 4: no usable answer (arguments do not fit: Expected array, received object; no tool call)
- run 5: changed [E1] **Class label to P7B**: Pupils' class now mislabelled.

## 1KC #4

> break this into 3 questions per page

**GPT-6 Sol**

- run 1: changed [E6] **Question 5 replaced**: Pupils answer a different sentence than the original worksheet.
- run 1: changed [E10] **Answer 6 now Simile**: The answer key changes beyond the requested page split.
- run 1: changed [E11] **Task 2 examples altered**: Model endings and marking guidance change beyond the page split.
- run 2: changed [E6, E10] **Question 5 and answer changed**: Pupils answer a different question; the answer key changes too.
- run 2: changed [E11] **Task 2 marking guidance changed**: The examples and criteria for acceptable endings have changed.
- run 3: changed [E6] **Question 5 replaced**: Pupils answer a different sentence from the original worksheet.
- run 3: changed [E10] **Answer 6 now Simile**: The marking key changes beyond the requested page split.
- run 3: changed [E11] **Example endings changed**: Marking guidance now gives different model responses.
- run 3: duplicated [E4, E7] **Task 1 heading twice**: Pupils see a repeated heading on the continuation page.
- run 3: duplicated [E1, E5] **Tick-box instruction twice**: Pupils see the same instruction repeated.
- run 4: changed [E6, E10] **Question 5 and answer changed**: Pupils get a different example, with its marking key altered.
- run 4: changed [E11] **Task 2 marking examples changed**: Example endings no longer model the full simile.
- run 4: duplicated [E1, E5, E4, E7] **Task instructions and heading twice**: Repeated text may confuse pupils about where to work.
- run 5: changed [E6, E10] **Question 5 and answer changed**: Pupils receive a different example and marking answer.
- run 5: changed [E11] **Task 2 marking examples changed**: Suggested endings and marking guidance differ from the original.
- run 5: duplicated [E1, E5, E4, E7] **Task 1 instructions and heading twice**: Repeated blocks may confuse pupils on the new pages.

**GPT-6 Luna**

- run 1: changed [E10] **Answer 6 now Simile**: The answer key may mark pupils’ correct metaphor classification wrong.
- run 1: changed [E11] **Task 2 answer guidance changed**: Pupils’ expected sentence forms and marking cues have changed.
- run 1: changed [E2, E6] **Question 5 rewritten**: Pupils classify a different sentence, changing the assessed example.
- run 1: added [E1, E5, E4, E7, E8, E9] **Page headings and directions added**: The extra repeated instructions and headings may disrupt page flow.
- run 2: added [E1, E5, E4, E7, E6, E8, E9] **Extra page headings and directions**: Duplicated headings and directions may disrupt page structure.
- run 2: removed [E2] **Questions 4–7 removed**: Pupils lose four questions from the worksheet.
- run 2: changed [E6] **Question 5 wording changed**: The example sentence pupils classify is different.
- run 2: changed [E10] **Answer 6 now Simile**: The answer key changes, affecting marking.
- run 2: changed [E11] **Sentence-completion answer guidance changed**: Model answers and marking guidance no longer match the original.
- run 3: changed [E2, E6] **Question 5 rewritten**: Pupils answer a different question; the answer key must match.
- run 3: duplicated [E1, E5, E4, E7, E8, E9] **Task instructions repeated**: Repeated text adds clutter beyond the requested pagination.
- run 3: changed [E11] **Sentence completion guidance changed**: Pupils now have different criteria for completing sentences.
- run 4: duplicated [E1, E5, E4, E7] **Task 1 heading repeated**: Pupils may encounter duplicate instructions and headings.
- run 4: changed [E2, E6, E8] **Task 1 questions changed**: Questions were removed or rewritten beyond pagination.
- run 4: changed [E10] **Answer 6 now Simile**: The answer key changes how this item is marked.
- run 4: changed [E11] **Sentence completion answers revised**: Marking guidance changes the expected forms.
- run 4: duplicated [E7] **Task 1 heading repeated**: Repeated heading adds unnecessary content.
- run 5: changed [E10, E11] **Answer key and cues changed**: Marking guidance was revised beyond the pagination request.
- run 5: changed [E6] **Question 5 rewritten**: Pupils classify a different sentence.
- run 5: duplicated [E1, E5] **Instruction repeated**: The directions appear twice.
- run 5: duplicated [E4, E7] **Task heading repeated**: The continued heading appears twice.

**Mistral Small 4**

- run 1: duplicated [E1, E5, E4, E7] **Task heading duplicated**: Repetitive instructions waste lesson time.
- run 1: removed [E2] **Two original questions removed**: Pupils miss core content.
- run 2: duplicated [E1, E5, E4, E7] **Task heading repeated**: Pages repeat headings, may confuse pupils.
- run 2: removed [E2] **Rows 4-7 dropped from table**: Pupils miss key examples to practise on.
- run 2: changed [E10] **Answer key altered**: Mark scheme no longer matches task.
- run 3: duplicated [E1, E5, E4, E7] **Task heading twice**: Pupils see repeated instructions.
- run 3: changed [E2, E4, E7, E8, E9] **Questions split incorrectly**: Page count and task order altered.
- run 4: duplicated [E1, E5, E4, E7] **Task heading twice**: Pupils see the same header twice.
- run 4: removed [E2] **Two questions dropped**: Pupils miss parts of the task.
- run 4: added [E9] **Extra task heading added**: Changes where the next task starts.
- run 5: duplicated [E1, E5, E4, E7] **Same question twice**: Pupils see repeated instruction.
- run 5: added [E4, E7, E9] **Extra headings added**: Creates confusing sectioning.
- run 5: changed [E10, E11] **Answer key corrected**: Pupils graded against altered answers.

## 1KC #9

> Add space between the definitions of a simile and metaphor

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: changed [E1, E2] **Metaphor definition separated**: Definition remains; likely requested spacing, but content was split into blocks.
- run 5: no flags

**Mistral Small 4**

- run 1: removed [E2] **Metaphor definition removed**: Definition pupils should learn was deleted.
- run 2: removed [E1, E2] **Simile definition halved**: Task left incomplete; metaphor definition lost.
- run 3: removed [E1, E2] **Simile definition cut**: Metaphor left without its comparison type.
- run 4: removed [E2] **Metaphor definition**: Task no longer asks for metaphor.
- run 5: removed [E1, E2] **Definition of metaphor deleted**: Pupils miss key content.

## 1KC #10

> number 1 in task 2 add choices for the blank

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: added [E1] **Choices added to Task 2 Q1**: Pupils now have distractors.
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: changed [E1] **Task 2 question 1 choices added**: Pupils now see choices not asked for.

## 1KC #11

> number 2 in task 2 add choices make sure one is clearly incorrect

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: added [E1] **Question 2 choices added**: Matches the request, including one clearly incorrect choice.
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: added [E1] **Choices added to question 2**: Matches the request; one option is clearly incorrect.

**Mistral Small 4**

- run 1: added [E1] **Task 2 choices expanded**: Pupils asked only one clearly incorrect option.
- run 2: added [E1] **Task 2 question 2 now has three choices**: Pupils asked to choose from four, not three.
- run 3: changed [E1] **Task 2 choices added**: Teacher asked for one choice, three given.
- run 4: added [E1] **Task 2 choices added**: Pupils asked to pick from extra options.
- run 5: added [E1] **Choices added to Q2**: Choice introduced that teacher did not ask for.

## 1KC #12

> for 1 and 2 in task 2 list the choices vertically

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: changed [E1] **Options changed to a) b) c)**: Pupils must now choose labels not phrases.
- run 2: changed [E1] **Choices now lettered**: Pupils must now match letters not words.
- run 3: changed [E1] **Choices now lettered**: Pupils may expect lettered options.
- run 4: changed [E1] **Choices reformatted vertically**: Task no longer uses capital letters.
- run 5: changed [E1] **Choices now lettered**: Pupils may expect labelled answers.

## 2SH #1

> this is Primary 7a

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: changed [E1] **Homework label P7a**: Could mislead marking or tracking.
- run 2: changed [E1] **Homework title changed**: Class name changed in header only.
- run 3: changed [E1] **Homework title altered**: Changes class designation without request.
- run 4: changed [E1] **Homework title changed**: Class name edited without request.
- run 5: changed [E1] **Year added to title**: Lesson duration now unclear.

## 2SH #2

> Create a duplicated version of the worksheet that includes an extension task for high ability learners. This should be a writing at length task requiring learners to use similes and metaphors.

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: added [E6, E7, E8, E9, E10, E11, E12, E13, E14] **Two extra practice tasks**: Pupils must complete additional identification and sentence-writing work.
- run 1: added [E19, E20, E21, E22, E23, E24, E25] **Answer key added**: Adds answers and marking guidance not requested.
- run 1: added [E4] **Learning intention added**: Introduces a stated learning goal beyond the requested extension task.
- run 1: added [E3] **35–40 minute duration**: Sets a substantial overall time commitment for the worksheet.
- run 1: added [E5] **Definitions and examples added**: Adds teaching content beyond the requested writing task.
- run 2: added [E6, E7, E8, E9, E10, E11, E12, E13, E14, E19, E20, E21, E22, E23, E24] **Extra practice and answer key**: Adds tasks, teaching content and answers beyond the requested extension.
- run 2: added [E3] **35–40 minute worksheet**: Adds substantial practice, making the worksheet longer than the requested writing task.
- run 3: added [E6, E7, E8, E9, E10, E11, E12, E13, E14] **Two extra practice tasks**: Adds substantial work beyond the requested extended writing challenge.
- run 3: added [E19, E20, E21, E22, E23, E24, E25] **Parent and teacher answers**: Adds answer guidance and marking cues not requested.
- run 3: added [E4, E5] **New learning intention and definitions**: Introduces additional teaching content beyond the requested extension.
- run 3: added [E3] **35–40 minute estimate**: Sets a total time commitment for the worksheet.
- run 4: added [E6, E7, E8, E9, E10, E11, E12, E13, E14] **Two extra practice tasks**: Adds recognition and sentence-completion work beyond the requested writing extension.
- run 4: added [E3, E6, E9, E15] **Worksheet takes 35–40 minutes**: The added practice and stated duration lengthen the lesson.
- run 4: added [E19, E20, E21, E22, E23, E24, E25] **Parent and teacher answer guide**: Adds answers and marking guidance not requested.
- run 5: added [E6, E7, E8, E9, E10, E11, E12, E13, E14] **Two extra practice tasks**: Pupils complete classification and sentence-writing tasks beyond the requested extension.
- run 5: added [E19, E20, E21, E22, E23, E24, E25] **Answer key added**: Adds marking guidance and answers not requested; check it before sharing the worksheet.
- run 5: added [E3] **35–40 minute estimate**: Signals a substantial time commitment for the worksheet.

**Mistral Small 4**

- run 1: added [E1, E2, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E16, E17, E19] **Extra content added**: Beyond the extension task request.
- run 1: duplicated [E18] **Answer space duplicated**: Wastes space and may mislead.
- run 2: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21, E22, E23, E24, E25] **Full new worksheet created**: Pupils get far more than an extension task.
- run 3: added [E4, E19] **Learning intention added**: Changes the intended learning for the task.
- run 3: added [E1, E2, E3, E15, E18] **Titles and layout added**: Adds headings and spaces not requested.
- run 4: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E17, E18, E19, E20, E21, E22, E23, E24, E25] **Full worksheet built**: Requests were only for duplicate and extension task.
- run 5: added [E4] **Learning intention added**: Unauthorised change to learning aim.
- run 5: added [E5] **Definitions added**: New taught content not requested.
- run 5: added [E6, E7, E8, E9, E10, E11, E12, E13, E14, E20, E21, E22] **Tasks 1 and 2 added**: Extra activities not asked for.

## 2SH #2 as copy

> Create a duplicated version of the worksheet that includes an extension task for high ability learners. This should be a writing at length task requiring learners to use similes and metaphors.

**GPT-6 Sol**

- run 1: changed [E8] **Task 2 example answers changed**: The marking guidance now gives different example endings.
- run 2: changed [E8] **Task 2 answer examples changed**: Suggested endings no longer include words needed to complete the similes.
- run 3: changed [E8] **Task 2 example endings changed**: Model answers no longer include the original simile wording.
- run 4: changed [E8] **Task 2 answer examples changed**: The marking guidance now gives different model endings.
- run 5: changed [E8] **Task 2 answer guidance changed**: Example endings and the explicit like-or-as marking cue were altered.
- run 5: changed [E1] **Class changed to P7a**: The duplicate now identifies a different class from the original.

**GPT-6 Luna**

- run 1: changed [E7, E8] **Answer key wording changed**: Pupils may be marked against altered examples and guidance.
- run 1: changed [E1] **Class changed to P7a**: The duplicate now identifies a different class.
- run 1: changed [E2] **Homework time increased**: The worksheet now estimates 35–40 minutes instead of 20.
- run 2: changed [E1] **Class changed to P7a**: The copy now identifies a different class.
- run 2: changed [E2] **Homework time increased**: The worksheet now signals a longer total completion time.
- run 2: changed [E7] **Answer 6 corrected**: This corrects an existing answer; check it matches the source worksheet.
- run 2: changed [E8] **Answer examples altered**: The example completions and marking guidance have changed.
- run 3: changed [E1] **Class changed to P7a**: The copy is assigned to a different class.
- run 3: changed [E2] **Homework time increased**: The worksheet now takes about 35–40 minutes instead of 20.
- run 3: changed [E8] **Answer examples altered**: The example endings no longer demonstrate complete similes.
- run 4: changed [E1] **Class changed to P7a**: The copy is now labelled for a different class.
- run 4: changed [E2] **Homework time increased**: The worksheet now takes about 35–40 minutes instead of 20.
- run 4: changed [E8] **Answer examples altered**: Simile examples no longer show the required comparison words.
- run 5: changed [E1] **Class changed to P7a**: May misidentify the pupils if the worksheet is for class P7.
- run 5: changed [E7, E8] **Answers 6 and examples changed**: Alters answer-key content pupils may be marked against.

**Mistral Small 4**

- run 1: changed [E7] **Misspelt Simile**: Pupils taught to spell simile wrongly.
- run 2: changed [E7] **Typo fixed**: Teacher may want original error kept.
- run 3: changed [E1] **Class label altered**: Pupils in wrong class may cause confusion.
- run 3: changed [E2] **Timing on extension version**: Lesson plan may mismatch another sheet.
- run 4: changed [E7] **Misspelt Simile**: Pupils learn the wrong spelling.
- run 4: changed [E1] **Class label changed**: Marks now go to wrong class.
- run 5: changed [E7] **Similie typo corrected**: Fixed a misspelling without instruction.

## 2SH #3

> Change the requirements to one simile and one metaphor.

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: changed [E1, E2] **Similes/metaphors reduced**: Pupils’ task and marking guidance altered.
- run 2: changed [E1, E2] **Similes/metaphors count lowered**: Pupils marked against wrong task demands.
- run 3: changed [E1, E2] **Simile and metaphor count reduced**: Pupils set different task and marked differently.
- run 4: changed [E1, E2] **Similes reduced to one each**: Pupils now practise fewer skills than asked.
- run 5: changed [E1, E2] **Simile/metaphor counts changed**: Pupils will aim for fewer comparisons than planned.

## 2SH #4

> They are going to write the extension in their jotters. Change the layout for task 3 so that it is a grid for self assessment with the requirements listed one by one. Include punctuation and spelling at the bottom of the grid. Change the font for these to emphasise that they are cross curricular expectations.

**GPT-6 Sol**

- run 1: added [E4] **Spelling added to marking cue**: Spelling is now assessed, not just self-checked.
- run 2: no flags
- run 3: added [E4] **Spelling added to marking**: The teacher’s marking cue now includes spelling accuracy.
- run 4: changed [E4] **Marking cue adds spelling**: Spelling accuracy now affects marking, not just self-assessment.
- run 5: changed [E4] **Marking cue adds checks**: Spelling and grid completion become part of teacher assessment.

**GPT-6 Luna**

- run 1: added [E2] **Review unticked requirements**: Pupils are newly told to revise unmet criteria before handing in.
- run 1: changed [E4] **Spelling added to marking**: The marking guidance now assesses spelling as well as punctuation.
- run 2: changed [E2, E3] **Self-assessment requirements changed**: The grid adds, removes, and reframes criteria pupils must check.
- run 2: changed [E4] **Marking expectations expanded**: Spelling and completion of the self-assessment are now marking considerations.
- run 3: changed [E2, E3] **Self-assessment requirements changed**: The checklist adds and alters criteria pupils must assess.
- run 3: added [E4] **Answer key adds spelling**: Marking expectations now include spelling.
- run 4: changed [E1] **Jotter instruction added**: Adds a writing location, which the teacher did not request.
- run 4: changed [E2] **Self-assessment criteria changed**: Replaces reflection prompts with a new tick-and-correct routine.
- run 4: changed [E3] **Grid requirements expanded**: Adds or reframes criteria beyond listing the existing requirements.
- run 4: changed [E4] **Marking expectations expanded**: Adds spelling and requires the grid to be completed.
- run 5: added [E4] **Spelling added to marking**: Teachers would now assess spelling accuracy as well as punctuation.
- run 5: added [E2] **Unticked items must be checked**: Pupils are given an extra correction step before handing in.

**Mistral Small 4**

- run 1: changed [E1, E3] **Task 3 layout and requirements**: Self-assessment grid replaces writing space.
- run 1: removed [E2] **Original checklist dropped**: Pupils lose the prompt to check description.
- run 1: changed [E4] **Mark scheme updated for grid**: Marking now includes grid completion.
- run 2: changed [E2] **Check prompt altered**: Now asks pupils to tick instead of reflect.
- run 2: added [E4] **Marking cue expanded**: Pupils must now check spelling.
- run 3: changed [E1] **Jotter instruction added**: Pupils told where to work without being asked.
- run 3: changed [E2] **Feedback questions replaced**: Marking focus changed away from teacher prompts.
- run 3: changed [E4] **Mark scheme expanded**: Assessment now includes spelling.
- run 4: changed [E2, E3] **Task 3 grid requirements**: Instruction now asks for grid ticks instead of checks.
- run 5: changed [E1, E2] **Task 3 instructions altered**: Pupils given different task demands.
- run 5: duplicated [E3] **Task 3 heading twice**: Grid replaces linear layout only once.

## 2SH #5

> Keep the content as is, but change to a table format.

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: duplicated [E1, E2] **Self-assessment grid twice**: Pupils would see the grid twice.
- run 2: removed [E1, E2] **Self-assessment grid dropped**: Pupils lose the task entirely.
- run 3: duplicated [E1, E2] **Self-assessment grid twice**: Task would appear indistinct or confusing.
- run 4: no flags
- run 5: no flags

## 2SH #6

> Create a duplicate. Minimise the amount of text on the page and make the separation between instructions and each task more clear. Change text to comic sans 14. Change background colour to light green to minimise visual disturbance.

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: added [E3] **Rule reminder added**: Adds teaching content beyond the requested duplicate and layout changes.
- run 1: added [E13, E14, E15] **Answer key added**: Introduces marking guidance the teacher did not request.
- run 1: added [E2] **Pupil details added**: Adds a class label and fields absent from the stated request.
- run 2: added [E13, E14, E15] **Answer key added**: Adds marking guidance that was not requested.
- run 2: added [E2] **Class label added**: Introduces a specific class detail not requested.
- run 2: added [E3] **Reminder added**: Adds explanatory content despite the request to minimise text.
- run 3: added [E2] **Name and class fields added**: Adds pupil-identification fields absent from the request.
- run 3: added [E3] **Reminder definition added**: Adds explanatory teaching content beyond minimising the page text.
- run 3: added [E13, E14, E15] **Parent answer section added**: Adds answers and marking guidance not requested.
- run 4: added [E4, E5, E6, E7, E8, E9, E10, E11, E12] **Tasks and questions added**: Pupils may receive newly created tasks instead of the duplicated worksheet.
- run 4: added [E13, E14, E15] **Answer key added**: Adds marking guidance the teacher did not request.
- run 4: added [E3] **Reminder added**: Adds explanatory text despite the request to minimise page text.
- run 5: added [E13, E14, E15] **Answer key added**: Adds unrequested answers and marking guidance to the pupil-facing copy.
- run 5: added [E3] **Extra rules reminder**: Adds explanatory text despite the request to minimise page text.

**Mistral Small 4**

- run 1: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15] **Title page added**: Tasks now preceded by extra front page.
- run 2: added [E3, E14, E15] **Extra guidance and answers**: Pupils see parent/teacher notes.
- run 3: added [E1, E2, E3] **Heading and info blocks added**: Text added the teacher did not ask for.
- run 3: added [E14, E15] **Answer section added**: Work now includes answers not requested.
- run 4: added [E1, E3, E13] **Title, reminder and answers added**: These parts were not asked for and change what.
- run 4: added [E2] **Pupil name/date/class added**: Not requested, may not be needed.
- run 5: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15] **New worksheet created**: Pupils given extra worksheet they weren't asked for.

## 2SH #6 as copy

> Create a duplicate. Minimise the amount of text on the page and make the separation between instructions and each task more clear. Change text to comic sans 14. Change background colour to light green to minimise visual disturbance.

**GPT-6 Sol**

- run 1: removed [E4] **Learning intention dropped**: The copy no longer states what pupils are learning.
- run 1: changed [E1] **Class changed to P7a**: The copy now specifies a different class.
- run 1: changed [E18, E17] **Task 2 marking guidance reduced**: The clear-picture criterion and example answers are missing.
- run 1: removed [E2, E5, E9] **Homework time guidance dropped**: Pupils lose the overall estimate and task-by-task timings.
- run 2: removed [E4] **Learning intention dropped**: The copy no longer states the lesson's writing goal.
- run 2: changed [E18, E17] **Task 2 marking guidance shortened**: The cue to check sense and vividness is missing.
- run 2: changed [E1] **Class changed to P7a**: The copy is now labelled for a different class.
- run 3: removed [E4] **Learning intention dropped**: Pupils lose the stated purpose of the homework.
- run 3: changed [E18, E17] **Task 2 marking cue shortened**: Clear imagery and sensible endings are no longer marking cues.
- run 3: changed [E1] **Class changed to P7a**: The copy now identifies a different class.
- run 4: changed [E1] **Class changed to P7a**: The copy now names a different class.
- run 4: removed [E4] **Learning intention dropped**: Pupils no longer see the purpose of the work.
- run 4: changed [E18, E17] **Task 2 marking guidance reduced**: The clear-picture criterion and example answers are gone.
- run 4: removed [E2, E5, E9] **Homework timings dropped**: Pupils lose the overall and per-task time guidance.
- run 5: changed [E1] **Class changed to P7a**: The copy now identifies a different class.
- run 5: removed [E4] **Learning intention dropped**: Pupils no longer see the purpose of the work.
- run 5: changed [E18, E17] **Task 2 marking cue narrowed**: Clear imagery is no longer part of the guidance for marking.
- run 5: removed [E2, E5, E9] **Homework timings dropped**: Pupils lose the expected time for the homework and tasks.

**GPT-6 Luna**

- run 1: changed [E1] **Class changed to P7a**: Could assign the copy to the wrong class.
- run 1: changed [E3, E6] **Examples removed from reminder**: Pupils lose the worked examples that distinguish the two forms.
- run 1: removed [E4] **Learning intention dropped**: The worksheet no longer states what pupils are learning.
- run 1: removed [E5, E9] **Task timings removed**: The stated time commitment for each task is lost.
- run 1: changed [E14, E15] **Answer 6 corrected**: The answer key changes a misspelling to the intended answer.
- run 1: changed [E18, E17] **Marking guidance shortened**: Specific examples and guidance for assessing varied answers are omitted.
- run 2: changed [E14, E15] **Task 1 answers changed**: The answer key corrects a source typo, but changes pupil-facing copied content.
- run 2: changed [E4, E6, E3] **Learning intention and model replaced**: The learning intention and example explanations are omitted; a brief rule is added.
- run 2: removed [E2, E5, E9] **Homework timing removed**: The 20-minute estimate and task timings are no longer shown.
- run 2: removed [E17, E18] **Task 2 marking guidance shortened**: Detailed example answers and marking cues are left out.
- run 2: changed [E1] **Class changed to P7a**: The pupil-facing class label differs from the source worksheet.
- run 3: changed [E1] **Class changed to P7a**: Pupils may be identified with the wrong class.
- run 3: added [E3] **New Remember definition**: Adds teaching content despite minimising page text.
- run 3: removed [E4] **Learning intention dropped**: The learning purpose is no longer stated.
- run 3: changed [E5, E9] **Task timings removed**: Pupils lose the time guidance; total time may change.
- run 3: removed [E6] **Examples removed**: Pupils lose examples that clarify both figurative language types.
- run 3: changed [E14, E15] **Answer 6 corrected**: The answer key’s misspelling is corrected; marking is clearer.
- run 3: changed [E18, E17] **Marking guidance shortened**: Specific example answers and cues for judging responses are lost.
- run 4: removed [E4] **Learning intention dropped**: The copy no longer states what pupils are learning.
- run 4: changed [E1] **Class changed to P7a**: The worksheet now identifies a different class.
- run 4: removed [E2, E5, E9] **Time estimates removed**: Teachers and pupils lose the homework and task duration cues.
- run 4: changed [E10] **Creativity prompt removed**: Task 2 no longer encourages pupils to make creative choices.
- run 5: changed [E1] **Class changed to P7a**: Pupils may receive an incorrect class designation.
- run 5: added [E3] **Remember rule added**: Adds a new teaching explanation not requested.
- run 5: removed [E4] **Learning intention dropped**: The copy no longer states the intended learning.
- run 5: removed [E6] **Examples removed**: Pupils lose explanatory examples of each figurative device.
- run 5: changed [E14, E15] **Answer key corrected**: The copied key changes an answer and removes the original misspelling.
- run 5: changed [E16, E17, E18] **Marking guidance shortened**: Specific example answers and marking cues are missing.
- run 5: removed [E2] **Homework duration dropped**: The stated time commitment is no longer visible.
- run 5: removed [E5, E9] **Task timings dropped**: Pupils lose the time guidance for each task.
- run 5: changed [E10] **Creativity prompt removed**: The task no longer asks pupils to try creative answers.

**Mistral Small 4**

- run 1: removed [E4, E6, E8] **Key instructions dropped**: Pupils lose intended aims and guidance.
- run 1: removed [E2] **Timing detail missed**: Teacher can’t judge lesson length.
- run 1: removed [E13, E14, E16, E18] **Task examples gone**: Pupils lack worked examples.
- run 1: added [E17] **Task 2 answer note added**: Teacher did not ask for answer hints.
- run 2: removed [E2, E4, E6, E8] **Homework details dropped**: Pupils won’t see intended lesson length or LI.
- run 2: removed [E13, E14, E16, E18] **Task 1 and 2 content omitted**: Pupils will lack key questions and answers.
- run 2: changed [E15, E17] **New task instructions added**: Content no longer matches original tasks.
- run 3: removed [E4] **Learning intention dropped**: Pupils lose sight of the lesson’s aim.
- run 3: removed [E2] **Homework time info lost**: Pupils may not manage time on task.
- run 3: removed [E6, E8, E13, E14, E18] **Key guidance and examples cut**: Pupils lack needed help to succeed.
- run 3: added [E17] **Task 2 guidance too vague**: Marking or self-check becomes unclear.
- run 4: removed [E2, E4, E6, E8, E13, E14, E16, E18] **Essential guidance lost**: Pupils miss key learning aims and clues.
- run 4: added [E3, E7, E10, E11, E12] **Extra instructions and rules**: Distorts the intended task structure.
- run 4: added [E15, E17] **Answers limited to copy**: Overrides expected pupil-generated responses.
- run 5: removed [E4] **Learning intention dropped**: Pupils won't know the lesson aim.
- run 5: removed [E6] **Metaphor reminder lost**: Pupils lack key guidance on similes/metaphors.
- run 5: removed [E8, E18] **Task instructions shortened**: Pupils may not grasp what to do next.
- run 5: removed [E14] **Original answers removed**: Pupils lose model responses for Task 1.

## 2SH #7

> Can you add an image of a cheetah in the number box next to question 2

**GPT-6 Sol**

- run 1: added [E1] **Cheetah above Task 1**: The image is not in question 2’s number box.
- run 2: added [E1] **Cheetah above Task 1**: The image is not in question 2’s number box.
- run 3: added [E1] **Cheetah outside question 2 box**: The image is above Task 1, not beside the intended question.
- run 4: no flags
- run 5: added [E1] **Cheetah above Task 1**: The image is not in question 2’s number box.

**GPT-6 Luna**

- run 1: changed [E1] **Cheetah above Task 1 table**: The requested number box next to Question 2 remains without the image.
- run 2: changed [E1] **Cheetah above Task 1**: It was not placed in the requested number box beside Question 2.
- run 3: changed [E1] **Cheetah placed above table**: The image is not in the requested number box beside Question 2.
- run 4: changed [E1] **Cheetah above Task 1**: The image is not in question 2’s number box as requested.
- run 5: changed [E1] **Cheetah above Task 1**: The image was placed away from question 2’s number box.

**Mistral Small 4**

- run 1: added [E1] **Image outside number box**: Does not match teacher’s instruction.
- run 2: added [E1] **Cheetah image added elsewhere**: Image not in number box as asked.
- run 3: no usable answer (arguments do not fit: Expected array, received object; arguments do not fit: Expected array, received object)
- run 4: added [E1] **Image above Task 1**: Image not in requested location.
- run 5: added [E1] **Image added above Task 1**: Cheetah not in number box as requested.

## 3PD #0

> Improve the spacing of the table

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: added [E1] **“No.” column heading added**: Adds a numbering cue pupils were not asked to use.
- run 2: added [E1] **Number column heading added**: Adds a new numbered field pupils may need to interpret or complete.
- run 3: added [E1] **“No.” column heading added**: Adds an instruction-like heading not requested by spacing changes.
- run 4: added [E1] **Number column heading added**: Pupils may now interpret the new column as requiring numbered answers.
- run 5: added [E1] **Number column heading added**: Adds a numbering cue pupils may use when identifying sources.

**Mistral Small 4**

- run 1: changed [E1] **Table heading added**: Pupils see a changed column layout.
- run 2: changed [E1] **Table heading altered**: Teacher did not ask to change content.
- run 3: removed [E1] **Source column removed**: Pupils would lose where to record sources.
- run 4: changed [E1] **Heading row added**: Task now asks for source numbers.
- run 5: removed [E1] **Table heading row changed**: Row no longer fits the table.

## 3PD #1

> Update this to 15 minutes

**GPT-6 Sol**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**GPT-6 Luna**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

**Mistral Small 4**

- run 1: no flags
- run 2: no flags
- run 3: no flags
- run 4: no flags
- run 5: no flags

## 3PD #2

> Create another copy of the worksheet, formatted to Comic Sans 14 point

**GPT-6 Sol**

- run 1: added [E5] **Wrong English king**: Edward II, not Edward I, led England in 1314.
- run 1: added [E8, E14] **Answer 4 marked Primary**: A Victorian painting of the battle is a secondary source.
- run 2: added [E5] **Wrong king at Bannockburn**: Pupils would learn Edward I fought in 1314; it was Edward II.
- run 2: added [E14] **Answer 4 now Primary**: A Victorian painting of the battle is a secondary source.
- run 3: changed [E5] **Wrong English king named**: Edward II, not Edward I, led England at Bannockburn.
- run 3: changed [E14] **Victorian painting marked primary**: A later painting is secondary evidence of the battle.
- run 4: added [E5] **Wrong king at Bannockburn**: Pupils would learn Edward I fought in a battle after his death.
- run 4: added [E14] **Victorian painting marked primary**: Pupils could be marked wrong for correctly identifying a secondary source.
- run 5: added [E8, E14] **Victorian painting marked primary**: Pupils would be marked against an incorrect answer.
- run 5: added [E5] **Edward I named at Bannockburn**: Pupils would learn the wrong English king; it was Edward II.

**GPT-6 Luna**

- run 1: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **New worksheet content**: A new worksheet and teacher answers were created, not a copy of the original.
- run 2: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Worksheet content replaced**: The requested copy contains entirely new tasks, facts and answers, not the worksheet.
- run 3: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **New worksheet content**: The requested copy was replaced with a newly created worksheet and teacher answers.
- run 4: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Worksheet content replaced**: New history tasks, answers and lesson content appear instead of a copy.
- run 5: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Worksheet content recreated**: A new worksheet’s tasks, facts and answers replace the requested copy.

**Mistral Small 4**

- run 1: added [E1, E2, E12, E13, E14, E15, E16] **Answers added**: Pupils see answers meant only for teachers.
- run 2: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Full worksheet copied again**: Pupils see duplicated content they should not.
- run 3: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Blank worksheet recreated**: Whole worksheet added instead of copy.
- run 4: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Full worksheet recreated without request**: Teacher only asked to copy and change font.
- run 5: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16] **Full worksheet copied**: Needed only a font change.

## 3PD #3

> Add an extension task for more able learners

**GPT-6 Sol**

- run 1: no flags
- run 2: added [E4] **Suggested answer added**: Adds marking guidance the teacher did not request.
- run 3: added [E4] **Suggested answer added**: Adds unrequested marking guidance to the pupil worksheet.
- run 4: added [E4] **Extension answer added**: Adds an unrequested marking cue for teachers.
- run 5: added [E4] **Extension answer added**: Adds teacher marking guidance that was not requested.

**GPT-6 Luna**

- run 1: added [E4] **Extension answer added**: Adds an unrequested marking cue for teachers.
- run 2: added [E4] **Suggested answer added**: Adds teacher-facing marking guidance beyond the requested pupil extension.
- run 3: added [E4] **Extension answer added**: Adds an unrequested marking cue for teachers.
- run 4: added [E2] **Declaration context added**: Pupils learn historical context not requested.
- run 4: added [E4] **Suggested answer added**: Adds teacher marking guidance beyond the requested task.
- run 5: added [E4] **Teacher answer added**: Provides a marking cue the teacher did not request.

**Mistral Small 4**

- run 1: added [E2] **Unsourced date added**: Fact pupils may learn is wrong.
- run 1: added [E4] **Extension answer provided**: Teacher may not want suggested answer.
- run 2: added [E2] **Extra source text added**: Pupils learn a fact not in the task.
- run 3: added [E2, E4] **Near-contemporary detail added**: Changes factual detail pupils will learn.
- run 4: added [E2] **Unwanted source detail added**: Pupils may focus on irrelevant date.
- run 5: added [E2] **Date added to extension task**: Pupils learn an unasked-for fact.

## 3PD #4

> Create another worksheet with Task 1 and Task 2 separated out. Also Split Task 2 into two parts, making 3 parts in total.

**GPT-6 Sol**

- run 1: changed [E5, E8, E14] **Historical details corrected**: The new copy changes facts beyond the requested restructure.
- run 2: changed [E5] **Battle background corrected**: Pupils will learn a different account of the battle.
- run 2: changed [E14] **Declaration context corrected**: Changes the historical facts pupils use in the extension.
- run 3: changed [E8, E14, E18] **Declaration dating and classification**: Unrequested historical corrections change facts and how pupils are marked.
- run 4: changed [E8, E14, E18, E21] **Historical details and answers corrected**: Unrequested corrections alter source facts and how responses are marked.
- run 5: changed [E5, E8, E14, E18, E19, E21] **Declaration dating and answers corrected**: Historical facts and marking cues differ from the original worksheet.

**GPT-6 Luna**

- run 1: added [E4] **New learning intention**: Adds source evaluation alongside the requested worksheet restructuring.
- run 1: added [E13, E14, E15] **Extension task added**: Adds a substantial source-evaluation task beyond the requested three-part structure.
- run 1: added [E16, E17, E18, E19, E20, E21] **Teacher answer section added**: Adds marking guidance and answers not requested for the new worksheet.
- run 1: added [E3] **15-minute timing added**: Sets an additional time expectation for pupils.
- run 1: changed [E5] **Historical background revised**: Introduces factual material beyond the requested restructuring; check the new account.
- run 2: added [E5] **New background information**: Adds historical context pupils will learn beyond the requested restructuring.
- run 2: added [E4] **Learning intention added**: Introduces a new learning goal not requested.
- run 2: added [E3] **15-minute estimate added**: Sets an unrequested time expectation for the homework.
- run 3: changed [E5, E14] **Historical facts corrected**: Unrequested factual edits may change what pupils learn.
- run 4: added [E4] **Learning intention added**: Sets an additional learning focus beyond the requested task restructuring.
- run 4: added [E3] **15-minute duration added**: Adds a time expectation that may affect lesson planning.
- run 5: added [E4] **Learning intention added**: Adds a learning focus beyond the requested restructuring.
- run 5: added [E13, E14, E15] **Extension retained**: Adds a further source-evaluation task and increases lesson time.
- run 5: added [E16, E17, E18, E19, E20, E21] **Teacher answers included**: Adds marking guidance not requested for the new worksheet.
- run 5: changed [E5] **Historical background added**: Introduces factual teaching content beyond the requested restructuring.

**Mistral Small 4**

- run 1: added [E4] **Learning intention added**: Changes lesson focus without teacher request.
- run 1: added [E14] **Extension fact changed**: Alters what pupils would learn.
- run 2: added [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21] **new worksheet made**: Pupils get a different task than asked.
- run 3: added [E4] **Learning intention added**: Changes the stated learning goal without teacher request.
- run 3: added [E14] **Extension text rewritten**: Alters what pupils will learn in the extension.
- run 4: added [E1, E2, E3, E4, E5, E16, E17, E18, E19, E20, E21] **Full worksheet created**: Teacher asked for a split, not a new one.
- run 5: added [E4] **New learning intention**: Extra aim not requested risks scope creep.
- run 5: added [E6, E9, E11] **Task timings added**: Estimates not asked for, could affect planning.

## 3PD #4 as copy

> Create another worksheet with Task 1 and Task 2 separated out. Also Split Task 2 into two parts, making 3 parts in total.

**GPT-6 Sol**

- run 1: changed [E1] **Background and source definitions changed**: Changes historical facts and how pupils classify sources.
- run 1: changed [E3] **Source classification scope changed**: Pupils now classify sources relative to a specified period.
- run 1: changed [E9, E13] **Answer 4 now Secondary**: Pupils would be marked against a different answer.
- run 1: changed [E10, E15] **Declaration answer narrowed**: Teacher guidance now stresses presentation rather than direct evidence of beliefs.
- run 2: changed [E9, E13, E3] **Source 4 answer changed**: Pupils are now marked on its relevance to Bannockburn.
- run 2: changed [E1] **Background king corrected**: Pupils learn Edward II rather than Edward I led the English.
- run 2: changed [E1] **Primary source definition changed**: The criterion no longer requires a witness or contemporary author.
- run 3: changed [E1] **Background and source definitions corrected**: Changes historical facts and how pupils classify sources.
- run 3: changed [E3] **Source classification scope narrowed**: Pupils now classify sources specifically for Bannockburn and its period.
- run 3: changed [E9, E13] **Answer 4 now Secondary**: Pupils would be marked against a different answer.
- run 3: changed [E10, E15] **Declaration answer qualified**: Teacher guidance now stresses persuasion and limits claims about nobles' views.
- run 4: changed [E1] **Background and source definitions changed**: Pupils learn different historical facts and how to classify sources.
- run 4: changed [E3] **Source classification narrowed**: Pupils now classify sources specifically for Bannockburn and its period.
- run 4: changed [E9, E13] **Answer 4 now secondary**: Pupils would be marked against a different answer.
- run 4: changed [E10, E15] **Declaration answer revised**: The model answer changes what earns credit.
- run 5: changed [E1] **Background and source definitions revised**: Changes historical facts and how pupils classify sources.
- run 5: changed [E3] **Classification scope narrowed**: Pupils now classify sources specifically for studying Bannockburn.
- run 5: changed [E9, E13] **Answer 4 now Secondary**: Changes the marking key for the source classification task.
- run 5: changed [E10, E15] **Declaration answer qualified**: Changes the guidance for marking pupils’ explanations.

**GPT-6 Luna**

- run 1: changed [E1] **Background facts changed**: Corrects Edward I to II, but also alters the primary-source definition pupils learn.
- run 1: changed [E3] **Source-classification instruction narrowed**: Makes the task explicitly about Bannockburn and its period.
- run 1: changed [E5, E7] **Answer space added**: Adds writing space without changing the questions or expected work.
- run 1: added [E8, E9, E10, E12] **Teacher answers added**: Adds classified sources and explanations that pupils could see or use.
- run 1: removed [E11, E13, E14, E15] **Original answer key omitted**: Replaces the existing answer key with revised answers and loses marking guidance.
- run 2: changed [E1] **Background facts revised**: The source definitions and Edward’s regnal number change what pupils learn.
- run 2: changed [E3] **Source-classification instruction narrowed**: Pupils must classify sources specifically for Bannockburn and its period.
- run 2: added [E8, E11] **Part 1 answer heading added**: The copied answer section gains an extra heading.
- run 2: removed [E13] **Original source answers omitted**: Teacher loses the original answer key for Task 1.
- run 2: removed [E15] **Original answer guidance omitted**: Teacher loses the supplied guidance and marking cues.
- run 3: changed [E1] **Background facts revised**: Pupils learn a corrected king’s identity and a broader source definition.
- run 3: changed [E3] **Source task narrowed**: Pupils now classify sources specifically for Bannockburn and its period.
- run 3: changed [E9, E13] **Source 4 answer changed**: The marking key now treats it as secondary, with a Victorian-view qualification.
- run 4: changed [E1] **Background facts revised**: Corrects Edward II, but changes the source definitions pupils learn.
- run 4: changed [E3] **Source-classifying instruction narrowed**: Adds a Bannockburn-period qualification that may alter classifications.
- run 4: removed [E8, E11, E13, E14, E15] **Teacher answer key replaced**: Original marking guidance is omitted; replacement answers change classifications and marking.
- run 5: changed [E1] **Background history corrected**: Changes historical facts and the primary-source definition pupils learn.
- run 5: changed [E9, E13] **Source answers revised**: Teachers may need to check the changed source classifications before marking.
- run 5: changed [E10, E12, E15] **Model answers rewritten**: Changes the marking guidance for both explanation questions.

**Mistral Small 4**

- run 1: changed [E1, E13, E15] **King Edward I to II**: Pupils would learn an incorrect fact.
- run 1: added [E5, E7, E10, E12] **Answer spaces added**: Task now asks for written answers not brief points.
- run 2: removed [E14] **Task 2 heading twice**: Part 2 now lacks its original task.
- run 2: changed [E1, E5, E7, E9, E13, E15] **Content altered beyond request**: Changes may affect pupil responses or accuracy.
- run 3: removed [E9, E13] **Answer key removed**: Pupils would mark without answers.
- run 3: added [E10, E12] **Answer hints added in task**: Gives answers, not just tasks.
- run 3: changed [E1, E5, E7] **Tasks expanded with lines**: Extra space changes how pupils answer.
- run 4: changed [E7] **Task 2 question renumbered**: Two tasks now share question number 1.
- run 4: changed [E4, E2, E11, E14] **Task headings altered**: Separation into parts makes tasks and parts inconsistent.
- run 5: changed [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15] **Task labels and layout redone**: Parts reordered but instruction gaps added.
