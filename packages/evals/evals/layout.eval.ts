/**
 * Layout, from the workshop telemetry (P01 to P04, Nov 2026). The model cannot see the page, so
 * teachers asked it to fix table spacing (three of four as their first prompt), writing lines,
 * gaps and page ends, and then fixed what it got wrong by hand. Each case is a teacher's own
 * prompt on the worksheet they had, judged by the layout check (src/layout-judges.ts), the
 * same one the model is offered as check_layout. Run with: pnpm eval -t "Layout"
 */
import { describe } from 'vitest';
import { docChanged, docHasTable, docKeeps, docMatches, docDoesNotMatch, didNotUseTool, noRejectedEdits } from '../src/judges.js';
import { SIMILES, SIMILES_MESSY, SOURCES, TRENCHES, TRENCHES_BARE, TRENCHES_LONG, VOCABULARY } from '../src/layout-fixtures.js';
import { gapBetween, layoutClean, layoutCleanWhere, layoutNoWorse, pageBreakBefore, pagesAtMost } from '../src/layout-judges.js';
import { evalCase } from '../src/suite.js';

/** Room to edit, check the layout, fix what it finds and check again. */
const FIX = { budget: { steps: 6, uncachedInput: 12_000 } };

/** Writing lines as <line/>, which reach the margin in any font, rather than counted underscores. */
const usesLines = (doc: string) => docMatches(doc, /<line\/>/);

const similesRows = docHasTable(SIMILES.name, /classroom was a zoo/, /pigsty/);
const questions = (doc: string) => docKeeps(doc, 'Why was poor hygiene a problem for soldiers?', 'What was the food like for soldiers on the front line?');

describe('Layout: table columns', () => {
  for (const prompt of ['Improve the spacing for the table', 'Tidy up the columns']) {
    evalCase(
      `“${prompt}” (P01, P02): columns fit their content`,
      { docs: [SIMILES], prompt },
      [layoutClean(SIMILES.name, 'tables'), similesRows, layoutNoWorse(SIMILES.name, SIMILES.blocks, 'lines', 'spacing', 'pages'), noRejectedEdits],
      FIX,
    );
  }

  evalCase(
    '“Improve the spacing of the table” (P03): a long source column gets the room',
    { docs: [SOURCES], prompt: 'Improve the spacing of the table' },
    [layoutClean(SOURCES.name, 'tables'), docHasTable(SOURCES.name, /Declaration of Arbroath/, /English monk/), noRejectedEdits],
    FIX,
  );
});

describe('Layout: writing lines', () => {
  evalCase(
    '“Extend this line to the end of the page” (P04): the line reaches the margin and no further',
    { docs: [TRENCHES], prompt: 'Extend this line to the end of the page', anchor: { key: 'task1', quote: '_'.repeat(46) } },
    [docMatches(TRENCHES.name, /muddy or flooded[^\n]*\n\s*(?:_{40,}|<line\/>)/), usesLines(TRENCHES.name), layoutCleanWhere(TRENCHES.name, /muddy or flooded/, 'lines'), questions(TRENCHES.name), noRejectedEdits],
    FIX,
  );

  evalCase(
    '“remove the ... and replace with lines” (P04): full-width lines in place of the ellipsis',
    { docs: [TRENCHES], prompt: 'remove the ... and replace with lines for a pupil to write their response', anchor: { key: 'task1#2', quote: '…' } },
    [docMatches(TRENCHES.name, /poor hygiene a problem for soldiers\?[^\n]*\n\s*(?:_{20,}|<line\/>)/), usesLines(TRENCHES.name), docDoesNotMatch(TRENCHES.name, /poor hygiene a problem for soldiers\? …/), layoutCleanWhere(TRENCHES.name, /poor hygiene/, 'lines'), noRejectedEdits],
    FIX,
  );

  evalCase(
    '“Make this section write on” (P04): every question gets full-width lines, kept on its page',
    { docs: [TRENCHES_BARE], prompt: 'Make this section "write on" so that pupils can write their response below each question.', anchor: { key: 'task1' } },
    [
      ...[/muddy or flooded/, /poor hygiene/, /lice affect/, /rats cause/, /food like/].map((q) => docMatches(TRENCHES_BARE.name, new RegExp(`${q.source}[^\\n]*\\n\\s*(?:_{20,}|<line\\/>)`))),
      usesLines(TRENCHES_BARE.name),
      layoutClean(TRENCHES_BARE.name, 'lines', 'pages'),
      questions(TRENCHES_BARE.name),
      noRejectedEdits,
    ],
    FIX,
  );

  evalCase(
    'a new worksheet with writing lines comes out with full-width lines and tidy spacing',
    { docs: [{ name: 'Untitled', blocks: [] }], prompt: 'Create a short P6 homework sheet on similes: a name and date line, four questions, and two lines under each question for pupils to write their answer.' },
    [layoutClean('Untitled', 'lines', 'spacing', 'tables'), usesLines('Untitled'), pagesAtMost('Untitled', 2), docMatches('Untitled', /simile/i), noRejectedEdits],
    FIX,
  );
});

