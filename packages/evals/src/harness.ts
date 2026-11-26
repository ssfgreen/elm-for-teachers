/**
 * The eval harness (like Pi's harness.ts): builds a fresh workspace from a fixture, runs one
 * teacher message through the app's own chat service, and returns what happened: the reply,
 * every model call with its tool calls and token use, and each document before and after
 * (with every suggestion accepted, as a teacher who agreed would see it).
 *
 * Fixtures name blocks by `key` so an anchor (an @model comment) can point at one; ids are made
 * fresh per run. The harness never grades: judges.ts does that.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  docsOf,
  liveBlocks,
  newUlid,
  toMarkdown,
  type BlockType,
  type CopyChoice,
  type DocStyle,
  type GatewayCall,
  type LoadedConfig,
  type Operation,
  type ProviderAdapter,
} from '@edw/shared';
import { createCanvasService } from '../../server/src/blocks/index.js';
import { createCommentStore } from '../../server/src/comments/store.js';
import { openDb } from '../../server/src/db/client.js';
import { migrate } from '../../server/src/db/migrate.js';
import { createEventStore } from '../../server/src/events/store.js';
import { agentAssistantContent } from '../../server/src/gateway/agent.js';
import { loadGatewayCalls, saveTurn } from '../../server/src/gateway/history.js';
import { createChatService, type TurnResult } from '../../server/src/gateway/service.js';
import { createArasaac, type PictureLibrary } from '../../server/src/pictures/arasaac.js';
import { serialiseTransactions } from '../../server/src/serial-db.js';
import { createSessionService } from '../../server/src/sessions/service.js';
import { createThreadService } from '../../server/src/threads/service.js';
import { createProjectService } from '../../server/src/projects/service.js';
import { createReferenceService } from '../../server/src/references/service.js';
import { seedClass, type ClassFixture } from './class-fixture.js';
import { seedRows } from './seed.js';

export interface BlockFixture {
  type: BlockType;
  content: string;
  /** A name for this block, so the case's anchor (or a check) can refer to it. A list is a block per item: the key names the first, and `<key>#n` item n. */
  key?: string;
  /** A change the assistant suggested to it in an earlier turn, still waiting: its suggested text. */
  suggested?: string;
}

export interface DocFixture {
  name: string;
  /** The doc the teacher has open (exactly one; the first doc when none is marked). */
  open?: boolean;
  blocks: BlockFixture[];
}

/** A comment thread already on a doc: on a block (by key), with its replies. */
export interface CommentFixture {
  key?: string;
  block: string;
  quote?: string;
  body: string;
  author?: 'teacher' | 'model';
  replies?: { body: string; author?: 'teacher' | 'model'; key?: string }[];
}

export interface CaseFixture {
  docs: DocFixture[];
  /** Comment threads on the open doc. */
  comments?: CommentFixture[];
  /**
   * The message is a teacher's @model comment rather than a chat message: a reply in the thread
   * with this key (`prompt` is its text), answered in that thread.
   */
  inThread?: string;
  /** Earlier turns of the chat, oldest first. */
  history?: { prompt: string; reply: string; operations?: Operation[] }[];
  prompt: string;
  /** The teacher commented on a block (@model), optionally with selected text. */
  anchor?: { key: string; quote?: string };
  /** Reference files: the chat is put in a project holding these (pages of text each); with `blocks`, a Word file that can be opened as a doc. */
  references?: { name: string; pages: string[]; summary?: string; blocks?: { type: BlockType; content: string }[] }[];
  /** The chat's project (made with any references too): its name, description and instructions. */
  project?: { name?: string; description?: string; instructions?: string };
  /** The assistant's mode under the chat box: Editing puts its changes straight in. Suggesting when left out. */
  editMode?: 'suggest' | 'edit';
  /** The teacher's choice of what a copy of this doc (by name) is built from, sent with the message (ChatBody.copy_choice). */
  copyChoice?: { doc: string; choice: CopyChoice };
  /** The chat is for this class (class-fixture.ts); the pedagogy library needs LIBRARY_URL. */
  class?: ClassFixture;
}

export interface StepRecord {
  step: number;
  tools: { name: string; arguments: string; output: string; isError: boolean }[];
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  latencyMs: number;
  error: string | null;
}

export interface Usage {
  input: number;
  cached: number;
  cacheWrite: number;
  /** Input not served from the cache: what the input costs at full price. */
  uncached: number;
  output: number;
  reasoning: number;
}

