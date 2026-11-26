# Study Design and Facilitator Guide

Oct 28, 2026 · @Sam Green

> **Out of date in places (note added 13 Nov 2026).** This document has not been rewritten to match
> what was built. Where it describes task briefs shown in the tool, planted errors (an error injector),
> a class panel with a register, and a sort screen, it no longer matches the product: the study's
> tasks are given verbally, teachers make their own projects and chats, no task content lives in
> the product, and a study workspace starts with a demo class and a demo chat instead
> (`docs/classes.md`, "Study workspaces"). Read the rest with that in mind.

Appendix material for a study of **teachers' epistemic relationships with a generative AI assistant during worksheet creation and differentiation**.

This document is authoritative over the development specification (`dev-spec.md`). Within it, the register (Appendix C) and the questionnaire (B.3.1) are authoritative over surrounding prose; the prose was corrected to match on 28 Oct 2026.

## Appendix A. Study design

### A.1 Aims, research questions and framing

The study examines *how* teachers form an epistemic relationship with a generative AI assistant while creating and differentiating a worksheet, *whether* their account of that relationship matches their observed behaviour, and *what* consequences the relationship has for the resource that reaches pupils.

We adopt the definition from Yang and Ma (2025): *an epistemic relationship is the interactional pattern through which a user assesses, trusts and collaborates with an AI system.* Their codebook (metaphor, task type, assessment perspective, human epistemic status, trust type) and their five relationship types (Instrumental Reliance, Contingent Delegation, Co-agency Collaboration, Authority Displacement, Epistemic Abstention) are adopted as our coding vocabulary.

Our study extends their interview work and adds behavioural measurement.

Research questions:

1. RQ1 (behavioural ER): which epistemic relationship patterns are observable in teachers' interaction with the assistant during worksheet creation and differentiation, and do they shift between the two tasks?
2. RQ2 (alignment): how closely does each teacher's self-reported relationship (metaphor, trust type, content ownership) match the relationship coded by researchers from their logs?
3. RQ3 (mediation): how do the behavioural relationship and the alignment gap relate to what reaches pupils, measured as survival of planted errors, use of pupil information in differentiation, and the teacher's ability to defend contested content?
4. RQ4 (design): which features of the interaction (process questions, challenges, accept or reject of proposed edits, manual rewriting) are associated with better mediation outcomes, as input to tool design and teacher guidance?

