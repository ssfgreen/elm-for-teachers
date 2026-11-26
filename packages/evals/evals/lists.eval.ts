/**
 * A block per list item (PLAN.md section 6, L.5): the model sees each item with its id and still
 * writes lists one item per line; the server splits them. A request about one item changes that
 * item only; a whole list rewritten keeps a block per item, with no list left twice.
 */
import { describe } from 'vitest';
import { h, ol, p } from '../src/harness.js';
import { docDoesNotMatch, docKeeps, docMatches, edited, listItems, liveMatches, marksRevision, noRejectedEdits, waitingAfter } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const SENTENCES = ['The baby slept like a log. ____', 'Her hands were as cold as ice. ____', 'He ran as fast as a cheetah. ____', 'The stars twinkled like diamonds. ____'];
const WORKSHEET = { name: 'Similes worksheet', blocks: [h('# Similes'), p('Underline the simile in each sentence.'), ol(SENTENCES, 'questions')] };
const DOC = WORKSHEET.name;

const SEQUENCE = ['Starter (5 minutes): sort sentences into similes and metaphors.', 'Teach and model (10 minutes): what a simile and a metaphor are.', 'Guided practice (10 minutes): find comparisons in a poem in pairs.', 'Independent writing (20 minutes): describe a storm with one simile and one metaphor.', 'Exit ticket (5 minutes): one simile and one metaphor about the same subject.'];
/** The earlier turn's "remove the exit ticket" still waiting, on that item only. */
const LESSON = { name: 'P7 lesson plan', blocks: [h('# Similes and metaphors'), h('## Lesson sequence'), { ...ol(SEQUENCE, 'sequence'), suggested: ol(SEQUENCE.slice(0, 4)).content }] };
const history = [{ prompt: 'Can you remove the exit ticket from the lesson plan?', reply: 'I’ve suggested removing the exit ticket.' }];

describe('Lists, a block per item', () => {
  evalCase(
    'a request about one item changes that item only',
    { docs: [WORKSHEET], prompt: 'Make question 3 harder for my P7 class.' },
    [edited, noRejectedEdits, waitingAfter(1), listItems(DOC, 'numbered_item', 4), docKeeps(DOC, 'slept like a log', 'as cold as ice', 'twinkled like diamonds'), docDoesNotMatch(DOC, /as fast as a cheetah/)],
  );

  evalCase(
    'adding an item puts one new item in the list',
    { docs: [WORKSHEET], prompt: 'Add a fifth sentence about the sea.' },
    [edited, noRejectedEdits, waitingAfter(1), listItems(DOC, 'numbered_item', 5), docMatches(DOC, /\bsea\b/i), docKeeps(DOC, 'slept like a log', 'as fast as a cheetah')],
  );

  evalCase(
    'a whole list rewritten keeps a block per item, with nothing left twice',
    { docs: [WORKSHEET], prompt: 'Rewrite every sentence so it uses a metaphor instead of a simile.' },
    [edited, noRejectedEdits, listItems(DOC, 'numbered_item', 4), docDoesNotMatch(DOC, /slept like a log|as cold as ice/)],
  );

  evalCase(
    'in Editing mode, a change to another item leaves the earlier suggestion on the exit ticket waiting',
    { docs: [LESSON], history, editMode: 'edit', prompt: 'Add a five-minute plenary after the independent writing.' },
    [edited, noRejectedEdits, liveMatches(LESSON.name, /plenary/i), liveMatches(LESSON.name, /Exit ticket/), waitingAfter(1), marksRevision(false)],
  );
});