export interface EvalRun {
  ok: boolean;
  message: string;
  operations: Operation[];
  /** Operations dropped when the turn was applied (after the model's own corrections). */
  droppedAtApply: number;
  steps: StepRecord[];
  /** Every tool call in order. */
  toolCalls: { name: string; arguments: string; isError: boolean }[];
  usage: Usage;
  latencyMs: number;
  /** Each doc's markdown, by name, before the turn and with its suggestions accepted after it. */
  before: Record<string, string>;
  after: Record<string, string>;
  /** Each doc's markdown straight after the turn, before any suggestion is accepted (what Editing mode put in). */
  liveAfter: Record<string, string>;
  /** Blocks with a suggestion still waiting straight after the turn. */
  waitingAfter: number;
  /** The same, per doc by name. */
  waitingIn: Record<string, number>;
  /** Copies the turn could not make until the teacher chooses what they are built from. */
  copyRequests: number;
  /** Each doc's blocks in order, and its font and page colour, after it (suggestions accepted). */
  afterBlocks: Record<string, { type: BlockType; content: string }[]>;
  afterStyle: Record<string, DocStyle>;
  /** Names of docs the turn created. */
  createdDocs: string[];
  /** Comments the model wrote this turn (its thread reply, and with its tools). */
  modelComments: { root: boolean; quote: string | null; body: string; onBlock: string | null }[];
  /** The thread's running summary after the turn (older turns folded into it), and the summary call if this turn made one. */
  summary: string | null;
  summaryCall: { error: string | null; input: number; output: number; latencyMs: number } | null;
  /** How many pictures the turn took from ARASAAC (search_pictures). */
  pictures: number;
}

export interface HarnessOptions {
  provider: ProviderAdapter;
  loaded: LoadedConfig;
  /** Where search_pictures looks: ARASAAC itself unless given. */
  pictures?: PictureLibrary;
}

const n = (v: number | null | undefined) => v ?? 0;

function stepOf(c: GatewayCall, i: number): StepRecord {
  return {
    step: c.step ?? i,
    tools: (c.tool_calls ?? []).map((t) => ({ name: t.name, arguments: t.arguments, output: t.output, isError: t.is_error === true })),
    input: n(c.input_tokens),
    cached: n(c.cached_tokens),
    cacheWrite: n(c.cache_write_tokens),
    output: n(c.output_tokens),
    reasoning: n(c.reasoning_tokens),
    latencyMs: c.latency_ms,
    error: c.error,
  };
}