The design is a single-session, within-subjects, mixed-methods study. Every participant completes the same two tasks in the same instrumented tool. The three data modes are: do (the logged task and a final-check step), make (a provenance annotation of the teacher's own worksheet and a relationship card sort), and say (a fixed post-task questionnaire and a structured interview, identical for every participant).

### A.2 Participants and recruitment

Target sample is 2-5 teachers for the initial pilot, followed by a further 15-18 practicing teachers for the roll out who teach English or literacy to pupils aged 9 to 14, recruited through school partnerships and professional networks. The sample is purposively stratified on two variables that Yang and Ma identify as drivers of epistemic relationship: subject expertise (secondary English specialists versus primary generalists) and prior experience with generative AI tools (none or occasional versus regular, defined as weekly use for planning or resources).

Inclusion criteria: currently teaching; has taught figurative language (metaphors and similes) at least once; able to attend a single 60-minute session by video call with screen sharing and transcription (automatically-captured by MS Teams).

Participants are told the study concerns how teachers work with AI assistants when making resources. They are not told that errors are planted until the debrief.

Informed consent is obtained by email before the session, so no consent step takes place on the day; the facilitator confirms at the start that the signed form has been received.

Recorded at intake: years of teaching, phase, subject, self-rated confidence with figurative language (1 to 5), self-rated confidence with AI tools (1 to 5), frequency of AI Use (none, occasional, weekly, daily) and which AI tools they currently use for school work.

### A.3 Task, brief and class specification

Each participant completes two linked tasks in the study tool. Both tasks are deliberately simple so that the interaction, not the content, is the object of study.

**Task 1: creation (target 10 minutes).** The brief shown to participants reads:

> Create a one-page worksheet for your class that introduces metaphors and similes. It should include a short explanation of each, a section where pupils identify whether given examples are metaphors or similes, and a section where pupils extend sentences to create their own, or write from scratch. You may write it yourself, ask the assistant to generate it, or any mixture. Work as you normally would.

**Task 2: differentiation (target 10 minutes).** Once the participant marks Task 1 complete, the brief continues:

> Now adapt the worksheet for the class described in the panel on the left. Produce whatever versions or changes you think the class needs. Again, work as you normally would.

Task 2 takes the Task 1 worksheet as its input: the canvas continues from where Task 1 ended and the class register appears in the left panel. The participant may adapt the single worksheet in place (universal design), create separate versions for particular pupils or needs, or combine the two. The tool supports all three forms and the brief does not steer between them; the form chosen is itself data (A.6, D.7).

The register shows a fictional class of 20 pupils aged 11 to 12 modelling what would be available in a typical LMS. Profiles are written so that generic adaptations are insufficient and pupil-specific knowledge is needed; the register shown to participants is reproduced in Appendix C.

**Task 3: final check (target 2 minutes).** Teachers are provided with a bounded error-detection window separate from authoring to ensure all participants do some sort of checking.

> You are about to hand these out tomorrow. Do a final check and make any last changes.

### A.4 Error Injection

Planted errors are the behavioural measure of trust type: appropriate trust in *Yang and Ma's* sense (justified confidence in results and methods) should detect them, while reliance and general trust should let them pass.

Errors are inserted by a deterministic injector (they are pre-specified) after the model has generated content and before it is shown; the model's stored message history is rewritten so that it treats the planted item as its own. The model is not instructed to defend or concede; its default behaviour when challenged is logged as data.

Each session plants two content errors in Task 1 and two differentiation errors in Task 2, drawn by seeded random selection from the bank below so that no two sessions share exactly the same set. Two correct-but-subtle control items (for example a genuine implied metaphor) are also included to detect false challenges and model sycophancy.

| Code | Error type | Example as planted | Correct reading | Stage |
| --- | --- | --- | --- | --- |
| C1 | Simile labelled as metaphor | "Her voice was like silk" listed under metaphors | Simile (uses "like" to compare) | Task 1 |
| C2 | Comparison "like" that is not a simile, labelled simile | "It took something like an hour" listed as a simile | Approximation, not figurative comparison | Task 1 |
| C3 | Personification labelled as metaphor | "The wind whispered through the trees" labelled metaphor | Personification (defensible as metaphor only with explanation; coded as contestable) | Task 1 |
| C4 | Hyperbole labelled as metaphor | "I've told you a million times" labelled metaphor | Hyperbole | Task 1 |
| C5 | Over-narrow definition | "A simile always uses the word like" | Similes also use "as" and other comparative forms | Task 1 |
| C6 | Over-broad definition | "A metaphor is any comparison between two things" | Omits the defining feature (states one thing is another) | Task 1 |
| C7 | Answer key error | Identification answer key marks a correct pupil answer as wrong | Key contradicts the item | Task 1 |
| D1 | Generic dyslexia adaptation | One change (amber overlay, larger font) applied identically to Callum, Lachlan and Rosie | Three different needs; Rosie needs no overlay and Lachlan needs text to speech and typing | Task 2 |
| D2 | Adaptation removes the task | "Simplified" version for Callum drops the identification section entirely | Only an overlay and Comic Sans 14pt were needed; content was not the issue | Task 2 |
| D3 | Chunking ignored for ADHD pupil | Harris's version (or if the teacher opts for Universal design - the sole version) presents the writing task as one long paragraph of instructions | Written tasks chunked into 3 steps at most was the stated need | Task 2 |
| D4 | Handwriting required despite profile | Lachlan's version (or if the teacher opts for Universal design - the sole version) asks for extended handwritten answers in a lined box | Typing instead of handwriting, and spelling not penalised, were the stated needs | Task 2 |
| D5 | Adaptation contradicts profile | Rosie's version(or if the teacher opts for Universal design - the sole version)  adds a coloured overlay and larger text but leaves the instructions unchanged | Coloured line guide and instructions read aloud 1:1 were the needs; no overlay | Task 2 |
| K1 | Control: correct implied metaphor | "The classroom buzzed as the bell rang" labelled metaphor | Correct (implied comparison to a hive) | Task 1 |
| K2 | Control: correct simile with "as" | "As quiet as a mouse" labelled simile | Correct | Task 1 |

For each planted item the tool records: the model's original item, the bank item substituted, the block position, the random seed, and every subsequent event touching that block.

Outcomes per planted item are coded as one of: passed through unchanged; noticed (dwell or edit) but not corrected; challenged in chat; corrected by the teacher; corrected by the model on its own initiative during a later generation; corrected after challenge.

Control items are coded for false challenge and for whether the model conceded a correct item under challenge.

The bank is finalised and frozen before the first participant session.

### A.5 Procedure

A single session of 60 minutes, run by one facilitator. The order places the naive self-account (make) before any discussion (say), so that the alignment measure is not contaminated by the interview.

| Step | Mode | Duration | What happens | Data produced |
| --- | --- | --- | --- | --- |
| 1. Welcome and intake |  | 3 min | Facilitator confirms consent already given by email and that the intake questionnaire (A.2), sent in advance as a Microsoft Teams form, has been completed | Intake record (Teams form, joined by participant code) |
| 2. Pre-task elicitation | Say | 2 min | Facilitator asks the three pre-task questions (B.2) before the tool is shown | Pre-task metaphor and expectations |
| 4. Task 1: creation | Do | 10 min | Participant creates the worksheet; facilitator silent, present for technical help only | Full event log, chat log, canvas history |
| 5. Task 2: differentiation | Do | 10 min | Participant adapts for the specified class | As above |
| 6. Final check | Do | 2 min | "Hand out tomorrow" check | Final-window events |
| 7. Provenance annotation | Make | 5 min | On their own final worksheet, participant tags each block: who decided this (me / the assistant / both / not sure) and confidence (1 to 5); flags any block they would check before using | Teacher provenance map |
| 8. Relationship sort | Make | 3 min | Card sort of plain-language relationship statements (B.4) into "like me usually", "like me today", "unsure", "not like me today", "never like me"; participant also picks the single best-fitting card for Task 1 and for Task 2 separately. Then an ownership rating in the tool, adapted from Draxler et al. (2024): each section of the worksheet (explanations, identification items, answer key, write-your-own, and the differentiation as one item or one per version) gets a slider from "me" to "the assistant", plus declared authorship and sense of control for the whole worksheet (B.4) | Self-reported ER per task; ownership rating per section; declared authorship; control |
| 9. Questionnaire and interview | Say | 19 min | Participant completes the fixed post-task questionnaire in the tool (B.3.1); facilitator then runs the structured interview over fixed anchors on the final worksheet (B.3.2), followed by the whole-interaction questions (B.4) | Audio transcript |
| 10. Debrief |  | 4 min | Planted errors revealed and explained; participant may withdraw data; written debrief sheet given | Withdrawal status |

Timings for steps 4 to 6 are targets, not limits. Participants who finish early move on; those who overrun are given a two-minute warning at the target and asked to reach a stopping point. Actual durations are logged.

The facilitator does not comment on the worksheet's content at any point before step 10, including when a participant asks whether an item is correct. The scripted response is: "Treat it as you would in school; I'm not able to help with the content."

### A.6 Measures and coding

Measures are organised by the Yang and Ma codebook dimension they operationalise, then by the mediation outcomes this study adds. Two researchers code independently; disagreements are resolved by discussion and inter-rater agreement (Cohen's kappa) is reported for each coded variable.

**Log-derived measures (do)**

| Codebook dimension | Measure | Operationalisation from the event log | Derived by |
| --- | --- | --- | --- |
| Assessment perspective | Prompt type distribution | Each chat prompt coded as: generation request, change request, verification question ("is this right?"), conceptual question ("what's the difference between…"), or other. Process-based assessment is indicated by verification and conceptual questions; outcome-based by generation and change requests only | LLM-annotated from the chat log against a written codebook, then checked by a researcher on 100 percent of prompts (small volume); agreement reported |
| Trust type | Planted-error outcomes | Per A.4; summarised as detection rate (noticed or better), correction rate, pass-through rate, and false-challenge rate on controls | Tool, automatically, for pass-through, teacher correction, model self-correction and dwell-based "noticed"; researcher-coded from the chat log for "challenged" and for whether a correct control item was disputed |
| Trust type | Edit acceptance | Proportion of model-proposed block edits accepted unchanged, edited before acceptance, or rejected | Tool, automatically |
| Trust type | Reading before accepting | Dwell time on model-authored blocks before first edit or acceptance; blocks accepted with dwell under 2 seconds flagged as unread | Tool, automatically |
| Metaphor (behavioural) | Authorship share | Proportion of final worksheet characters authored by teacher, by model, and by model then edited by teacher | Tool, automatically, from the revision history |
| Task type | Task shift | All of the above computed separately for Task 1 and Task 2 | Tool, automatically |

Three derivation routes are used throughout A.6. *Tool*: computed by the export script from the event log with no human judgement, and reproducible from the session bundle. *LLM-annotated*: a fixed prompt and codebook applied to the chat log or interview transcript by a language model, with every annotation checked by a researcher and agreement reported; used only for categorical coding of text, never for outcomes. *Researcher-coded*: two researchers code independently from the transcript (and the session recording where tone or hesitation matters), with Cohen's kappa reported; used for defensibility, challenge behaviour, pupil-information use and the behavioural ER assignment.

**Make-derived measures**

| Measure | Operationalisation |
| --- | --- |
| Teacher provenance map | For each block: teacher's attribution (me / assistant / both / not sure) and confidence (1 to 5) |
| Researcher provenance map | For each block: ground truth from the log (teacher-authored, model-authored unedited, model-authored then edited, injected) |
| Misattribution rate | Proportion of blocks where teacher attribution disagrees with ground truth; reported overall and for injected blocks |
| Calibration | Mean confidence on correctly versus incorrectly attributed blocks |
| Flag precision | Proportion of teacher-flagged blocks that were injected; proportion of injected blocks that were flagged |
| Self-reported ER | Best-fitting card per task, mapped to ER-1 to ER-5 |
| Ownership rating | Draxler et al. (2024) ownership scale (−50 Me to +50 assistant) per worksheet section, compared with log-derived authorship share; declared authorship (free text and forced choice) and control (1 to 7) for the whole worksheet; ownership versus declared-authorship gap as in the ghostwriter effect |

**Say-derived measures**

Interview transcripts are coded against the five codebook dimensions and, in addition, for defensibility and pupil-facing stance (D.8, D.9). Defensibility is scored per item the participant is asked to explain in the structured interview (B.3.2): 0 (cannot explain), 1 (explains but incorrectly or by appeal to the assistant), 2 (explains correctly in own terms).

**Alignment (RQ2)**

Each participant receives a behavioural ER assignment per task, derived by two coders from the log-derived measures using the Table 2 definitions in Yang and Ma (trust type, assessment perspective and metaphor as revealed by authorship share and challenge behaviour). Alignment is the agreement between self-reported ER (card sort) and behavioural ER, reported as a confusion matrix across participants and tasks, together with the misattribution rate.

**Mediation outcomes (RQ3)**

| Outcome | Definition |
| --- | --- |
| Error survival | Number and type of planted errors present in the final worksheet versions, by stage |
| Pupil-information use | For each of the six pupils with ASN notes on the register: whether the final adaptation addresses the stated need (coded 0, partial, 1 by two raters blind to the teacher's log) |
| Generic-adaptation flag | Whether the three dyslexia profiles received materially identical changes |
| Defensibility | Mean defensibility score across replayed items |
| Disclosure stance | Coded response to "what would you tell a pupil about how this was made" (would not mention; would mention as tool; would mention as co-author; other) |

### A.7 Analysis plan and pre-registered expectations

The study is exploratory in Yang and Ma's sense but the sample is large enough to report descriptive patterns and to test a small number of directional expectations. All expectations below are pre-registered; the analysis distinguishes confirmatory from exploratory findings.

**Confirmatory expectations**

1. H1 (alignment gap): self-reported ER will disagree with behavioural ER in a substantial minority of participant-tasks (expected at least a third), with the most common pattern being a self-reported tool or assistant relationship (ER-1, ER-2) alongside behaviour coded as delegation with low verification (ER-2 with reliance, or ER-4).
2. H2 (trust type predicts survival): participants whose behavioural trust type is coded as appropriate trust will show lower planted-error survival than those coded as reliance or general trust.
3. H3 (process questions protect): the number of verification and conceptual prompts will be negatively associated with error survival and positively associated with defensibility.
4. H4 (adaptation is where mediation fails): differentiation errors (D-series) will survive at a higher rate than content errors (C-series), and the generic-adaptation flag will be raised for a majority of participants whose authorship share in Task 2 is below 25 percent.
5. H5 (misattribution concentrates on edited blocks): misattribution will be highest for blocks that were model-authored and then teacher-edited, consistent with the source-memory findings of Zindulka et al. (CHI 2026).

**Exploratory questions**

- Whether ER shifts between Task 1 and Task 2 within participants, and in which direction.
- Whether subject expertise (English specialist versus generalist) is associated with content-error detection, and whether pupil-facing experience is associated with differentiation-error detection.
- Whether prior AI experience is associated with higher authorship share by the model and with lower misattribution, or the reverse.
- How often the model self-corrects a planted error during a later generation, and whether teachers notice.
- How often the model concedes a correct control item under challenge, and what the teacher does next.

**Analysis**

With 16 to 20 participants and two tasks each, quantitative analysis is descriptive with effect sizes and confidence intervals; where a test is used it is a non-parametric paired or rank test, and no claim of generalisation beyond the sample is made. Qualitative analysis of interview transcripts uses the codebook deductively and allows inductive codes for patterns the codebook does not capture, particularly in the pupil-facing material. Alignment is presented as a confusion matrix with illustrative cases for each major disagreement pattern.

All analysis scripts operate on the exported session bundle (see the development specification) and are published with the paper.

### A.8 Ethics, deception and debrief

The study uses incomplete disclosure: participants are told the study concerns how teachers work with AI assistants, but not that errors are planted or that the assistant's history is rewritten. This is necessary because knowledge of planting would change checking behaviour, which is the primary measure. The design follows the standard conditions for incomplete disclosure: the withheld information would not affect a reasonable person's decision to take part; risk is minimal; a full debrief follows immediately; and participants may withdraw their data at debrief with no loss of payment.

Specific safeguards:

- The planted errors are confined to the fictional worksheet and class. No resource created in the session is used with real pupils, and participants are reminded of this in the debrief.
- The class specification is fictional and no pupil data is collected.
- Keystroke and screen capture are limited to the tool window. No other application or input is recorded. Participants are told that typing is recorded.
- The debrief names every planted item the participant saw, explains why each was wrong, and makes clear that missing planted errors is expected and is not a judgement of competence. The facilitator script in B.6 is used verbatim.
- Transcripts, logs and worksheets are pseudonymised at export. Identifying details in interview transcripts (school name, colleague names) are redacted before coding.
- The model provider's data policy is checked so that session content is not retained for training; the API is called with retention disabled where the provider offers it.

Participants receive a written debrief sheet with the study's purpose, the list of planted items, a contact for questions, and a short note on checking AI-generated resources that they may keep. Ethics approval reference is recorded here once granted.

## Appendix B. Facilitator interview guide

### B.1 Principles for the facilitator

The interview is semi-structured and log-prompted. Its purpose is to elicit the participant's own account of their relationship with the assistant, in their words, and to compare it with what the log shows. Four rules apply throughout.

1. Never use the words epistemic, trust calibration, over-reliance or error until the debrief. Use everyday language: "check", "rely on", "take its word", "push back".
2. Ask for description before judgement. "What were you doing here?" comes before "Did you think that was right?"
3. Do not confirm or deny the correctness of any worksheet content before the debrief. If asked, say: "I'll come back to the content at the end; for now I'm interested in what you were thinking."
4. Follow the participant's framing. If they call the assistant "it", "he", "the tool", "Gemini", use their term.

Probe set to use after any answer: "Can you say more about that?" / "What made you decide that?" / "What would have changed your mind?" / "Is that how you'd usually do it at school?"

### B.2 Pre-task elicitation (before the tool is shown, 2 minutes)

Asked once, answers noted on the intake sheet. These give the pre-task metaphor and expectations for comparison with the post-task sort.

1. "When you use an AI tool for school work, how would you describe what it is to you? If it were a person or a thing in your working life, what would it be?"
2. "When it gives you something, what do you normally do with it before you use it?"
3. "Is there anything you wouldn't let it do, or wouldn't take its word on?"

### B.3 Post-task questionnaire and structured interview

Both instruments are fixed: every participant answers the same items in the same order. Nothing is selected from the log on the fly. The questionnaire is adapted from Lee et al. (CHI 2025), keeping the items that map onto the research questions and the Yang and Ma codebook, and rewording "GenAI tool" as "the assistant". Because the task is fixed by the study, Lee et al.'s open task-description item is dropped. The questionnaire is completed in the tool after the relationship sort and before the interview, so that the interview does not contaminate it.

#### B.3.1 Post-task questionnaire (in tool, about 6 minutes)

| No. | Item (as shown to the participant) | Response format | Source | Maps to |
| --- | --- | --- | --- | --- |
| Q1 | For each task, which best describes how you used the assistant? (asked once for Task 1 and once for Task 2) | (a) Generated something I used directly; (b) generated something I used with changes; (c) generated ideas I used indirectly; (d) checked what I had written against the brief; (e) improved something I had written; (f) I did not use it for this task | Lee et al. Q2, reduced | Metaphor (behavioural self-report); authorship share, compared with the log |
| Q2 | Compared with making a worksheet without the assistant, how much effort did each of these take today? (1 much less effort to 5 much more effort; N/A) (a) Recalling facts, terms or concepts; (b) organising and summarising ideas; (c) applying what you know about metaphors and similes; (d) applying what you know about this class; (e) checking quality and judging whether content is right | 1 to 5 plus N/A, five rows | Lee et al. Q3, with the analysis and synthesis rows dropped as not applicable to a short worksheet task | Assessment perspective; cognitive offloading by level; (e) is the verification measure |
| Q3 | Did you do any checking or critical thinking about what the assistant produced today? | Yes / No | Lee et al. Q6 | Trust type (appropriate versus reliance) |
| Q4 | If yes: which of these did you do? (select all that apply) (i) Checked facts or definitions against what I know or another source; (ii) checked structure, length and formatting; (iii) checked that it applied the concepts correctly (for example, that each example really is what it is labelled); (iv) checked that the parts were consistent with each other (for example, the answer key matches the items); (v) checked that the adaptations fit the pupils described; (vi) checked it against what I would expect to hand out in my school | Select all | Lee et al. Q7a, examples rewritten for the task | Assessment perspective; compared with the log for each tactic claimed |
| Q5 | If no: what stopped you? (select all that apply) (i) Not enough time; (ii) not sure how to check; (iii) it did not occur to me; (iv) this task did not need checking; (v) I trusted it on this topic; (vi) other | Select all plus free text | Lee et al. Q8a | Trust type; barriers |
| Q6 | Why did you use the assistant today? (select all that apply) (a) Save time; (b) do the work better; (c) get unstuck; (d) get more ideas; (e) do things I could not do myself; (f) other | Select all | Lee et al. Q9 | Metaphor; human epistemic status |
| Q7 | Would you want the assistant to produce and differentiate worksheets like this entirely on its own? | Yes / No, with one line why | Lee et al. Q10 | Authority displacement; agentic delegation stance |
| Q8 | Confidence (1 not at all to 5 extremely): (a) in your ability to make this worksheet without the assistant; (b) in the assistant's ability to make it; (c) in your ability, in a normal working week, to check what the assistant produces for tasks like this (d) in your ability, in a busy working week, to check what the assistant produces for longer tasks than this | Four 1 to 5 items | Lee et al. Q11 | Calibration: (b) and (c) are compared with planted-error outcomes |
| Q9 | How much of the final worksheet is yours? | 0 to 10 slider, labelled "entirely the assistant's" to "entirely mine" | Added | Ownership; compared with authorship share |
| Q10 | To what extent do you agree? (1 strongly disagree to 5 strongly agree) (a) Generally, I trust the assistant; (b) the assistant helps me solve many problems; (c) it is a good idea to rely on the assistant for help; (d) I do not trust the information I get from the assistant; (e) the assistant is reliable; (f) I rely on the assistant | Six 1 to 5 items | Lee et al. user Q8 | Trust type (general trust scale) |

#### B.3.2 Structured interview (about 10 minutes)

The facilitator opens the participant's final worksheet in the tool and walks through four fixed anchors in a fixed order, then asks the closing questions.

The same questions are asked at each anchor for every participant, whether or not a planted item sits there. The facilitator does not know which items are planted until the debrief screen; the console shows plan status only to the research team, not on the facilitator's interview view. Defensibility is scored from the answers to the "why" questions.

| Anchor | Questions (asked in this order) |
| --- | --- |
| 1. The explanation section (both definitions) | "Read these definitions as if you were about to teach from them. Would you teach them as they stand? Is there anything you would change or add?" |
| 2. The identification section (all items) | "Go down the list. For each one, tell me whether it is a metaphor or a simile and why." (facilitator asks "why" for every item, in order, without reacting) Then: "Were there any you were unsure about while you were working? What did you do about them?" Then: "Is there anything on this sheet you'd be uncomfortable standing behind in front of the class?" |
| 3. The answer key | "If a pupil got one of these 'wrong' according to the key but argued their case well, what would you do?" |
| 4. The differentiation, whatever form it took (separate versions, one universal version, or no change), with the register open beside it | "Show me what you did for this class. Talk me through it." Then, whichever form it took: "What on this sheet is there because of the register, and what would you have done anyway?" Then: "Did you look at the register when you made or accepted these changes? Which pupils did you have in mind?" |
| Closing (no anchor) | "If a pupil asked you how this worksheet was made, what would you tell them?" Then: "Does using a tool like this change what you feel responsible for in a resource? How?" |

### B.4 Whole-interaction relationship questions (about 3 minutes)

Asked after the structured interview. The participant has completed the relationship card sort, so the facilitator has their chosen cards in front of them.

**Card Sort**

Card statements for the relationship sort (step 8 in A.5), each shown as a draggable card in the tool's sort screen, in plain language. The participant sorts them into five piles: "like me usually", "like me today", "unsure", "not like me today", "never like me", and then picks the single best-fitting card for Task 1 and for Task 2 separately.

The mapping to Yang and Ma's ER types is for the researcher and is not shown:

| Card text | Maps to |
| --- | --- |
| "It did the typing; the ideas and decisions were mine." | ER-1 Instrumental Reliance |
| "I let it do parts of the job, but I checked what it gave me before using it." | ER-2 Contingent Delegation |
| "We worked it out together; it had ideas I wouldn't have had and I built on them." | ER-3 Co-agency Collaboration |
| "On some things it knew better than me, so I went with what it said." | ER-4 Authority Displacement |
| "I used it, but I didn't really trust what it gave me; I rewrote most of it." | ER-5 Epistemic Abstention |
| "I mostly just took what it gave me; I didn't check much." | Reliance without oversight (distinguishes low-verification ER-2 from ER-4) |
| "It was like a colleague I could ask." | Metaphor probe: co-agent |
| "It was like a trainee whose work I had to mark." | Metaphor probe: assistant |
| "It was like a textbook: usually right, not something I'd argue with." | Metaphor probe: authority |

**Facilitator Questions**

1. "You picked \[card\] for the first task and \[card\] for the second. Why those? Was it different in the two tasks?" (If the same card: "Was it the same throughout, or were there moments it felt different?")
2. "You rated each part of the worksheet from 'me' to 'the assistant'. Talk me through the ones near the middle, and the one furthest towards the assistant."
3. "Were there things you took its word on? Which? Why those?"
4. "Were there things you wouldn't take its word on? Why those?"
5. "If it got something wrong, how do you think you'd know?"
6. "Did it ever feel like it knew more than you about this? About metaphors and similes? About your class?"

**Ownership rating** (in the tool, immediately after the relationship sort; adapted from Draxler et al., *ACM TOCHI*, 2024, "The AI Ghostwriter Effect"). Draxler et al. measured sense of ownership with a visual analogue scale from "Me" (−50) to "AI" (+50), and separately asked participants to declare authorship, which is what revealed the gap between felt ownership and claimed authorship. We use both measures, per section rather than per document. Each section of the final worksheet is listed (explanations, identification items, answer key, write-your-own, and the differentiation as one item or one per version). For each, the participant sets a slider:

| Measure | Format | Source |
| --- | --- | --- |
| Sense of ownership, per section | Slider from "Me" to "The assistant", no numbers shown, stored as −50 to +50 | Draxler et al. (2024), visual analogue scale |
| Declared authorship, whole worksheet | "If this worksheet were shared with colleagues, who should be named as its author?" Free text, then a forced choice: Me / The assistant / Both / Someone else | Draxler et al. (2024), declared authorship item |
| Sense of control, whole worksheet | "How much control did you have over the content of the worksheet?" 1 to 7 | Draxler et al. (2024) |

Every slider must be set before the screen can be submitted. The section-level ownership score is compared at analysis with the log-derived authorship share for that section, and the gap between ownership and declared authorship is compared with Draxler et al.'s ghostwriter effect. Q9 in the questionnaire (B.3.1) is retained as a whole-document rating taken after the section sliders; its agreement with the section-level ownership scores is reported.

### B.6 Closing and debrief script

Read in full. The facilitator then shows the list of planted items for this session on screen.

> Thank you. Before we finish I need to tell you something about the session that I couldn't tell you at the start. Some of the content the assistant produced was deliberately altered by our system to include mistakes: things like a simile labelled as a metaphor, or an adaptation that didn't match a pupil's needs. The assistant itself didn't know this had happened. We did this because we wanted to see how teachers work with these tools under realistic conditions, where the tool is sometimes wrong and nobody warns you. Most people miss most of these; that is exactly what we expected and it is not a measure of your ability as a teacher.
>
> Here are the items that were planted in your session. \[Show list; explain each briefly.\]
>
> Nothing you made today will be used with pupils. Everything from today is anonymised: your name is replaced by a code, nothing in the recordings, logs or worksheet is linked back to you or your school, and only the research team sees the anonymised data. Now that you know about the planted errors, you can still choose to withdraw your data from the study. Is it okay for use to use your anonymised data in our study?
>
> Here's a short sheet with what the study is about, the list of planted items, and who to contact. Do you have any questions for me?

After the script, the facilitator records withdrawal status and asks one final open question, which is included in the transcript:

> "Now that you know, is there anything you'd do differently next time you use one of these tools?"

## Appendix C. Class register shown to participants

The class panel in Task 2 shows the following register, formatted as a SEEMiS Click+Go printout. It is fictional; names, Scottish Candidate Numbers and dates of birth do not correspond to any real pupil. Six pupils carry additional support needs (ASN) notes; the three dyslexia profiles differ deliberately so that a generic adaptation applied to all three is detectably wrong.

**SEEMiS Class Register: P7A**

|  |  |
| --- | --- |
| School | Braeside Primary School |
| Local authority | City of Edinburgh Council |
| Class | P7A |
| Class teacher | Mrs K. Munro |
| Session | 2026/27 |
| Term | Term 2 (Autumn) |
| Roll | 20 pupils |
| Printed | 21/10/2026 from SEEMiS Click+Go |

**1. Class list, attainment and additional support needs (ASN)**

| No. | Pupil name | SCN | Date of birth | Most recent grade (A to E) | ASN | Notes and key requirements |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Aiden Buchanan | 021935412 | 14/04/2015 | B |  |  |
| 2 | Amelia Fraser | 021935427 | 02/09/2015 | A |  |  |
| 3 | Callum Reid | 021935433 | 21/06/2015 | C | Dyslexia | Dyslexia. Needs amber reading overlay for all printed text. Prefers Comic Sans 14pt on handouts. Does not need extra time for reading in class, only in assessments. |
| 4 | Eilidh McPherson | 021935448 | 30/11/2015 | B |  |  |
| 5 | Finlay Sinclair | 021935454 | 08/01/2016 | D | Autism | Autism. Visual timetable on desk, 5 minute warning before transitions. Sits near the door. Ear defenders available in tray for assemblies and PE. |
| 6 | Freya Campbell | 021935469 | 19/03/2015 | A |  |  |
| 7 | Harris Munro | 021935475 | 27/07/2015 | C | ADHD | ADHD. Movement break every 20 to 25 minutes (classroom jobs work well). Wobble cushion. Chunk written tasks into 3 steps max. Medication at 12:15, office holds supply. |
| 8 | Isla Drummond | 021935480 | 11/05/2015 | B |  |  |
| 9 | Jack Lennox | 021935496 | 04/10/2015 | C |  |  |
| 10 | Kirsty Baird | 021935501 | 16/02/2016 | A |  |  |
| 11 | Lachlan Grant | 021935517 | 23/08/2015 | D | Dyslexia | Dyslexia. Massively supported by text to speech (TLDR extension on Chromebook, Immersive Reader in Teams). Typing instead of handwriting for extended writing. Spelling not penalised in content marking. |
| 12 | Lewis Hamilton | 021935522 | 09/12/2015 | B |  |  |
| 13 | Maisie Robertson | 021935538 | 01/04/2015 | C |  |  |
| 15 | Oliver Shaw | 021935559 | 13/09/2015 | E | Autism, ADHD | Autism and ADHD. Individual workstation available when overwhelmed. Now, next, then board. Key adult is Mrs Paterson (PSA). Staged intervention level 2, CSP under review with Educational Psychology. |
| 16 | Orla Kennedy | 021935564 | 07/07/2015 | A |  |  |
| 17 | Rhys Docherty | 021935570 | 18/01/2016 | C |  |  |
| 18 | Rosie MacLeod | 021935585 | 29/10/2015 | B | Dyslexia | Dyslexia (mild). Coloured line guide for reading. Reads instructions aloud 1:1 before independent tasks. No overlay needed. |
| 19 | Ruaridh Fleming | 021935591 | 03/03/2015 | D |  |  |
| 20 | Skye Anderson | 021935606 | 22/05/2015 | B |  |  |
| 21 | Sophie Wallace | 021935612 | 15/08/2015 | A |  |  |

## Appendix D. Codebook

Every coding scheme used in the study is collected here so that A.6, B.3 and B.4 can refer to one place. Each scheme states its values, the source, the data it is applied to and how it is derived (tool, LLM-annotated with researcher check, or researcher-coded; see A.6). Schemes D.1 to D.3 are the Yang and Ma (2025) vocabulary as operationalised here; D.4 to D.9 are the study's own measures.

### D.1 Codebook dimensions (Yang and Ma, 2025, Table 1)

| Dimension | Values | Applied to | Derived by |
| --- | --- | --- | --- |
| Metaphor | Tool; Assistant; Co-agent; Coach or mentor; Authority (oracle) | Pre-task answers (B.2), relationship cards (B.4), interview transcript | Researcher-coded from transcript; card choice mapped by the table in B.4 |
| Task type | Creation (Task 1); Differentiation (Task 2) | Fixed by design | Tool |
| Assessment perspective | Outcome-based; Process-based; Mixed | Chat log (via D.4), interview transcript | Tool from D.4 counts, confirmed by researcher from transcript |
| Human epistemic status | Domain expert (English specialist); Domain non-expert (generalist); AI-experienced (weekly use or more); AI-inexperienced | Intake record | Tool from intake |
| Trust type | Distrust; Reliance; General trust; Appropriate trust | Planted-item outcomes (D.5), edit acceptance and dwell, questionnaire Q3 to Q5 and Q10 | Researcher-coded using the rules in D.3 |

### D.2 Epistemic relationship types (Yang and Ma, 2025, Table 2)

| Code | Name | Defining pattern |
| --- | --- | --- |
| ER-1 | Instrumental Reliance | Assistant used for efficiency only; outcome-based assessment; no epistemic status granted |
| ER-2 | Contingent Delegation | Judgement delegated for specific tasks under oversight; outputs checked; outcome-based |
| ER-3 | Co-agency Collaboration | Assistant treated as a thinking partner; mixed process and outcome assessment |
| ER-4 | Authority Displacement | Assistant granted partial authority and allowed to lead; general trust; process-based |
| ER-5 | Epistemic Abstention | Assistant used but denied epistemic contribution; distrust; heavy rewriting |

### D.3 Rules for assigning trust type and behavioural ER from the log

Applied per participant per task by two researchers independently. Thresholds are pre-registered and may be revised after the pilot, with the revision recorded.

| Trust type | Rule |
| --- | --- |
| Appropriate trust | Detected at least half of planted items in the task, with at least one challenge or verification prompt, and no false challenge that led to abandoning a correct control item |
| Reliance | Detected fewer than half of planted items; accepted most proposals unchanged; few or no verification prompts |
| General trust | As reliance, but with questionnaire Q10 trust items above the sample median and Q3 answered "no" or Q5 answer (v) "I trusted it on this topic" |
| Distrust | Rejected or rewrote most proposals regardless of correctness; questionnaire Q10 reverse item (d) high |

| Behavioural ER | Rule (all of the row's conditions) |
| --- | --- |
| ER-1 | Teacher authorship share above 70 percent; assistant used for formatting, lists or wording only; no conceptual or verification prompts |
| ER-2 | Model authorship share above 30 percent; appropriate trust; outcome-based assessment (no conceptual prompts) |
| ER-3 | Model authorship share between 30 and 70 percent; at least one conceptual prompt; teacher edits to model content are substantive, not cosmetic |
| ER-4 | Model authorship share above 70 percent; general trust or reliance; at least one instance of accepting a model explanation in chat without checking ("ok, use that") |
| ER-5 | Model content requested but mostly rejected or rewritten; distrust |
| Unassigned | None of the above; reported as such with the nearest two candidates |

### D.4 Prompt type (chat log)

| Code | Definition | Example |
| --- | --- | --- |
| GEN | Request to generate new content | "Write a worksheet on metaphors and similes" |
| CHG | Request to change existing content | "Make the examples shorter" |
| VER | Verification question about existing content | "Is example 4 really a metaphor?" |
| CON | Conceptual question not tied to a specific block | "What's the difference between personification and metaphor?" |
| PUP | Request that names or describes a pupil or need from the register | "Make a version for Lachlan with less reading" |
| OTH | Anything else, including social or meta prompts | "Thanks" |

Derived by LLM annotation with 100 percent researcher check. VER and CON count as process-based; GEN and CHG as outcome-based. PUP is counted for pupil-information use (D.7) and does not affect the assessment perspective.

### D.5 Planted-item outcome (per planted or control item)

| Code | Definition | Derived by |
| --- | --- | --- |
| PASS | Present in the final version unchanged | Tool |
| NOTICED | Dwell above threshold or an edit elsewhere in the block, but the error remains | Tool |
| CHALLENGED | Teacher questioned the item in chat (any VER prompt naming it) | Researcher from chat log |
| CORRECTED-T | Teacher corrected it directly on the canvas | Tool |
| CORRECTED-C | Corrected by an accepted model edit after a challenge | Tool plus researcher (links the challenge) |
| SELF-CORRECTED | Model corrected it in a later generation without being asked | Tool |
| REMOVED | Block deleted by the teacher, error gone without being addressed | Tool |
| FALSE-CHALLENGE (controls only) | Teacher challenged a correct control item | Researcher from chat log |
| CONCEDED (controls only) | Model agreed to change a correct item under challenge | Researcher from chat log |

### D.6 Provenance ground truth (per block, for the alignment test)

| Code | Definition |
| --- | --- |
| T | Teacher-authored; no model content ever in the block |
| M | Model-authored, accepted and never edited |
| M-edited | Model-authored, then edited by the teacher (character share of the edit recorded) |
| I | Injected item, whatever happened to it afterwards (origin never changes) |

Teacher attribution (me / the assistant / both / not sure) is compared with this ground truth; "both" is scored correct for M-edited blocks with a teacher share above 20 percent, otherwise incorrect. Derived by tool.

### D.7 Pupil-information use (per pupil with an ASN note)

| Code | Definition |
| --- | --- |
| 1 | Final material addresses the stated need for that pupil, in a way specific to that pupil |
| Partial | A relevant change was made but it is generic or incomplete (for example the same change for all dyslexic pupils) |
| 0 | The stated need is not addressed, or the change contradicts the profile |

Derived by two researchers blind to the log; the generic-adaptation flag is raised when Callum, Lachlan and Rosie all receive materially the same change.

### D.8 Defensibility (per item explained in the interview)

| Score | Definition |
| --- | --- |
| 2 | Explains the classification correctly in their own terms |
| 1 | Explains, but incorrectly, or by appeal to the assistant ("it said so") |
| 0 | Cannot explain, or declines |

Researcher-coded from transcript; for planted items the score is recorded alongside the D.5 outcome.

### D.9 Disclosure stance (interview closing question)

| Code | Definition |
| --- | --- |
| NONE | Would not mention the assistant to pupils |
| TOOL | Would mention it as a tool used, authorship retained |
| CO-AUTHOR | Would present it as having co-written or written the resource |
| OTHER | Anything else, recorded verbatim |

Researcher-coded from transcript.
