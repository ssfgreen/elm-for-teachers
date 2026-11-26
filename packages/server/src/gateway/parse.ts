/**
 * Splits a raw model reply into the chat message and the raw operations array
 * (dev spec §5, output contract). Shape checking of the operations is validate.ts's job.
 *
 * Rules:
 * - Line endings are normalised to LF first.
 * - Candidate fences are ```json (any case) and bare ``` fences. The first candidate whose
 *   body parses as a JSON array supplies the operations; the message is everything outside
 *   that fence, trimmed.
 * - A ```json fence that does not parse as an array, or that is never closed (typically a
 *   reply cut off by the token limit), sets `parseError`. A bare fence that does not parse is
 *   treated as ordinary text (the model may quote an example sentence in a fence) unless its
 *   body starts with `[`, in which case it is clearly a broken operations block.
 * - If there is no fence and the whole reply is a JSON array, that array is the operations
 *   and the message is empty.
 */
export interface ParsedModelOutput {
  message: string;
  rawOperations: unknown[] | null;
  parseError: string | null;
}

const FENCE = /```([A-Za-z]*)[ \t]*\n([\s\S]*?)```/g;

function tryParseArray(text: string): { value: unknown[] } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { error: `invalid JSON: ${(err as Error).message}` };
  }
  if (!Array.isArray(value)) return { error: 'JSON block is not an array' };
  return { value };
}

export function parseModelOutput(raw: string): ParsedModelOutput {
  const text = raw.replace(/\r\n?/g, '\n');
  let firstError: { error: string; start: number; end: number } | null = null;

  for (const m of text.matchAll(FENCE)) {
    const lang = (m[1] ?? '').toLowerCase();
    if (lang !== '' && lang !== 'json') continue;
    const body = (m[2] ?? '').trim();
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const parsed = tryParseArray(body);
    if ('value' in parsed) {
      return {
        message: (text.slice(0, start).trimEnd() + '\n\n' + text.slice(end).trimStart()).trim(),
        rawOperations: parsed.value,
        parseError: null,
      };
    }
    if (!firstError && (lang === 'json' || body.startsWith('['))) {
      firstError = { error: parsed.error, start, end };
    }
  }

  if (firstError) {
    return {
      message: (text.slice(0, firstError.start) + text.slice(firstError.end)).trim(),
      rawOperations: null,
      parseError: firstError.error,
    };
  }

  // A ```json opener with no closing fence.
  const open = /```json[ \t]*\n/i.exec(text);
  if (open) {
    return {
      message: text.slice(0, open.index).trim(),
      rawOperations: null,
      parseError: 'unterminated ```json fence',
    };
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    const parsed = tryParseArray(trimmed);
    if ('value' in parsed) return { message: '', rawOperations: parsed.value, parseError: null };
  }
  return { message: trimmed, rawOperations: null, parseError: null };
}
