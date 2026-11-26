import { CODE_RE, findLooseCodes, removeLooseCodes } from './codes.js';

const STOPWORDS = new Set(
  'a an and are as at be by can for from has have how i in is it its my of on or so that the their them these this to was we what when which with you your'.split(' '),
);

/** A code as one search token: `MNU 2-03a` becomes `mnu2-03a`. */
export const codeToken = (code: string) => code.toLowerCase().replace(/ /g, '');

/** Light stemming: enough to match `fractions` with `fraction` and `counting` with `count`. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Words of clean text, lower case and stemmed, with each code kept whole. */
export function tokenise(text: string): string[] {
  const out: string[] = [];
  const rest = text.replace(CODE_RE, (code) => {
    out.push(codeToken(code));
    return ' ';
  });
  for (const word of rest.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length === 0 || STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

export interface Query {
  terms: string[];
  /** Codes named in the query, clean. A code without its letter (`MNU 2-03`) is a prefix. */
  codes: string[];
  phrase: string;
}

/** A search query: codes are found however loosely they are typed, and the rest is words. */
export function parseQuery(query: string): Query {
  const codes = findLooseCodes(query);
  const terms = [...new Set([...tokenise(removeLooseCodes(query)), ...codes.map(codeToken)])];
  return { terms, codes, phrase: query.trim().toLowerCase() };
}
