/**
 * What goes to the model for a pupil's ask (#214), and nothing else (as agreed in #152, answer 90):
 *
 *   1. the class's safety instruction (else config's default), as the system message;
 *   2. the reading's words;
 *   3. the passage the pupil highlighted;
 *   4. the prompt's hidden instruction, written by the teacher;
 *   5. for a follow-up, the earlier asks of the chain with their replies.
 *
 * No class name, pupil label, member or pupil id, sign-in provider or name: the function is not
 * given them. Pure; `request.test.ts` pins its output with a snapshot.
 */

/** One earlier ask of the chain: its passage, its instruction and the reply it got. */
export interface EarlierAsk {
  highlighted_text: string;
  instruction: string;
  reply: string;
}

export interface AskParts {
  safety_instruction: string;
  /** The reading's words as the pupil's page shows them (article.ts `readingText`, through shared `readerBlock`). */
  article: string;
  highlighted_text: string;
  instruction: string;
  /** Oldest first; empty for a first ask. */
  chain: readonly EarlierAsk[];
}

export interface ReaderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskRequest {
  instructions: string;
  input: ReaderMessage[];
}

/** Format and control characters (zero-width space, joiners, NUL and the like), allowed anywhere in a fence tag. */
const HIDDEN = '[\\p{Cf}\\p{Cc}]*';
const SPACE = '[\\s\\p{Cf}\\p{Cc}]*';
const tagName = (name: string) => [...name].map((ch) => ch + HIDDEN).join('');

/**
 * A reading or highlight tag, in any case: `<`; space, format or control characters; optionally
 * `/` and more of them; the name, with format or control characters (not space) between and after
 * its letters; then space, `/` or `>`, anything but `<` or `>`, and `>`. So `</reading x="1">`,
 * `</reading/>`, `< /reading>`, `</read\u200Bing>` and `</reading\u0000>` are tags, and
 * `<readings>` is not. No two runs of the same characters sit side by side and `[^<>]` stops at
 * the next `<`, so the match stays linear.
 */
const FENCE = new RegExp(`<${SPACE}(?:\\/${SPACE})?(?:${tagName('reading')}|${tagName('highlight')})(?=[\\s/>])[^<>]*>`, 'giu');

/**
 * The fences around the reading and the passage cannot be closed from inside them: their tags
 * (`FENCE`) are taken off until none is left, so one hidden inside another
 * (`</rea</reading>ding>`) goes too. Text outside a tag is kept as it is.
 */
function fenced(text: string): string {
  let before: string;
  do {
    before = text;
    text = text.replace(FENCE, '');
  } while (text !== before);
  return text;
}

/** One ask as the user message: the reading (first ask only), the passage, then the instruction. */
function askMessage(highlighted: string, instruction: string, article: string | null): string {
  const reading = article === null ? '' : `The text the pupil is reading:\n<reading>\n${fenced(article)}\n</reading>\n\n`;
  return `${reading}The part the pupil highlighted:\n<highlight>\n${fenced(highlighted)}\n</highlight>\n\n${instruction}`;
}

export function askRequest(p: AskParts): AskRequest {
  const asks = [...p.chain, { highlighted_text: p.highlighted_text, instruction: p.instruction, reply: null }];
  const input: ReaderMessage[] = [];
  for (const [i, a] of asks.entries()) {
    input.push({ role: 'user', content: askMessage(a.highlighted_text, a.instruction, i === 0 ? p.article : null) });
    if (a.reply !== null) input.push({ role: 'assistant', content: a.reply });
  }
  return { instructions: p.safety_instruction, input };
}

/** The request's size in UTF-8 bytes, for its worst cost (gateway/calls.ts `worstCostGbp`). */
export const requestBytes = (r: AskRequest): number => Buffer.byteLength(JSON.stringify(r), 'utf8');
