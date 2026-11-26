/**
 * `readerCase`: one pupil's ask in the reader (#214), sent as the server sends it: `askRequest`
 * builds what the model gets and `callReader` makes the call, on config `reader.model` under
 * config's safety instruction. Graded on the reply with deterministic checks, and recorded to
 * the run directory like `evalCase` (one call, so one step).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, inject, it } from 'vitest';
import { readingText } from '../../server/src/reader-asks/article.js';
import { askRequest, type EarlierAsk } from '../../server/src/reader-asks/request.js';
import { callReader, readerModel } from '../../server/src/reader-asks/service.js';
import { evalContext } from './context.js';
import type { CheckResult } from './judges.js';
import type { Observation } from './suite.js';

export interface ReaderFixture {
  /** The reading's paragraphs. */
  article: string[];
  highlighted_text: string;
  instruction: string;
  chain?: EarlierAsk[];
}

export type ReaderCheck = (reply: string) => CheckResult;

const check = (name: string, pass: boolean, detail?: string): CheckResult => ({ name, kind: 'behaviour', pass, ...(detail ? { detail } : {}) });

/** The reply is at most `max` characters. */
export const replyAtMost =
  (max: number): ReaderCheck =>
  (reply) =>
    check(`reply at most ${max} characters`, reply.length > 0 && reply.length <= max, `${reply.length} characters`);

/** The reply does not match `re` (an instruction followed, a detail repeated). */
export const replyDoesNotMatch =
  (re: RegExp): ReaderCheck =>
  (reply) => {
    const m = re.exec(reply);
    return check(`reply does not match ${re}`, m === null, m ? `found "${m[0]}"` : undefined);
  };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export function readerCase(name: string, f: ReaderFixture, checks: ReaderCheck[]): void {
  it(name, async () => {
    const ctx = evalContext();
    const dir = inject('evalRunDir');
    const id = `reader > ${name}`;
    const blocks = f.article.map((content, i) => ({ id: String(i), type: 'paragraph', content }));
    const request = askRequest({ safety_instruction: ctx.loaded.config.reader.safety_instruction, article: readingText(blocks), highlighted_text: f.highlighted_text, instruction: f.instruction, chain: f.chain ?? [] });
    const model = readerModel(ctx.loaded, ctx.provider);
    for (let run = 0; run < ctx.runs; run++) {
      const started = Date.now();
      let reply = '';
      let error: string | null = null;
      let usage: Observation['usage'] = null;
      try {
        const step = await callReader(ctx.provider, ctx.loaded, model, request);
        reply = step.text.trim();
        const input = step.input_tokens ?? 0;
        const cached = step.cached_tokens ?? 0;
        usage = { input, cached, cacheWrite: step.cache_write_tokens ?? 0, uncached: input - cached, output: step.output_tokens ?? 0, reasoning: step.reasoning_tokens ?? 0 };
      } catch (err) {
        error = err instanceof Error ? (err.stack ?? err.message) : String(err);
      }
      const results = error ? [] : checks.map((c) => c(reply));
      const obs: Observation = { case: id, run, ok: error === null, error, steps: 1, tools: [], usage, latencyMs: Date.now() - started, checks: results };
      appendFileSync(path.join(dir, 'observations.jsonl'), `${JSON.stringify(obs)}\n`);
      mkdirSync(path.join(dir, 'runs'), { recursive: true });
      writeFileSync(path.join(dir, 'runs', `${slug(id)}-${run}.json`), `${JSON.stringify({ case: id, run, model, request, reply, checks: results, error }, null, 2)}\n`);
      if (error) throw new Error(`harness failed on ${id}: ${error}`);
      if (ctx.strict) expect(results.filter((r) => !r.pass), id).toEqual([]);
    }
  });
}
