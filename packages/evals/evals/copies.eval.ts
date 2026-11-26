/** Copies of a doc with create_doc and copy_of (docs/spyglass.md, Part 1; cases 1, 4, 14, 15 and 16 of Part 9). */
import { describe } from 'vitest';
import type { EvalRun } from '../src/harness.js';
import { h, ol, p } from '../src/harness.js';
import { createdDoc, createdDocMatches, createdNoDoc, docKeeps, docMatches, docUnchanged, edited, messageMatches, noRejectedEdits, type Check } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const NAME = 'Similes and metaphors';
const ITEMS = ['The baby slept like a log.', 'The classroom was a zoo.', 'Her hands were as cold as ice.', 'Time is a thief.'];

/** Shaped like session 2SH's worksheet: a learning intention and a time that a rebuilt copy dropped. */
const worksheet = (suggest = false, named = false) => ({
  name: NAME,
  blocks: [
    h('# Similes and metaphors'),
    ...(named ? [p('Name: ______________________')] : []),
    p('Learning intention: I can tell a simile from a metaphor and write my own.'),
    { ...p('About 20 minutes'), ...(suggest ? { suggested: 'About 15 minutes' } : {}) },
    h('## Task 1'),
    p('Underline the simile or metaphor in each sentence, and write S or M beside it.'),
    ol(ITEMS),
    h('## Task 2'),
    { ...p('Write one simile and one metaphor about the weather.'), ...(suggest ? { suggested: 'Write two similes and two metaphors about the weather.' } : {}) },
  ],
});

/** Every block's text, as a copy that keeps them all would have it. */
const TEXTS = ['# Similes and metaphors', 'Learning intention: I can tell a simile from a metaphor and write my own.', 'About 20 minutes', '## Task 1', 'Underline the simile or metaphor in each sentence', ...ITEMS, '## Task 2', 'Write one simile and one metaphor about the weather.'];

const ASK_COPY = 'Make a copy of this worksheet for the other P6 class, and in this one add a line for the pupil’s name under the title.';

describe('Copies', () => {
  evalCase(
    'create_doc copy_of: a shorter duplicate is made as a copy and changed, the original untouched',
    { docs: [worksheet()], prompt: 'Create a duplicate. Minimise the amount of text so it is shorter, with clearer breaks between the tasks.' },
    [usedCopyOf, createdDoc(), copyDiffersFrom(NAME), docUnchanged(NAME), noRejectedEdits],
    { budget: { steps: 4 } },
  );

  evalCase(
    'create_doc copy_of: a duplicated version with an extension task keeps every block',
    { docs: [worksheet()], prompt: 'Create a duplicated version of this worksheet with an extension task for pupils who finish early.' },
    [usedCopyOf, createdDocMatches(/./, /extension/i), createdDocKeeps(...TEXTS), docUnchanged(NAME), noRejectedEdits],
    { budget: { steps: 4 } },
  );

  evalCase(
    'copy choice: a copy asked for while suggestions wait is not made, the teacher is asked to choose, other edits go ahead',
    { docs: [worksheet(true)], prompt: ASK_COPY },
    [askedForCopyChoice, createdNoDoc, messageMatches(/choos|choice|pick|decide|select/i), edited, docMatches(NAME, /name/i), docKeeps(NAME, ...ITEMS)],
    { budget: { steps: 4 } },
  );

  evalCase(
    'copy choice: after Use all and leave, the copy holds the suggested text and the source keeps its suggestions waiting',
    {
      // The name line the earlier turn added is in, as its reply says (the teacher accepted it).
      docs: [worksheet(true, true)],
      history: [{ prompt: ASK_COPY, reply: 'I’ve added a name line under the title. “Similes and metaphors” has 2 suggestions you haven’t decided on yet, so I haven’t made the copy: choose below what it should be made from.' }],
      prompt: `Make the copy from “${NAME}” with all its suggestions in, and leave them waiting in “${NAME}”.`,
      copyChoice: { doc: NAME, choice: 'all_and_leave' },
    },
    [usedCopyOf, noCopyChoiceAsked, createdDocMatches(/./, /About 15 minutes/), createdDocMatches(/./, /two similes and two metaphors/), createdDocLacks('About 20 minutes'), waitingIn(NAME, 2), docUnchanged(NAME), noRejectedEdits],
    { budget: { steps: 4 } },
  );

  evalCase(
    'no copy_of: an ordinary request to add to the doc edits it in place',
    { docs: [worksheet()], prompt: 'Add an extension activity for more advanced learners.' },
    [noCopyOf, createdNoDoc, docMatches(NAME, /extension/i), docKeeps(NAME, ...TEXTS), noRejectedEdits],
  );
});

