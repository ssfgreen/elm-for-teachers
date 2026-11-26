import type { AgentRequest, AgentStep, ChatMessage, Operation, ProviderAdapter, ProviderResult } from '@edw/shared';
import { BLANK_DOC_NOTE } from './editMode.js';
import { ProviderError } from './errors.js';
import { parseModelOutput } from './parse.js';
import { SUMMARY_SYSTEM_PROMPT } from './summary.js';
import { REFERENCE_SUMMARY_PROMPT } from '../references/summary.js';
import { DESIGN_INSTRUCTIONS } from '@edw/shared';
import { JUDGE_TOOL_NAME } from './judge-prompt.js';
import { isJudgeRequest, mockJudgeArguments } from './mock-judge.js';
import { mockClassMentions } from './mock-class.js';

/**
 * Deterministic offline provider, used when no API key is configured so the whole app can be
 * reviewed end to end. It reads the prompt layout produced by prompt.ts: the last user message
 * holds the thread's documents (the open one marked `; open`), a `---` line, an optional
 * @model line, then `Teacher: <prompt>`.
 *
 * Behaviour, first matching rule wins ("empty" = the open doc has no block with content):
 *  0. an @model comment on a block: a `replace` of that block with a reworded version, or, when
 *     the prompt says "shorter", without its first word (words taken out, nothing added).
 *  0a. non-empty open doc, and the prompt asks for a "copy" or "duplicate": `create_doc` with
 *     `copy_of` the open doc (no copy is made while suggestions wait there, until the teacher chooses).
 *  1. the prompt asks for a new document ("new doc", "new document", "another document",
 *     "separate"): `create_doc` plus a short simpler version filled through its temp id.
 *  2. empty open doc, and the prompt mentions "worksheet", or metaphor/simile without being a
 *     question: a sample worksheet as inserts, all `after: "start"` in document order (see the
 *     insert ordering convention in validate.ts). Also in a doc with text in it when the prompt
 *     asks to "write" or "draft" a worksheet (and rule 3 does not match, which is tried first in
 *     a doc with text): an empty doc takes the turn straight in
 *     (canvas/newDocs.ts), so this is how a test or a reviewer gets a worksheet of suggestions.
 *  3. non-empty open doc, and the prompt mentions adapt/simplify/easier/support/dyslexia/ADHD:
 *     a support heading and list inserted after the open doc's last block.
 *  4. the prompt mentions the background or page colour: a `set_style` suggesting pale green
 *     (told the open doc is blank, `BLANK_DOC_NOTE`, it says the page is green, not suggested).
 *  5. the prompt ends with "?" or mentions "explain"/"difference": a chat-only explanation.
 *  6. otherwise: a one-sentence offer of help, no JSON.
 * No randomness, no clock: the same input always yields the same output.
 *
 * Agent mode (`respond`): the same reply, as an agent would give it. Asked fresh, it calls
 * `edit_document` with the reply's operations (when there are any); once that call is
 * answered, or with no operations, it writes the reply's message.
 */
export class MockProvider implements ProviderAdapter {
  /** `streamDelayMs`: the pause between streamed chunks, so the app shows the reply arriving. */
  constructor(
    readonly model: string,
    readonly temperature: number,
    private readonly streamDelayMs = 0,
  ) {}

  async complete(messages: ChatMessage[], system: string): Promise<ProviderResult> {
    return {
      text:
        system === SUMMARY_SYSTEM_PROMPT
          ? mockSummary(messages)
          : system === REFERENCE_SUMMARY_PROMPT
            ? mockReferenceSummary(messages)
            : system === DESIGN_INSTRUCTIONS
              ? mockDesign(messages)
              : mockReply(messages),
      input_tokens: null,
      output_tokens: null,
      provider_request_id: `mock-${fnv1a(system + '\u0000' + JSON.stringify(messages))}`,
      request: { model: this.model, messages: [{ role: 'system', content: system }, ...messages] },
    };
  }

