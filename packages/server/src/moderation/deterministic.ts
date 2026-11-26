/**
 * Deterministic pre-save PII scanner (T2).
 * Detects personal identifiers (emails, UK postcodes, UK phone numbers, dates of birth,
 * and explicit pupil-name patterns) without returning or storing matched values.
 */

export type PiiCategory = 'email' | 'uk_postcode' | 'uk_phone' | 'date_of_birth' | 'pupil_name';

export interface DeterministicScanResult {
  categories: PiiCategory[];
  /** Count of matches per category — never raw matched text. */
  redactions: Partial<Record<PiiCategory, number>>;
}

const RULES: readonly { category: PiiCategory; pattern: RegExp }[] = [
  { category: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  {
    category: 'uk_postcode',
    pattern: /\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][0-9][0-9A-HJKSTUW]?|[A-PR-UWYZ][A-HK-Y][0-9][0-9ABEHMNPRVWXY]?)\s?[0-9][ABD-HJLNP-UW-Z]{2})\b/gi,
  },
  {
    category: 'uk_phone',
    pattern: /(?:\+44\s?(?:7\d{3}|[123]\d{2,3})|\b0(?:7\d{3}|[123]\d{2,3}))[\s-]?\d{3}[\s-]?\d{3,4}\b/g,
  },
  {
    category: 'date_of_birth',
    pattern: /\b(?:dob|d\.o\.b\.?|date of birth|born)\s*[:-]?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi,
  },
  {
    category: 'pupil_name',
    pattern: /\b(?:(?:[Pp]upil|[Ss]tudent|[Cc]hild|[Ll]earner)\s*[:-]|(?:[Mm]y pupil|[Pp]upil named|[Ss]tudent named|[Cc]hild named|[Cc]alled))\s+[A-Z][a-z]{1,25}(?:\s+[A-Z][a-z]{1,25})?\b/g,
  },
];

const CATEGORY_HINT: Record<PiiCategory, string> = {
  email: 'an email address',
  uk_postcode: 'a UK postcode',
  uk_phone: 'a phone number',
  date_of_birth: 'a date of birth',
  pupil_name: 'a pupil name',
};

export function scanDeterministicPii(text: string): DeterministicScanResult {
  const categories: PiiCategory[] = [];
  const redactions: Partial<Record<PiiCategory, number>> = {};
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    const matches = text.match(rule.pattern);
    if (matches && matches.length > 0) {
      categories.push(rule.category);
      redactions[rule.category] = matches.length;
    }
  }
  return { categories, redactions };
}

/** Human-readable guidance that names only categories, never the rejected text. */
export function piiHintMessage(categories: readonly string[]): string {
  const labels = categories.map((c) => CATEGORY_HINT[c as PiiCategory] ?? c);
  const what = labels.length ? labels.join(', ') : 'personal information';
  return `This text appears to include ${what}. Remove any pupil names or personal details and try again.`;
}
