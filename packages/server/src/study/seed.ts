/**
 * A study workspace's starting state (Sam, 12 Nov 2026; docs/classes.md, "Study workspaces"):
 * the demo class P7A with library adaptations and curriculum chosen for it, and a demo chat for
 * the class (demo-chat.ts). The chat's turns are written in advance and stored as turns are; their
 * documents go through the one write path (blocks/service.ts) as a turn in Editing mode would, so
 * they read as the assistant's, taken in. Logged once as `study_seed`, which names the turns.
 */
import { newUlid, nowIso, type Operation, type StoredSpyglass } from '@edw/shared';
import { createAdaptationService } from '../classes/adaptations.js';
import { createCurriculumService } from '../classes/curriculum.js';
import { addDemoClass } from '../classes/demo-seed.js';
import { createPupilService } from '../classes/pupils.js';
import type { Db } from '../db/client.js';
import type { CanvasService, EventStore, ServerEnvelope, ThreadService } from '../deps.js';
import { agentAssistantContent } from '../gateway/agent.js';
import { loadTurns, saveTurn } from '../gateway/history.js';
import { DEMO_ADAPTATIONS, DEMO_CHAT_TITLE, DEMO_CURRICULUM, TURN_PLAN, TURN_VERSION, TURN_WORKSHEET, WORKSHEET } from './demo-chat.js';

export interface StudyDeps {
  db: Db;
  events: EventStore;
  canvas: CanvasService;
  threads: ThreadService;
}

/** Ids the demo's turns get: `t_demo_` marks them in the research data as not the participant's. */
export const demoTurnId = () => `t_demo_${newUlid()}`;

export async function seedStudyWorkspace(deps: StudyDeps, sid: string): Promise<{ class_id: string; thread_id: string; doc_ids: string[] }> {
  const { db, events, canvas, threads } = deps;
  const env: ServerEnvelope = { client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null };

  const cls = await addDemoClass(db, events, sid, env);
  const pupils = await createPupilService(db, events).list(sid, cls.id);
  const adaptations = createAdaptationService(db, events);
  for (const { pupil, ...pick } of DEMO_ADAPTATIONS) {
    const p = pupils.find((x) => x.label === pupil);
    if (p) await adaptations.add(sid, cls.id, p.id, pick, env);
  }
  const curriculum = createCurriculumService(db, events);
  for (const { status, ...pick } of DEMO_CURRICULUM) await curriculum.pick(sid, cls.id, [pick], status, env);

  const { thread, doc } = await threads.create(sid, env, undefined, { class_id: cls.id });
  await threads.rename(sid, thread.id, DEMO_CHAT_TITLE, env);
  const turnIds = [demoTurnId(), demoTurnId(), demoTurnId()] as const;
  const seed = await events.appendServer(sid, 'study_seed', { class_id: cls.id, thread_id: thread.id, turn_ids: [...turnIds] }, { ...env, thread_id: thread.id });
  const turnEnv = { ...env, focus_pane: 'chat' as const, doc_id: doc.id, thread_id: thread.id };
  const apply = (turn_id: string, operations: Operation[]) => canvas.applyTurn(sid, { operations, turn_id, cause_event_id: seed.event_id, thread_id: thread.id, default_doc_id: doc.id, direct: true }, { envelope: turnEnv });

  // The worksheet, written into the chat's first doc.
  const writes: Operation[] = WORKSHEET.blocks.map((b, i) => ({ op: 'insert', doc: doc.id, after: i === 0 ? 'start' : `w${i - 1}`, type: b.type, content: b.content, temp_id: `w${i}` }));
  await apply(turnIds[1], writes);
  await canvas.structural(sid, { command: 'doc_rename', doc_id: doc.id, name: WORKSHEET.name, auto: true }, turnEnv);

  // tidy-puffin's version: a copy, in their font, with the text in short paragraphs and question 3 reworded.
  const state = await canvas.loadState(sid);
  const source = [...state.blocks.values()].filter((b) => b.doc_id === doc.id && b.status === 'live').sort((a, b) => a.order - b.order);
  const version: Operation[] = [
    { op: 'create_doc', temp_id: 'v', name: TURN_VERSION.copyName, copy_of: doc.id },
    { op: 'set_style', doc: 'v', font: 'comic_sans' },
    ...TURN_VERSION.changes.map((c): Operation => ({ op: 'replace', id: `v/${source[c.index]!.id}`, content: c.content })),
  ];
  const made = await apply(turnIds[2], version);
  const after = await canvas.loadState(sid);
  const copyId = made.created_doc_ids[0]!;
  const reworded = [...after.blocks.values()].find((b) => b.doc_id === copyId && b.derived_from === source[6]!.id);
  const spyglass: StoredSpyglass = {
    flags: reworded ? [{ check: 'scope', label: 'changed', block_ids: [reworded.id], title: TURN_VERSION.spyglass.title, why: TURN_VERSION.spyglass.why, was: source[6]!.content }] : [],
    others: 0,
    by: 'judge',
  };

  const base = Date.now() - 60_000;
  const turns = [
    { id: turnIds[0], t: TURN_PLAN, operations: [] as Operation[] },
    { id: turnIds[1], t: TURN_WORKSHEET, operations: writes },
    { id: turnIds[2], t: TURN_VERSION, operations: version, spyglass },
  ];
  await db.transaction(async (tx) => {
    let seq = (await loadTurns(tx, sid)).length;
    for (const [i, x] of turns.entries()) {
      await saveTurn(
        tx,
        sid,
        {
          turn_id: x.id,
          thread_id: thread.id,
          doc_id: doc.id,
          prompt: x.t.prompt,
          anchor: null,
          response_text: x.t.reply,
          operations: x.operations,
          rewritten_assistant_content: agentAssistantContent(x.t.reply, x.operations),
          comment_id: null,
          steps: x.t.steps,
          worked_ms: 9000 + i * 7000,
          ...(x.spyglass ? { spyglass: x.spyglass } : {}),
          at: new Date(base + i * 20_000).toISOString(),
        },
        ++seq,
      );
    }
  });
  return { class_id: cls.id, thread_id: thread.id, doc_ids: [doc.id, copyId] };
}