  async respond(request: AgentRequest, onText?: (delta: string) => void, signal?: AbortSignal, onReasoning?: (parts: string[]) => void): Promise<AgentStep> {
    const items = request.input as { role?: unknown; content?: unknown; type?: unknown }[];
    const messages = items
      .filter((i): i is ChatMessage => (i.role === 'user' || i.role === 'assistant') && typeof i.content === 'string')
      .map((i) => ({ role: i.role, content: i.content }));
    const lastUser = items.map((i) => i.role).lastIndexOf('user');
    const answered = items.slice(lastUser + 1).some((i) => i.type === 'function_call_output');
    const reply = parseModelOutput(mockReply(messages));
    const base = { input_tokens: null, output_tokens: null, provider_request_id: `mock-${fnv1a(JSON.stringify(request.input))}`, request };
    // A short reasoning summary, streamed in pieces like a real one, so the chat's steps show locally.
    const reasoning = [answered ? '**Writing the reply**\n\nThe edits are in, so I say briefly what changed.' : '**Reading the request**\n\nWorking out what the teacher wants changed, and where in the document.'];
    let so = '';
    for (const piece of chunks(reasoning[0]!)) {
      await this.pause(signal);
      so += piece;
      onReasoning?.([so]);
    }
    if (isJudgeRequest(request.toolChoice)) {
      const call = { call_id: 'call_judge', name: JUDGE_TOOL_NAME, arguments: mockJudgeArguments(messages.at(-1)?.content ?? '') };
      return { ...base, text: '', toolCalls: [call], output: [{ type: 'function_call', ...call }] };
    }
    if (!answered && request.toolChoice !== 'none' && reply.rawOperations?.length) {
      const call = { call_id: `call_${fnv1a(JSON.stringify(reply.rawOperations))}`, name: 'edit_document', arguments: JSON.stringify({ operations: reply.rawOperations }) };
      return { ...base, text: '', toolCalls: [call], output: [{ type: 'function_call', ...call }], reasoning };
    }
    const text = reply.message + mockCitation(items) + mockClassMentions(items);
    for (const chunk of chunks(text)) {
      await this.pause(signal);
      onText?.(chunk);
    }
    return { ...base, text, toolCalls: [], output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], reasoning };
  }

  /** The same reply as `complete`, in chunks of a few words. */
  async stream(messages: ChatMessage[], system: string, onText: (delta: string) => void, signal?: AbortSignal): Promise<ProviderResult> {
    const result = await this.complete(messages, system);
    for (const chunk of chunks(result.text)) {
      await this.pause(signal);
      onText(chunk);
    }
    return result;
  }

  /** The pause between chunks; a stopped request ends here, as a real one would. */
  private async pause(signal?: AbortSignal): Promise<void> {
    if (this.streamDelayMs) await new Promise((r) => setTimeout(r, this.streamDelayMs));
    if (signal?.aborted) throw new ProviderError('aborted', 'the request was stopped');
  }
}

/** A reference file's catalogue line: names the file. */
/** In a class chat with the pedagogy library, a sentence citing its first format rule claim, so the "i" shows offline. */
export function mockCitation(items: readonly { role?: unknown; content?: unknown }[]): string {
  const lib = items.find((i) => i.role === 'developer' && typeof i.content === 'string' && i.content.startsWith('## Pedagogy library'));
  const id = typeof lib?.content === 'string' ? /\[\[(clm-[A-Za-z0-9-]+)\]\]/.exec(lib.content.slice(lib.content.indexOf('### ')))?.[1] : undefined;
  return id ? `\n\nThe layout follows the library's baseline format rules [[${id}]].` : '';
}

function mockReferenceSummary(messages: ChatMessage[]): string {
  const name = /^File name: (.*)$/m.exec(messages.at(-1)?.content ?? '')?.[1] ?? 'file';
  return `(mock) A reference file called ${name}.`;
}

