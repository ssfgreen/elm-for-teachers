/**
 * Editing mode with an earlier suggestion still waiting (Sam's workshop, 7 Nov 2026): a request
 * about another part of the same block leaves that suggestion for the teacher; a request about
 * the suggestion itself, direct or implied, goes straight in.
 */
import { describe } from 'vitest';
import { h, ol, p, type BlockFixture } from '../src/harness.js';
import { docMatches, liveDoesNotMatch, liveMatches, marksRevision, noRejectedEdits, waitingAfter } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const STEPS = [
  '**Starter – spot the difference (5 minutes):** Display ‘The classroom was a zoo’ and ‘The classroom was like a zoo’. Ask pupils what each suggests and which sentence uses ‘like’.',
  '**Teach and model (10 minutes):** Explain that a simile compares using ‘like’ or ‘as’; a metaphor describes one thing as another without ‘like’ or ‘as’. Model a simile and a metaphor about the wind.',
  '**Guided practice (10 minutes):** Read a short descriptive passage or poem. In pairs, pupils find comparisons, label them simile or metaphor, and explain the effect of one. Take feedback and address any confusion.',
  '**Independent writing (20 minutes):** Pupils describe a storm, a busy playground or a place of their choice in 5–7 sentences, with at least one simile and one metaphor, underlined.',
];
const SHARE = '**Share and improve (10 minutes):** Partners identify each other’s comparisons and say what picture they create. Pupils revise one comparison to make it more vivid.';
const EXIT = '**Exit ticket (5 minutes):** Pupils write one simile and one metaphor about the same subject, then label each and explain the effect of one.';
const SHARE_15 = '**Share and improve (15 minutes):** Partners identify each other’s comparisons and say what picture they create. Pupils revise one comparison to make it more vivid. Invite a few pupils to share their revised sentences.';

/** The lesson sequence, with the earlier turn's "remove the exit ticket" change still waiting on it. */
const sequence: BlockFixture = { ...ol([...STEPS, SHARE, EXIT], 'sequence'), suggested: ol([...STEPS, SHARE_15]).content };
const LESSON = {
  name: 'Primary 7 lesson plan',
  blocks: [h('# Metaphors and similes: Primary 7 lesson plan'), p('**Duration:** 60 minutes'), h('## Lesson sequence'), sequence, h('## Assessment'), p('Use the exit tickets to identify pupils who still confuse similes with metaphors.')],
};
const history = [{ prompt: 'Can you edit the lesson plan to remove the exit ticket.', reply: 'I’ve suggested removing the exit ticket and giving its five minutes to the sharing activity.' }];
const DOC = LESSON.name;

describe('Editing mode with an earlier suggestion waiting', () => {
  evalCase(
    'a request about another part of the block leaves the earlier suggestion waiting',
    { docs: [LESSON], history, editMode: 'edit', prompt: 'Can you update the guided practice section to make it bullet points.' },
    // The earlier suggestion is on two items (a change to one, the other deleted): both still waiting.
    [noRejectedEdits, liveMatches(DOC, /Exit ticket/), liveDoesNotMatch(DOC, /Share and improve \(15 minutes\)/), waitingAfter(2), marksRevision(false), docMatches(DOC, /^\s*- /m)],
  );

  evalCase(
    'a direct request to make the suggested change puts it straight in',
    { docs: [LESSON], history, editMode: 'edit', prompt: 'Yes, go ahead and take the exit ticket out as you suggested.' },
    [noRejectedEdits, liveDoesNotMatch(DOC, /Exit ticket \(5/), liveMatches(DOC, /Share and improve \(15 minutes\)/), waitingAfter(0), marksRevision(true)],
  );

  evalCase(
    'a request that implies the suggested change puts it straight in',
    { docs: [LESSON], history, editMode: 'edit', prompt: 'That works, but call the sharing activity “Share, improve and reflect”.' },
    [noRejectedEdits, liveMatches(DOC, /Share, improve and reflect/), liveDoesNotMatch(DOC, /Exit ticket \(5/), waitingAfter(0), marksRevision(true)],
  );
});
