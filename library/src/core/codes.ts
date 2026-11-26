/**
 * Curriculum for Excellence codes, such as `MNU 2-03a`: three or four capitals, a level digit
 * (0 Early to 4 Fourth), a two-digit number and usually a letter.
 */
export const LEVEL_NAMES = ['Early', 'First', 'Second', 'Third', 'Fourth'] as const;

/** A code as written in clean text. The global flag makes it usable with matchAll. */
export const CODE_RE = /\b([A-Z]{3,4}) ([0-4])-(\d{2})([a-z]?)\b/g;

/**
 * Codes as they come out of a PDF or a query: stray spaces inside the letters (`L IT`),
 * around the hyphen, en dashes, lower case, and a doubled level digit (`TCH 02-02a`).
 */
const LOOSE_RE = /\b([A-Za-z](?: ?[A-Za-z]){2,3}) ?0?([0-4]) ?[-–‑] ?(\d{2})([a-z]?)(?![A-Za-z])/g;

export interface Code {
  subject: string;
  level: number;
  number: number;
  letter: string;
  text: string;
}

export function parseCode(text: string): Code | null {
  const m = /^([A-Z]{3,4}) ([0-4])-(\d{2})([a-z]?)$/.exec(text);
  if (!m) return null;
  return { subject: m[1]!, level: Number(m[2]), number: Number(m[3]), letter: m[4]!, text };
}

/** In `RME 0-07a / 1-07a`, the second code takes its letters from the one before. */
function expandBareCodes(clean: string): string {
  let out = clean;
  for (;;) {
    const next = out.replace(/\b([A-Z]{3,4}) ([0-4]-\d{2}[a-z]?)(\s*\/\s*)([0-4]-\d{2}[a-z]?)\b/, '$1 $2$3$1 $4');
    if (next === out) return out;
    out = next;
  }
}

/** Replaces each messy code in the text with its clean form. */
export function normaliseCodes(text: string): string {
  const clean = text.replace(LOOSE_RE, (_all, letters: string, level: string, num: string, letter: string) => {
    return `${letters.replace(/ /g, '').toUpperCase()} ${level}-${num}${letter}`;
  });
  return expandBareCodes(clean);
}

/** Finds codes in messy text and returns them in their clean form, in order. */
export function findLooseCodes(text: string): string[] {
  return [...normaliseCodes(text).matchAll(CODE_RE)].map((m) => m[0]);
}

/** The text with every messy code taken out. */
export function removeLooseCodes(text: string): string {
  return text.replace(LOOSE_RE, ' ');
}

/** Whether a line holds only codes and their joiners (`/`, `and`, `to`, commas). */
export function isCodeOnly(text: string): boolean {
  const rest = normaliseCodes(text).replace(CODE_RE, '').replace(/[/,;&]|\band\b|\bto\b|\s/g, '');
  return rest.length === 0 && findLooseCodes(text).length > 0;
}

export function levelName(level: number): string {
  return LEVEL_NAMES[level] ?? String(level);
}

/** Sort order for codes: level, then number, then letter, then subject. */
export function compareCodes(a: string, b: string): number {
  const ca = parseCode(a);
  const cb = parseCode(b);
  if (!ca || !cb) return a < b ? -1 : a > b ? 1 : 0;
  return ca.level - cb.level || ca.number - cb.number || ca.letter.localeCompare(cb.letter) || ca.subject.localeCompare(cb.subject);
}
