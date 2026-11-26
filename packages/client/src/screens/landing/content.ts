/**
 * The front page's words, kept apart from its layout. Every claim here comes from the repo's docs
 * (ARCHITECTURE.md, docs/classes.md, docs/spyglass.md, DEPLOY.md, config/sign-in-notice.json):
 * no quotes, numbers, schools or badges that are not true of the tool. Change a claim only when
 * the tool changes.
 */

export type Feature = { id: string; title: string; body: string };
export type Step = { title: string; body: string };
export type Question = { q: string; a: string };

export const HERO_LEAD =
  'Write and adapt worksheets with an AI assistant. A new worksheet goes straight into the document; changes to one that has content come as suggestions you accept or reject.';

/** The first screen's facts: where it runs, how changes arrive, and Word. */
export const HERO_FACTS = ["Runs on ELM, the University of Edinburgh's AI platform", 'Changes to your work come as suggestions', 'Word documents in and out'];

/** The front page's two doors (#224, wording agreed with Sam) and the who screen behind them. */
export const SIGN_UP = 'Sign up';
export const LOG_IN = 'Log in';
export const WHO_TITLE = { signup: SIGN_UP, login: LOG_IN } as const;
export const WHO_LEAD = 'Are you a teacher or a pupil?';
export const WHO_TEACHER = 'I am a teacher';
export const WHO_PUPIL = 'I am a pupil';

export const FEATURES: Feature[] = [
  {
    id: 'worksheets',
    title: 'Writes worksheets with you',
    body: 'Ask for a worksheet, quiz or reading passage. A new one goes straight in; changes to one with content are suggestions you accept or reject.',
  },
  {
    id: 'adapt',
    title: 'Makes copies for different needs',
    body: 'Simpler wording or fewer questions to a page, set in Lexend or OpenDyslexic, with writing lines for answers.',
  },
  {
    id: 'classes',
    title: 'Knows your classes',
    body: 'Pupils are made-up labels with their needs. Start a chat from a class so the assistant knows who the work is for.',
  },
  {
    id: 'curriculum',
    title: 'Picks outcomes from the curriculum',
    body: 'Choose the Curriculum for Excellence experiences and outcomes a class is working on, by area, level or code.',
  },
  {
    id: 'pedagogy',
    title: 'Suggests adaptations from a library',
    body: 'Needs are barriers, not diagnoses. Choose approaches for a pupil, marked as confirmed or trialling.',
  },
  {
    id: 'spyglass',
    title: 'Checks each turn with Spyglass',
    body: 'Turn it on under the chat box. It says when a turn changed more than you asked.',
  },
];

export const STEPS: Step[] = [
  { title: 'Ask', body: 'Say what you need in the chat. Mention a class or a document for context.' },
  { title: 'Read', body: 'The changes appear in the document, new words in green, with a short reply.' },
  { title: 'Decide', body: 'Accept or reject each change, or edit it yourself. Editing mode writes straight in.' },
  { title: 'Check', body: 'With Spyglass on, a note under the reply flags anything you did not ask for.' },
];

export const FOR_SCHOOLS: Feature[] = [
  {
    id: 'elm',
    title: 'Runs on ELM',
    body: "Every request goes through ELM, the University of Edinburgh's AI platform. You choose the model under the chat box.",
  },
  {
    id: 'pupils',
    title: 'Uses labels, never pupil names',
    body: "We provide a way for you to store key information about your pupils' accessibility needs without revealing identifiable information.",
  },
  {
    id: 'workspace',
    title: 'Gives each teacher a workspace',
    body: 'Open yours with a private link, an access code, or Google or Microsoft sign-in.',
  },
  {
    id: 'research',
    title: 'Records your work for the study',
    body: 'Your typing, chats and files are saved and may be read by the research team. Ethics approval reference 541809.',
  },
];

export const QUESTIONS: Question[] = [
  {
    q: 'What is ELM?',
    a: "ELM is the University of Edinburgh's AI platform. This tool sends the assistant's requests to the models ELM offers.",
  },
  {
    q: 'How do I get in?',
    a: 'Choose Sign up, then I am a teacher. With an access code from the research team, type it to open your workspace. With an invite code, sign up with Google or Microsoft, then choose Log in next time.',
  },
  {
    q: 'Will the assistant change my worksheet without asking?',
    a: 'Not unless you let it. Changes to a worksheet that has content come as suggestions you accept or reject, unless you choose Editing under the chat box. A new worksheet goes straight in, and you can change or delete it as you like.',
  },
  {
    q: "Can I put my pupils' details in?",
    a: 'No. Describe pupils by a made-up label and what they need, never a name.',
  },
  {
    q: 'What is recorded, and who sees it?',
    a: 'This is a research tool. What you type, your chats with the assistant and the files you add are saved and may be read by the research team. The information sheet explains how your data is used and your rights as a participant.',
  },
  {
    q: 'Can I take my worksheets elsewhere?',
    a: 'Yes. Download any worksheet as a Word document, to print, share or keep working on in Word.',
  },
  {
    q: 'Who shapes what it does next?',
    a: 'Teachers. It is built with the teachers who use it, and their feedback in the sessions shapes the plan.',
  },
];
