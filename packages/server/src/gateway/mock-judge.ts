/**
 * The mock's Spyglass judge: flags each finding the turn removed or changed, so the judge's path
 * and the callout can be tried offline (and in the browser tests). Deterministic, like the rest
 * of the mock.
 */
import { JUDGE_TOOL_NAME } from './judge-prompt.js';

export function mockJudgeArguments(message: string): string {
  const flags = [...message.matchAll(/^(E\d+) (removed|changed)[^:]*: (.*)$/gm)].map(([, ref, kind, text]) => ({
    findings: [ref],
    label: kind,
    title: `“${firstWords(text!)}” ${kind}`,
    why: '(mock) Not asked for.',
  }));
  return JSON.stringify({ flags });
}

/** The first few words of a quoted text, without Markdown marks. */
function firstWords(quoted: string): string {
  const words = quoted.replace(/^"|".*$/g, '').replace(/[*_#]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ') + (words.length > 3 ? '…' : '');
}

export const isJudgeRequest = (toolChoice: unknown) => typeof toolChoice === 'object' && toolChoice !== null && (toolChoice as { name?: unknown }).name === JUDGE_TOOL_NAME;