describe('Layout: spacing', () => {
  evalCase(
    '“space the instructions” (P01): space without runs of empty paragraphs',
    { docs: [SIMILES], prompt: 'space the instructions' },
    [docChanged(SIMILES.name), layoutClean(SIMILES.name, 'spacing'), layoutNoWorse(SIMILES.name, SIMILES.blocks, 'pages'), noRejectedEdits],
    FIX,
  );

  evalCase(
    '“Add space between the definitions” (P01): no paragraph of only a space',
    { docs: [SIMILES], prompt: 'Add space between the definitions of a simile and metaphor', anchor: { key: 'simile' } },
    [gapBetween(SIMILES.name, /A simile\*\* compares/, /A metaphor\*\* says/), docKeeps(SIMILES.name, '**A simile** compares two things', '**A metaphor** says something **is** something else'), layoutClean(SIMILES.name, 'spacing'), noRejectedEdits],
    FIX,
  );

  evalCase(
    'uneven gaps made with empty paragraphs (P01, P04): made even, content kept',
    { docs: [SIMILES_MESSY], prompt: 'Tidy up the spacing so the gaps between the sections are even.' },
    [layoutClean(SIMILES_MESSY.name, 'spacing'), docKeeps(SIMILES_MESSY.name, '## Task 1: Simile or metaphor? *(5 minutes)*', '## Task 2: Finish the sentences *(5 minutes)*'), similesRows, noRejectedEdits],
    FIX,
  );
});

describe('Layout: page ends', () => {
  evalCase(
    'a sheet a few lines over a page (P04): brought onto one page without losing a question',
    { docs: [TRENCHES_LONG], prompt: 'This runs onto a second page by a few lines. Can you make it fit on one page without cutting any of the questions?' },
    [pagesAtMost(TRENCHES_LONG.name, 1), questions(TRENCHES_LONG.name), layoutNoWorse(TRENCHES_LONG.name, TRENCHES_LONG.blocks, 'lines'), noRejectedEdits],
    FIX,
  );

  evalCase(
    '“start task 2 on a new page” (P01): a page break before it, and no page left near empty',
    { docs: [SIMILES], prompt: 'start task 2 on a new page' },
    [pageBreakBefore(SIMILES.name, /## Task 2/), layoutClean(SIMILES.name, 'pages'), noRejectedEdits],
    { budget: { steps: 4 } },
  );

  evalCase(
    'a table that leaves its last row alone on page 2: rows kept together',
    { docs: [VOCABULARY], prompt: 'When I print this, the last row of the vocabulary table ends up on its own on page 2. Can you sort it?' },
    [layoutClean(VOCABULARY.name, 'pages'), docHasTable(VOCABULARY.name, /torrential/, /smog/), noRejectedEdits],
    FIX,
  );
});

describe('Layout: restraint', () => {
  evalCase(
    'a one-word change (P01, P02, P04) does not set off a layout check',
    { docs: [SIMILES], prompt: 'This is actually class P7B', anchor: { key: 'name', quote: 'P7' } },
    [docMatches(SIMILES.name, /P7B/), didNotUseTool('check_layout'), noRejectedEdits],
    { budget: { steps: 2 } },
  );
});