/** Runs one teacher message against the fixture in a workspace of its own (its own temp database). */
export async function runCase(fixture: CaseFixture, { provider, loaded, pictures = createArasaac() }: HarnessOptions): Promise<EvalRun> {
  const dir = mkdtempSync(path.join(tmpdir(), 'edw-eval-'));
  const db = serialiseTransactions(openDb({ url: `file:${path.join(dir, 'eval.db')}` }));
  try {
    await migrate(db);
    const events = createEventStore(db);
    const canvas = createCanvasService(db, events);
    const threads = createThreadService(db, canvas, events);
    const sessions = createSessionService(db, loaded, events, threads);
    // Libraries only for a class case, so the other cases run as their baseline did.
    const chat = createChatService({ db, events, canvas, threads, provider, loaded, pictures, ...(fixture.class ? { libraryUrl: process.env.LIBRARY_URL } : {}) });

    const { session, thread, doc: blank } = await sessions.create('eval');
    const sid = session.session_id;
    await db.execute('DELETE FROM docs WHERE id = ?', [blank.id]);
    const keys = new Map<string, string>();
    const now = Date.now();
    const docIds: string[] = [];
    for (const [d, docFx] of fixture.docs.entries()) {
      const docId = newUlid();
      docIds.push(docId);
      const at = new Date(now - 60_000 + d).toISOString();
      await db.execute('INSERT INTO docs (id, session_id, thread_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [docId, sid, thread.id, docFx.name, 'teacher', at]);
      // A list is a block per item (seed.ts).
      for (const [o, b] of docFx.blocks.flatMap(seedRows).entries()) {
        const id = newUlid();
        for (const k of b.keys) keys.set(k, id);
        await db.execute(
          `INSERT INTO blocks (id, session_id, doc_id, type, content, origin, origin_turn, status, version, derived_from, "order", pending, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?)`,
          [id, sid, docId, b.type, b.content, b.origin, b.origin === 'model' ? 't_earlier' : null, b.status, o, b.pending, at, at],
        );
      }
    }
    if (fixture.references?.length || fixture.project) {
      const setupEnv = { client_ts: new Date().toISOString(), focus_pane: 'canvas' as const, doc_id: null, thread_id: null };
      const projects = createProjectService(db, events);
      const project = await projects.create(sid, { name: fixture.project?.name ?? 'Eval project', description: fixture.project?.description }, setupEnv);
      if (fixture.project?.instructions) await projects.update(sid, project.id, { instructions: fixture.project.instructions }, setupEnv);
      await db.execute('UPDATE threads SET project_id = ? WHERE id = ?', [project.id, thread.id]);
      const refs = createReferenceService(db, events, loaded.config.references);
      for (const r of fixture.references ?? []) {
        const mime = r.blocks ? ('application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const) : ('text/plain' as const);
        const { file } = await refs.create(sid, project.id, { name: r.name, mime, bytes: r.pages.join('').length, pages: r.pages, ...(r.blocks ? { blocks: r.blocks } : {}) }, setupEnv);
        if (r.summary) await refs.setSummary(file.id, r.summary);
      }
    }
    if (fixture.class) await seedClass(db, events, sid, thread.id, fixture.class);
    const openIndex = Math.max(0, fixture.docs.findIndex((d) => d.open));
    const openDocId = docIds[openIndex]!;

    const comments = createCommentStore(db, events);
    const commentKeys = new Map<string, string>();
    const env = { client_ts: new Date().toISOString(), focus_pane: 'canvas' as const, doc_id: openDocId, thread_id: thread.id };
    for (const c of fixture.comments ?? []) {
      const blockId = keys.get(c.block);
      if (!blockId) throw new Error(`fixture comment names an unknown block key: ${c.block}`);
      const root = await comments.create(sid, { doc_id: openDocId, block_id: blockId, author: c.author ?? 'teacher', body: c.body, quote: c.quote ?? null }, env);
      if (c.key) commentKeys.set(c.key, root.id);
      for (const r of c.replies ?? []) {
        const reply = await comments.create(sid, { doc_id: openDocId, root_id: root.id, author: r.author ?? 'teacher', body: r.body }, env);
        if (r.key) commentKeys.set(r.key, reply.id);
      }
    }
    let commentId: string | undefined;
    if (fixture.inThread) {
      const root = commentKeys.get(fixture.inThread);
      if (!root) throw new Error(`fixture inThread names an unknown comment key: ${fixture.inThread}`);
      commentId = (await comments.create(sid, { doc_id: openDocId, root_id: root, author: 'teacher', body: fixture.prompt }, env)).id;
    }

    if (fixture.history?.length) {
      await db.transaction(async (tx) => {
        for (const [k, h] of fixture.history!.entries()) {
          const operations = h.operations ?? [];
          await saveTurn(
            tx,
            sid,
            {
              turn_id: `t_${newUlid()}`,
              thread_id: thread.id,
              doc_id: openDocId,
              prompt: h.prompt,
              anchor: null,
              response_text: h.reply,
              operations,
              rewritten_assistant_content: agentAssistantContent(h.reply, operations),
              at: new Date(now - 30_000 + k).toISOString(),
            },
            k + 1,
          );
        }
      });
    }

    const markdown = async (only?: Set<string>) => {
      const state = await canvas.loadState(sid);
      return Object.fromEntries(docsOf(state).filter((d) => !only || only.has(d.id)).map((d) => [d.name, toMarkdown(state, d.id)]));
    };
    const before = await markdown();

    let anchor: { block_id: string; from: number | null; to: number | null; quote: string | null } | undefined;
    if (fixture.anchor) {
      const blockId = keys.get(fixture.anchor.key);
      if (!blockId) throw new Error(`fixture anchor names an unknown block key: ${fixture.anchor.key}`);
      anchor = { block_id: blockId, from: null, to: null, quote: fixture.anchor.quote ?? null };
    }

    let copyChoice: { doc_id: string; choice: CopyChoice } | undefined;
    if (fixture.copyChoice) {
      const d = fixture.docs.findIndex((x) => x.name === fixture.copyChoice!.doc);
      if (d < 0) throw new Error(`fixture copyChoice names an unknown doc: ${fixture.copyChoice.doc}`);
      copyChoice = { doc_id: docIds[d]!, choice: fixture.copyChoice.choice };
    }

    const started = performance.now();
    const result: TurnResult = await chat.runTurn(sid, {
      thread_id: thread.id,
      doc_id: openDocId,
      text: fixture.prompt,
      envelope: { client_ts: new Date().toISOString(), focus_pane: 'chat' },
      ...(anchor ? { anchor } : {}),
      ...(commentId ? { comment_id: commentId } : {}),
      ...(fixture.editMode ? { edit_mode: fixture.editMode } : {}),
      ...(copyChoice ? { copy_choice: copyChoice } : {}),
      // EVAL_MODEL: one of the picker's models, sent as the teacher's choice is (no effort for a model without reasoning).
      ...(process.env.EVAL_MODEL ? { model: process.env.EVAL_MODEL } : {}),
    });
    const latencyMs = Math.round(performance.now() - started);

    // The turn's own calls; a summary call (folding older turns) and Spyglass's judge (after the commit) are not its steps.
    const calls = (await loadGatewayCalls(db, sid)).filter((c) => c.turn_id === result.turn_id && c.purpose !== 'summary' && c.purpose !== 'judge').sort((a, b) => n(a.step) - n(b.step));
    const steps = calls.map(stepOf);

    const liveAfter = await markdown();
    const turnState = await canvas.loadState(sid);
    const waiting = [...turnState.blocks.values()].filter((b) => b.status === 'proposed' || (b.status === 'live' && b.pending !== null));
    const waitingAfter = waiting.length;
    const waitingIn = Object.fromEntries(docsOf(turnState).map((d) => [d.name, waiting.filter((b) => b.doc_id === d.id).length]));

    // Accept every suggestion, as the result a teacher who agreed would see.
    let after = before;
    let createdDocs: string[] = [];
    if (result.ok) {
      const touched = new Set(result.changes.blocks.map((b) => b.doc_id));
      for (const docId of touched) {
        await events.appendClient(sid, [
          { event_id: newUlid(), client_ts: new Date().toISOString(), focus_pane: 'canvas', doc_id: docId, thread_id: thread.id, kind: 'proposal_accept', payload: { block_id: null, doc_id: docId, mode: 'accept_all' } },
        ]);
      }
      // And its suggested font or page colour.
      for (const d of docsOf(await canvas.loadState(sid))) {
        if (d.proposed_style) await canvas.structural(sid, { command: 'doc_style_decision', doc_id: d.id, accept: true }, env);
      }
      after = await markdown();
      createdDocs = Object.keys(after).filter((name) => !(name in before));
    }
    const finalState = await canvas.loadState(sid);
    const afterBlocks = Object.fromEntries(docsOf(finalState).map((d) => [d.name, liveBlocks(finalState, d.id).map((b) => ({ type: b.type, content: b.content }))]));
    const afterStyle = Object.fromEntries(docsOf(finalState).map((d) => [d.name, d.style ?? {}]));

    const blockKeyOf = new Map([...keys].map(([k, id]) => [id, k]));
    const modelComments = (await comments.list(sid, openDocId))
      .filter((c) => c.author === 'model' && c.turn_id === result.turn_id)
      .map((c) => ({ root: c.root_id === null, quote: c.quote, body: c.body, onBlock: blockKeyOf.get(c.block_id) ?? null }));

    const summaryRow = (await loadGatewayCalls(db, sid)).find((c) => c.turn_id === result.turn_id && c.purpose === 'summary');
    const summaryCall = summaryRow ? { error: summaryRow.error, input: n(summaryRow.input_tokens), output: n(summaryRow.output_tokens), latencyMs: summaryRow.latency_ms } : null;
    const summary = (await threads.summaryState(thread.id)).summary;

    const usage = steps.reduce<Usage>(
      (u, s) => ({ input: u.input + s.input, cached: u.cached + s.cached, cacheWrite: u.cacheWrite + s.cacheWrite, uncached: 0, output: u.output + s.output, reasoning: u.reasoning + s.reasoning }),
      { input: 0, cached: 0, cacheWrite: 0, uncached: 0, output: 0, reasoning: 0 },
    );
    usage.uncached = usage.input - usage.cached;

    return {
      ok: result.ok,
      message: result.message,
      operations: result.ok ? result.operations : [],
      droppedAtApply: result.ok ? result.dropped : 0,
      steps,
      toolCalls: steps.flatMap((s) => s.tools.map((t) => ({ name: t.name, arguments: t.arguments, isError: t.isError }))),
      usage,
      latencyMs,
      before,
      after,
      liveAfter,
      waitingAfter,
      waitingIn,
      copyRequests: result.ok ? (result.copy_requests?.length ?? 0) : 0,
      afterBlocks,
      afterStyle,
      createdDocs,
      modelComments,
      summary,
      summaryCall,
      pictures: result.ok ? (result.pictures?.length ?? 0) : 0,
    };
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* Block shorthands for fixtures. */
export const h = (content: string, key?: string): BlockFixture => ({ type: 'heading', content, ...(key ? { key } : {}) });
export const p = (content: string, key?: string): BlockFixture => ({ type: 'paragraph', content, ...(key ? { key } : {}) });
export const ol = (items: string[], key?: string): BlockFixture => ({ type: 'numbered_list', content: items.map((t, i) => `${i + 1}. ${t}`).join('\n'), ...(key ? { key } : {}) });
export const ul = (items: string[], key?: string): BlockFixture => ({ type: 'bullet_list', content: items.map((t) => `- ${t}`).join('\n'), ...(key ? { key } : {}) });
export const table = (rows: string[][], key?: string): BlockFixture => ({
  type: 'table',
  content: [`| ${rows[0]!.join(' | ')} |`, `| ${rows[0]!.map(() => '---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n'),
  ...(key ? { key } : {}),
});