/** The create_doc operations the model sent with copy_of set, over every edit_document call. */
function copyOfOps(r: EvalRun): unknown[] {
  return r.toolCalls
    .filter((c) => c.name === 'edit_document')
    .flatMap((c) => {
      try {
        const ops = (JSON.parse(c.arguments) as { operations?: { op?: string; copy_of?: unknown }[] }).operations;
        return Array.isArray(ops) ? ops.filter((o) => o?.op === 'create_doc' && o.copy_of) : [];
      } catch {
        return [];
      }
    });
}

const usedCopyOf: Check = (r) => ({ name: 'used create_doc with copy_of', kind: 'behaviour', pass: copyOfOps(r).length > 0, detail: `${copyOfOps(r).length}` });

const noCopyOf: Check = (r) => ({ name: 'used no copy_of', kind: 'behaviour', pass: copyOfOps(r).length === 0, detail: `${copyOfOps(r).length}` });

const choiceAsked = (r: EvalRun) => r.steps.flatMap((s) => s.tools).filter((t) => t.name === 'edit_document' && /"needs_copy_choice":\[/.test(t.output)).length;

/** edit_document said the teacher must choose first, and the turn recorded the request for the card. */
const askedForCopyChoice: Check = (r) => ({ name: 'edit_document result has needs_copy_choice', kind: 'behaviour', pass: choiceAsked(r) > 0 && r.copyRequests > 0, detail: `${choiceAsked(r)} result(s), ${r.copyRequests} request(s)` });

const noCopyChoiceAsked: Check = (r) => ({ name: 'no needs_copy_choice', kind: 'behaviour', pass: choiceAsked(r) === 0 && r.copyRequests === 0, detail: `${choiceAsked(r)} result(s), ${r.copyRequests} request(s)` });

/** A doc made this turn holds every one of these texts (suggestions accepted). */
function createdDocKeeps(...texts: string[]): Check {
  return (r) => {
    const missing = (d: string) => texts.filter((t) => !(r.after[d] ?? '').includes(t));
    const best = r.createdDocs.map(missing).sort((a, b) => a.length - b.length)[0];
    return { name: 'a new doc keeps every block', kind: 'behaviour', pass: best?.length === 0, detail: best === undefined ? 'no new doc' : best.length ? `missing: ${best.map((t) => JSON.stringify(t.slice(0, 40))).join(', ')}` : undefined };
  };
}

function createdDocLacks(text: string): Check {
  return (r) => ({ name: `a new doc without ${JSON.stringify(text)}`, kind: 'behaviour', pass: r.createdDocs.some((d) => !(r.after[d] ?? '').includes(text)), detail: r.createdDocs.join(', ') || 'no new doc' });
}

/** A doc made this turn is not just the source again: the copy was changed. */
function copyDiffersFrom(source: string): Check {
  return (r) => ({ name: `a new doc differs from “${source}”`, kind: 'behaviour', pass: r.createdDocs.some((d) => r.after[d] !== r.before[source]), detail: r.createdDocs.join(', ') || 'no new doc' });
}

function waitingIn(doc: string, n: number): Check {
  return (r) => ({ name: `“${doc}” has ${n} suggestion(s) waiting`, kind: 'behaviour', pass: r.waitingIn[doc] === n, detail: `${r.waitingIn[doc] ?? 0}` });
}
