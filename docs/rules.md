# The rules: their dated exceptions

The rules that hold the system together are the table in
[`ARCHITECTURE.md`](../ARCHITECTURE.md) ("The rules that hold it together"), one line each. Where a
rule has exceptions Sam has decided, they are here, word for word, with the date of each. Changing
any of them is a design decision for Sam, as for the table.

## The assistant suggests; the teacher decides

The rule: model changes are proposals. Tools return operations; only the turn commit writes.

The one exception is the teacher's own choice of Editing mode under the chat box (Sam, 7 Nov 2026): the commit then takes the proposals in at once, and the turn's `chat_prompt` says so, except a change to a block with an earlier turn's suggestion waiting, which stays a suggestion unless the model marks it `revises_suggestion` (the teacher asked for it).

A doc the assistant makes or copies in a turn goes straight in, in either mode (Sam, 12 Nov 2026): there is nothing in it to replace.

So does what the assistant writes into a blank doc (Sam, 13 Nov 2026). Blank means: every visible block is empty text; no picture, table, divider or page break; no suggestion or suggested style waiting. The doc's name and font do not count; a doc that was typed in and then emptied counts; any blank doc in the chat counts, not only a new chat's first. It is decided at the commit, inside the transaction (`applyTurn`), by `isBlankDoc`: if the teacher types while the assistant is working, its changes come as suggestions.

## Everything is logged, under a hash

The rule: events go through the `EventStore`, the only writer to the `events` table; sessions and model calls carry `config_hash` and `system_prompt_hash`.

Pupils' asks in the reader are kept for their teacher, not for research (Sam, 23 Nov 2026, answer 49: "This is for teacher monitoring, not researcher monitoring"). They go in their own tables (`reader_asks`, `reader_ask_texts`; `server/src/reader-asks/`), never in research events, the call log (`gateway_calls`) or the export. Each ask still carries `config_hash`, its model and a `sha256:` hash of the safety instruction it ran under. Log lines carry reason codes and ids only, never the passage, the instruction or the reply.

What goes to the model for an ask (Sam, 23 Nov 2026, as agreed in #152: answer 48, buttons only, and answer 70, the class's safety instruction): the class's safety instruction (else config's), the reading's words, the passage the pupil highlighted, the prompt's hidden instruction and, for a follow-up, the earlier asks of the chain with their replies. Nothing else: no class name, no pupil label, no sign-in provider, no id, and never a pupil's name (answer 90). One function builds it (`askRequest`), pinned by a snapshot.

When a teacher removes a pupil (Sam, 23 Nov 2026, answer 91; Sam, 24 Nov 2026, question 105: "We should keep the parts asked about. All data just not user identifying information"): their asks stay, each under the new random id of the pupil's `removed_pupils` row, and their cost still counts. What stays is everything about the ask: the passage asked about, the prompt, the reply, which ask it followed up, the workspace, class and reading, the model, the time, the tokens, the cost and the two hashes. What goes is what identifies the pupil: their membership of the class (the link from the ask to them) and their pupil record with its sign-in. Pupils cannot type into an ask, so no words of theirs are kept; the passage is the teacher's reading and the reply the model's. Not exported until Sam and the ethics approval say otherwise.

Test pupils (`teacher_test`, the teacher's "View as pupil") are kept the same way as pupils, out of research data and out of Progress counts; their asks are paid from the workspace budget, as every pupil's are.
