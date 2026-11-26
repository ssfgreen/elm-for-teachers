/**
 * The demo class: P7A from the study's fictional SEEMiS register (docs/study-design.md,
 * Appendix C; the printout Sam shared on 12 Nov 2026). Names, Scottish Candidate Numbers and
 * dates of birth are left out, as a teacher would leave them out: each pupil is a made-up
 * label with what helps them, and a note on three of them as a teacher might write it (a need, a
 * recent grade). The register's needs and grades are not stored as their own fields since #243.
 * Labels are fixed so the demo reads the same every time.
 */
import type { PupilFields } from '@edw/shared';

/** Fictional, as the register is. */
export const DEMO_SCHOOL = 'Braeside Primary School (demo)';
export const DEMO_YEAR_GROUP = 'P7';

export const DEMO_CLASS = {
  name: 'P7A',
  stage: 'Primary 7, Second level',
  subject: null,
  note: [
    '20 pupils aged 11 to 12, in Term 2. Six have additional support needs (three with dyslexia, each different; two autistic; two with ADHD, one of them also autistic) and three are high achievers.',
    'Made from the class register with names, candidate numbers and dates of birth left out.',
  ].join('\n\n'),
};

export const DEMO_PUPILS: PupilFields[] = [
  { label: 'brave-kettle' },
  { label: 'quiet-comet', helps: 'Extensions helpful for engagement.' },
  {
    label: 'tidy-puffin',
    helps: 'Needs amber reading overlay for all printed text. Prefers Comic Sans 14pt on handouts. Does not need extra time for reading in class, only in assessments.',
    note: 'Dyslexic. Reads slowly and loses their place in long paragraphs; spelling is weak but their ideas are strong.',
  },
  { label: 'jolly-teapot' },
  { label: 'calm-lantern', helps: 'Visual timetable on desk, 5 minute warning before transitions. Sits near the door.' },
  { label: 'swift-otter', note: 'Grade A and doing well across the board. Often finishes early and is ready for more challenge.' },
  {
    label: 'bouncy-compass',
    helps: 'Movement break every 20 to 25 minutes (classroom jobs work well). Wobble cushion. Chunk written tasks into 3 steps max. Medication at 12:15, office holds supply.',
  },
  { label: 'cosy-acorn' },
  { label: 'eager-tugboat' },
  { label: 'clever-walrus' },
  {
    label: 'steady-crayon',
    helps: 'Massively supported by text to speech. Typing instead of handwriting for extended writing. Spelling not penalised in content marking.',
  },
  { label: 'humble-pebble' },
  { label: 'nifty-scone' },
  { label: 'gentle-badger', helps: 'Individual workstation available when overwhelmed. Now, next, then board. Key adult is Mrs Paterson (PSA).' },
  { label: 'proud-giraffe' },
  { label: 'sturdy-tractor' },
  {
    label: 'mellow-thimble',
    helps: 'Reads instructions aloud 1:1 before independent tasks. No overlay needed.',
  },
  { label: 'snowy-kite', note: 'Grade F in the latest assessment, so not yet passing. Struggling with written answers and losing confidence.' },
  { label: 'lucky-hedgehog' },
  { label: 'perky-rocket', helps: 'Needs pushing.' },
];
