/**
 * A workshop session's export (`data/Telemetry/<session>`, not committed) as Spyglass cases: each
 * teacher message, the docs as the model saw them when the turn started, what the turn did, and its
 * effect. A turn that made a copy the old way is there twice, as recorded and as a `copy_of` copy
 * (as-copy.ts). Only teacher-facing words go into a case: the request, the reply and the docs' text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contentChanged, turnEffect, type CopyChoice, type Operation, type TurnEffect } from '@edw/shared';
import type { JudgeDoc } from '../../../server/src/gateway/judge-prompt.js';
import { asCopy } from './as-copy.js';
import { parseSnapshot } from './canvas.js';

export interface SessionCase {
  /** e.g. `2SH #6 as copy` */
  id: string;
  session: string;
  turn: number;
  variant: 'recorded' | 'as_copy';
  prompt: string;
  reply: string;
  docs: JudgeDoc[];
  operations: Operation[];
  copy_choices?: Record<string, CopyChoice>;
  effect: TurnEffect;
  /** Whether a turn like this calls the judge (a change that is neither formatting nor a move). */
  judged: boolean;
}

interface Turn {
  turn_id: string;
  thread_id: string;
  prompt: string;
  response_text: string;
  operations: Operation[] | null;
}

interface Call {
  turn_id: string;
  step?: number | null;
  serialized_canvas: string;
  tool_calls?: { name: string; arguments: string }[] | null;
}

const jsonl = <T>(file: string): T[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);

/** `P02-SH-Telemetry` → `2SH`, as the plan names the sessions. */
export const sessionName = (dir: string) => path.basename(dir).replace(/^P0*(\d+)-(\w+?)(-Telemetry)?$/, '$1$2');

export function casesFromBundle(dir: string): SessionCase[] {
  const session = sessionName(dir);
  const turns = jsonl<Turn>(path.join(dir, 'chat_turns.jsonl'));
  const calls = jsonl<Call>(path.join(dir, 'gateway_calls.jsonl'));
  const cases: SessionCase[] = [];
  turns.forEach((t, n) => {
    const own = calls.filter((c) => c.turn_id === t.turn_id).sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    if (!own[0]) return;
    const start = parseSnapshot(own[0].serialized_canvas, 's', t.thread_id);
    const open = start.openDocId ?? start.docs[0]?.id;
    if (!open) return;
    const read = own.flatMap((c) => (c.tool_calls ?? []).filter((x) => x.name === 'read_document').map((x) => String((JSON.parse(x.arguments) as { doc_id?: unknown }).doc_id)));
    const make = (variant: SessionCase['variant'], operations: Operation[], copyChoices?: Record<string, CopyChoice>): SessionCase => {
      const effect = turnEffect({ blocks: start.blocks, docs: start.docs, operations, turn_id: t.turn_id, thread_id: t.thread_id, default_doc_id: open, read_doc_ids: read, ...(copyChoices ? { copy_choices: copyChoices } : {}) });
      const created = operations.filter((o) => o.op === 'create_doc');
      const docs: JudgeDoc[] = [
        ...start.docs.map((d) => ({ id: d.id, name: d.name })),
        ...effect.created_doc_ids.map((id, k) => ({ id, name: created[k]?.name ?? 'New document', ...(created[k]?.copy_of ? { copy_of: created[k].copy_of } : {}) })),
      ];
      return {
        id: `${session} #${n}${variant === 'as_copy' ? ' as copy' : ''}`,
        session,
        turn: n,
        variant,
        prompt: t.prompt,
        reply: t.response_text,
        docs,
        operations,
        ...(copyChoices && Object.keys(copyChoices).length ? { copy_choices: copyChoices } : {}),
        effect,
        judged: contentChanged(effect),
      };
    };
    const operations = t.operations ?? [];
    cases.push(make('recorded', operations));
    const copy = asCopy({ blocks: start.blocks, docs: start.docs, thread_id: t.thread_id, open_doc_id: open }, operations);
    if (copy) cases.push(make('as_copy', copy.operations, copy.copy_choices));
  });
  return cases;
}
