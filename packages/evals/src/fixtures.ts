/**
 * Cases from a real workshop: an exported workspace (the admin zip, unpacked). Each teacher
 * message becomes a case that starts exactly where the original model started: the docs it was
 * shown (its gateway call's serialized_canvas, with block ids kept as fixture keys, so a comment
 * anchor still points at its block) and the chat's earlier turns.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BlockType, type Operation } from '@edw/shared';
import type { CaseFixture, DocFixture } from './harness.js';

/** A gateway call's serialized_canvas back into docs (the open one marked). */
export function parseCanvas(text: string): DocFixture[] {
  const docs: DocFixture[] = [];
  for (const line of text.split('\n')) {
    const d = /^## Document: (.*) \(id: ([^;)]+)(; open)?\)$/.exec(line);
    if (d) {
      docs.push({ name: d[1]!, ...(d[3] ? { open: true } : {}), blocks: [] });
      continue;
    }
    const b = /^\d+\. \[id=([^\]]+)\] \[type=([^\]]+)\] ?(.*)$/.exec(line);
    const doc = docs.at(-1);
    if (b && doc) {
      doc.blocks.push({ type: BlockType.parse(b[2]), content: b[3]!, key: b[1]! });
      continue;
    }
    const last = doc?.blocks.at(-1);
    if (line.startsWith('   ') && last) last.content += `\n${line.slice(3)}`;
  }
  return docs;
}

interface ExportTurn {
  turn_id: string;
  thread_id: string;
  prompt: string;
  anchor: { block_id: string; quote: string | null } | null;
  response_text: string;
  operations: Operation[];
}

export interface ExportCase {
  name: string;
  fixture: CaseFixture;
}

export function casesFromExport(dir: string): ExportCase[] {
  const lines = (f: string) => readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const turns = lines('chat_turns.jsonl') as ExportTurn[];
  const calls = lines('gateway_calls.jsonl') as { turn_id: string; serialized_canvas: string; step?: number }[];
  return turns.flatMap((t, i) => {
    const call = calls.find((c) => c.turn_id === t.turn_id && (c.step ?? 0) === 0);
    if (!call) return [];
    const history = turns.slice(0, i).filter((u) => u.thread_id === t.thread_id).map((u) => ({ prompt: u.prompt, reply: u.response_text, operations: u.operations }));
    const fixture: CaseFixture = { docs: parseCanvas(call.serialized_canvas), history, prompt: t.prompt, ...(t.anchor ? { anchor: { key: t.anchor.block_id, ...(t.anchor.quote ? { quote: t.anchor.quote } : {}) } } : {}) };
    return [{ name: `#${String(i).padStart(2, '0')} ${t.prompt.replace(/\s+/g, ' ').slice(0, 70)}`, fixture }];
  });
}

/** The export to replay: EVAL_EXPORT, or the workshop export in data/ when it is there (data/ is not committed). */
export function exportDir(repoRoot: string): string | null {
  const dir = process.env.EVAL_EXPORT ? path.resolve(process.env.EVAL_EXPORT) : path.join(repoRoot, 'data/downloads/Epistemic Differentiation Workshop Export');
  return existsSync(path.join(dir, 'chat_turns.jsonl')) ? dir : null;
}
