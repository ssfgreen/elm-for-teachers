import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let sid: string;
let auth: Record<string, string>;
const get = (path: string) => app.inject({ url: `/api/sessions/${sid}${path}`, headers: auth }).then((r) => r.json());

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  const r = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: { authorization: `Bearer ${deps.env.ADMIN_PASSWORD}` }, payload: { label: 'Study 1', study: true } });
  expect(r.statusCode).toBe(201);
  sid = r.json().session.session_id;
  auth = { authorization: `Bearer ${r.json().session.participant_token}` };
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

describe('a study workspace', () => {
  it('starts with the demo class, its adaptations and its curriculum', async () => {
    const list = await get('/classes');
    const p7a = list.classes.find((c: { name: string }) => c.name === 'P7A');
    expect(p7a).toMatchObject({ pupil_count: 20 });
    expect(p7a.starred_at).not.toBeNull();
    const detail = await get(`/classes/${p7a.id}`);
    expect(detail.adaptations).toHaveLength(5);
    expect(detail.curriculum.map((i: { code: string; status: string }) => [i.code, i.status])).toEqual([['LIT 2-16a', 'now'], ['ENG 2-19a', 'planned'], ['LIT 2-14a', 'done']]);
  });

  it('has a demo chat for the class: a plan, a worksheet, and a version for tidy-puffin with a Spyglass flag', async () => {
    const { threads } = await get('/threads');
    const demo = (threads as { title: string; class_id: string | null; id: string }[]).find((x) => x.title.startsWith('Demo'));
    expect(demo?.class_id).toBeTruthy();
    const { turns } = await get(`/threads/${demo!.id}/chat`);
    const list = turns as { turn_id: string; prompt: string; response_text: string; steps?: unknown[]; spyglass?: { flags: { title: string; was?: string }[] } }[];
    expect(list.map((x) => x.prompt)).toEqual(['What should P7A be working on in reading this term, and how should I teach it?', 'Make a short reading task on volcanoes for LIT 2-16a.', 'Make a version for tidy-puffin.']);
    expect(list.every((x) => x.turn_id.startsWith('t_demo_') && x.steps?.length)).toBe(true);
    expect(list[0]!.response_text).toContain('[[clm-LIT-rr-four-strategies]]');
    expect(list[2]!.spyglass!.flags[0]).toMatchObject({ title: 'Question 3 reworded', was: 'Why do people live near volcanoes? Use the text to explain.' });

    const canvas = await get('/canvas');
    const docs = (canvas.docs as { id: string; name: string; thread_id: string; style?: { font?: string } }[]).filter((d) => d.thread_id === demo!.id);
    expect(docs.map((d) => d.name).sort()).toEqual(['Volcanoes: main ideas', 'Volcanoes: main ideas (tidy-puffin)']);
    const copy = docs.find((d) => d.name.endsWith('(tidy-puffin)'))!;
    expect(copy.style?.font).toBe('comic_sans');
    const blocks = (canvas.blocks as { doc_id: string; content: string; status: string }[]).filter((b) => b.doc_id === copy.id);
    expect(blocks.every((b) => b.status === 'live')).toBe(true);
    expect(blocks.map((b) => b.content)).toContain('Why do people live near volcanoes? Find two reasons in the text.');
  });

  it('logs its starting state once, naming the demo turns', async () => {
    const seeds = (await deps.events.list(sid, { kinds: ['study_seed'] as never })).map((e) => e.payload as { turn_ids: string[] });
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.turn_ids).toHaveLength(3);
  });
});

/** Make a study workspace with `breakSeed` applied to fresh deps; expect a 500 and no row left anywhere. */
async function seedFailsCleanly(breakSeed: (d: ReturnType<typeof testDeps>) => void): Promise<void> {
  const t2 = await tempDb();
  const d = testDeps(t2.db);
  breakSeed(d);
  const a = await buildApp(d);
  await a.ready();
  try {
    const r = await a.inject({ method: 'POST', url: '/api/admin/sessions', headers: { authorization: `Bearer ${d.env.ADMIN_PASSWORD}` }, payload: { label: 'Study 2', study: true } });
    expect(r.statusCode).toBe(500);
    expect(await d.sessions.list()).toEqual([]);
    const tables = await t2.db.execute("SELECT m.name AS name FROM sqlite_master m JOIN pragma_table_info(m.name) c ON c.name = 'session_id' WHERE m.type = 'table'");
    const left: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const n = Number((await t2.db.execute(`SELECT COUNT(*) AS n FROM ${String(name)}`)).rows[0]!.n);
      if (n > 0) left[String(name)] = n;
    }
    expect(left).toEqual({});
  } finally {
    await a.close();
    t2.cleanup();
  }
}

describe('a study seed that fails', () => {
  it('early (at the first adaptation) leaves no session behind and fails the request', async () => {
    await seedFailsCleanly((d) => {
      // The class, its pupils and their events are written; the first adaptation is not.
      const append = d.events.appendServer.bind(d.events);
      d.events.appendServer = ((sid, kind, payload, env, tx) =>
        kind === 'pupils_change' && (payload as { fields?: string[] }).fields?.includes('adaptations') ? Promise.reject(new Error('seed broke')) : append(sid, kind, payload, env, tx)) as typeof d.events.appendServer;
    });
  });

  it('late (in canvas.structural, after the adaptations, curriculum, chat and worksheet) leaves no session behind either', async () => {
    await seedFailsCleanly((d) => {
      d.canvas.structural = () => Promise.reject(new Error('seed broke'));
    });
  });
});