/** A summary call: the summary's headings, with the teacher's requests (from the turns it was given) under Done. */
function mockSummary(messages: ChatMessage[]): string {
  const asks = [...(messages.at(-1)?.content ?? '').matchAll(/^Teacher[^:]*: (.*)$/gm)].map((m) => `- ${m[1]}`);
  const before = /<summary>\n([\s\S]*?)\n<\/summary>/.exec(messages.at(-1)?.content ?? '')?.[1];
  const done = [...(before ? (/## Done\n([\s\S]*?)\n\n## /.exec(before)?.[1] ?? '').split('\n') : []), ...asks].filter(Boolean);
  return ["## Teacher's goal", '- (mock summary)', '', '## Class and constraints', '- None given.', '', '## Done', ...done, '', '## Open requests', 'None.', '', '## Key context', '- None.'].join('\n');
}

/** Text in pieces of four words, as a stream would bring it. */
function chunks(text: string): string[] {
  return (text.match(/\S*\s*/g) ?? []).filter(Boolean).reduce<string[]>((out, w, i) => {
    if (i % 4 === 0) out.push(w);
    else out[out.length - 1] += w;
    return out;
  }, []);
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const PROMPT_MARKER = '\n---\n\n';
const TEACHER = 'Teacher: ';
const ANCHOR_LINE = /commenting on block \[id=([^\]]+)\]/;
const BLOCK_LINE = /^\d+\. \[id=([^\]]+)\] \[type=([^\]]+)\]/;
const DOC_LINE = /^## Document: .* \(id: ([^;)]+)(; open)?\)$/;

interface Parsed {
  docs: string;
  prompt: string;
  anchorId: string | null;
}

function splitLastUser(messages: ChatMessage[]): Parsed {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const at = last.lastIndexOf(PROMPT_MARKER);
  if (at < 0) return { docs: '', prompt: last.trim(), anchorId: null };
  const tail = last.slice(at + PROMPT_MARKER.length);
  const teacherAt = tail.lastIndexOf(TEACHER);
  const preamble = teacherAt < 0 ? '' : tail.slice(0, teacherAt);
  const prompt = (teacherAt < 0 ? tail : tail.slice(teacherAt + TEACHER.length)).trim();
  return { docs: last.slice(0, at), prompt, anchorId: ANCHOR_LINE.exec(preamble)?.[1] ?? null };
}

/** The open doc's id, from its heading line. */
function openDocId(docs: string): string | null {
  for (const line of docs.split('\n')) {
    const d = DOC_LINE.exec(line);
    if (d?.[2] !== undefined) return d[1]!;
  }
  return null;
}

/** Block lines of the open doc: id and the text after the type tag. */
function openDocBlocks(docs: string): { id: string; content: string }[] {
  const out: { id: string; content: string }[] = [];
  let inOpen = false;
  for (const line of docs.split('\n')) {
    const d = DOC_LINE.exec(line);
    if (d) inOpen = d[2] !== undefined;
    const m = inOpen ? BLOCK_LINE.exec(line) : null;
    if (m) out.push({ id: m[1]!, content: line.slice(m[0].length).trim() });
  }
  return out;
}

/** Content of a serialised block line anywhere in the docs, or null when the id is not there. */
function contentOf(docs: string, id: string): string | null {
  const line = docs.split('\n').find((l) => BLOCK_LINE.test(l) && l.includes(`[id=${id}]`));
  return line ? line.slice(line.lastIndexOf(']') + 1).trim() : null;
}

const has = (text: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

function withOps(message: string, ops: Operation[]): string {
  return `${message}\n\n\`\`\`json\n${JSON.stringify(ops, null, 2)}\n\`\`\`\n`;
}

export function mockReply(messages: ChatMessage[]): string {
  const last = splitLastUser(messages);
  const { docs, anchorId } = last;
  // The note that a blank doc takes the turn straight in is not the teacher's words.
  const straightIn = last.prompt.includes(BLANK_DOC_NOTE.trim());
  const prompt = last.prompt.replace(BLANK_DOC_NOTE.trim(), '').trim();
  const open = openDocBlocks(docs);
  const empty = !open.some((b) => b.content.length > 0);
  const isQuestion = prompt.endsWith('?') || has(prompt, 'explain', 'difference');

  if (anchorId) {
    const current = contentOf(docs, anchorId);
    if (current !== null && has(prompt, 'shorter') && /\S\s+\S/.test(current)) {
      return withOps('I have made that part shorter. Accept it if it reads better, or tell me what to change.', [{ op: 'replace', id: anchorId, content: current.replace(/^\S+\s+/, '') }]);
    }
    if (current !== null) {
      return withOps('I have reworded that part so it is clearer. Accept it if it reads better, or tell me what to change.', [
        { op: 'replace', id: anchorId, content: current ? `${current} (clearer version)` : 'Clearer version.' },
      ]);
    }
  }

  const openId = openDocId(docs);
  if (!empty && openId && has(prompt, 'copy', 'duplicate')) {
    return withOps('I have made a copy of the document. It is in the documents list. If the original has suggestions waiting, choose below what the copy is made from.', [
      { op: 'create_doc', temp_id: 'copy', name: 'Copy', copy_of: openId },
    ]);
  }

  if (/\b(new|another|separate)\s+(doc|document)\b/i.test(prompt)) {
    return withOps('I have started a new document with a shorter, simpler version. It is in the documents list.', [
      { op: 'create_doc', temp_id: 'd1', name: 'Simpler version' },
      { op: 'insert', doc: 'd1', after: 'start', type: 'heading', content: '# Metaphors and Similes (short version)' },
      { op: 'insert', doc: 'd1', after: 'start', type: 'bullet_list', content: '- A simile uses **like** or **as**.\n- A metaphor says one thing **is** another.' },
    ]);
  }

  // Before the worksheet rule: "write an easier version of the worksheet" adapts the doc.
  if (!empty && has(prompt, 'adapt', 'simplif', 'easier', 'support', 'dyslexi', 'ADHD')) {
    const last = open.at(-1)!.id;
    return withOps('I have added a short support section to the end of the document.', [
      { op: 'insert', after: last, type: 'heading', content: '## Help for everyone' },
      {
        op: 'insert',
        after: last,
        type: 'bullet_list',
        content: [
          '- Read each sentence aloud with a partner before you decide.',
          '- Look for the words **like** or **as**: they usually show a simile.',
          '- Take a short movement break between the two parts.',
        ].join('\n'),
      },
    ]);
  }

  if ((empty && (has(prompt, 'worksheet') || (has(prompt, 'metaphor', 'simile') && !isQuestion))) || (has(prompt, 'worksheet') && has(prompt, 'write', 'draft'))) {
    return withOps(
      'Here is a draft worksheet on metaphors and similes. It has a short explanation of each, eight sentences to sort, an answer key and a section where pupils write their own. Change anything that does not suit your class.',
      sampleWorksheet(),
    );
  }

  if (/\bbackground\b|\bpage colou?r\b/i.test(prompt)) {
    return withOps(straightIn ? 'I have made the page pale green.' : 'I have suggested a pale green page. Accept it in the comments column.', [{ op: 'set_style', background: 'green' }]);
  }

  if (isQuestion) {
    return 'A simile compares two things using the word "like" or "as", for example "the loch was as smooth as glass". A metaphor makes the comparison directly by saying one thing is another, for example "the classroom was a zoo". A quick check for pupils: if "like" or "as" is doing the comparing, it is a simile.';
  }

  return 'I can draft a worksheet, explain an idea, adapt what is in the document, or start a new document, so just tell me what you need.';
}

const ITEMS: [string, 'metaphor' | 'simile'][] = [
  ['The classroom was a zoo after the bell rang.', 'metaphor'],
  ["Gran's hands were as cold as ice.", 'simile'],
  ['Our dog ran like the wind through the park.', 'simile'],
  ['The stars were diamonds scattered over the night sky.', 'metaphor'],
  ['The loch was as smooth as glass this morning.', 'simile'],
  ['My little brother is a cheeky monkey.', 'metaphor'],
  ['Time is a thief that steals our summer holidays.', 'metaphor'],
  ['The snow lay on the hills like a thick white blanket.', 'simile'],
];

const KEY_REASONS = [
  'the classroom is called a zoo',
  'it uses "as cold as"',
  'it uses "like"',
  'the stars are called diamonds',
  'it uses "as smooth as"',
  'the brother is called a monkey',
  'time is called a thief',
  'it uses "like"',
];

/** The mock's sample worksheet: 12 inserts into the open doc. */
export function sampleWorksheet(): Operation[] {
  const at = { op: 'insert', after: 'start' } as const;
  return [
    { ...at, type: 'heading', content: '# Metaphors and Similes' },
    {
      ...at,
      type: 'paragraph',
      content:
        'A **metaphor** describes something by saying it *is* something else. "The classroom was a zoo" does not mean there were real animals in the room; it tells us the class was noisy and wild.',
    },
    {
      ...at,
      type: 'paragraph',
      content: 'A **simile** compares two things using the word *like* or *as*. "Her smile was as bright as the sun" and "He ran like a cheetah" are both similes.',
    },
    {
      ...at,
      type: 'bullet_list',
      content: [
        '- Metaphor: The snow was a white blanket on the hills.',
        '- Metaphor: My brother is a couch potato.',
        '- Simile: The stars sparkled like diamonds.',
        '- Simile: The bus was as slow as a snail.',
      ].join('\n'),
    },
    { ...at, type: 'heading', content: '## Part 1: Metaphor or simile?' },
    { ...at, type: 'paragraph', content: 'Read each sentence carefully. Write **metaphor** or **simile** on the line.' },
    { ...at, type: 'numbered_list', content: ITEMS.map(([content], i) => `${i + 1}. ${content} ________`).join('\n') },
    { ...at, type: 'heading', content: '## Answer key' },
    { ...at, type: 'numbered_list', content: ITEMS.map(([, key], i) => `${i + 1}. ${key[0]!.toUpperCase()}${key.slice(1)}: ${KEY_REASONS[i]}.`).join('\n') },
    { ...at, type: 'heading', content: '## Part 2: Write your own' },
    {
      ...at,
      type: 'paragraph',
      content:
        'Finish each sentence starter to make a simile or a metaphor. Then write two sentences of your own about our school or your street: one simile and one metaphor. Underline the two things you are comparing.',
    },
    {
      ...at,
      type: 'bullet_list',
      content: ['- The thunder was as loud as ...', '- My bedroom is ...', '- The playground at break time is like ...', '- When I am happy I feel like ...', '- The wind was ...'].join('\n'),
    },
  ];
}

/** The make kit's design step, offline: one plain design built from the teacher's words. */
function mockDesign(messages: ChatMessage[]): string {
  const asked = /A teacher described this feature:\n"""([\s\S]*?)"""/.exec(messages.at(-1)?.content ?? '')?.[1]?.trim() ?? 'A new feature';
  const title = asked.split(/\s+/).slice(0, 4).join(' ');
  const option = (zone: string, parts: unknown[]) => ({ title, goal: `Lets the teacher ${asked.charAt(0).toLowerCase()}${asked.slice(1)}`, zone, pill: `✦ ${title}`, parts, fit: { [zone]: { ok: true, why: 'a good place for it' } } });
  if (/quiz|activit|mark|pupil|interactive|game/i.test(asked)) {
    return JSON.stringify({
      understood: `You want: ${asked}`,
      question: null,
      options: [
        option('toolbar', [
          { type: 'heading', text: 'Make an activity' },
          { type: 'checks', items: ['Multiple choice', 'Fill in the blanks', 'Written answers'], on: [0, 1] },
          { type: 'box', title: 'What pupils see', parts: [
            { type: 'question', text: 'Which one is a simile?', items: ['As brave as a lion', 'He is a lion'], answer: 0 },
            { type: 'blanks', text: 'Her smile was as bright [[as]] the sun.', items: ['as', 'like'] },
          ] },
          { type: 'share', text: 'Similes quiz', code: 'P7-4821' },
        ]),
      ],
    });
  }
  return JSON.stringify({
    understood: `You want: ${asked}`,
    question: null,
    options: [
      option('margin', [
        { type: 'heading', text: title },
        { type: 'text', text: asked },
        { type: 'slider', text: 'How much help', low: 'Less', high: 'More', value: 60 },
        { type: 'row', parts: [{ type: 'select', text: 'For', value: 'This worksheet' }, { type: 'buttons', items: ['Try it'] }] },
      ]),
    ],
  });
}

