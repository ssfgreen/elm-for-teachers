import { describe, expect, it, vi } from 'vitest';
import { createSessionApi } from './participant';

const envelope = { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'canvas' as const, doc_id: null, thread_id: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('uploadAsset', () => {
  it('with a bucket: asks for a signed URL, puts the file there, then says it is done', async () => {
    const calls: Array<{ url: string; method: string; body: unknown; type: string | null }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body, type: new Headers(init?.headers).get('Content-Type') });
      if (String(url).endsWith('/assets/uploads')) return json({ asset_id: 'ast_1', upload: { method: 'PUT', url: 'https://bucket.test/k?sig', headers: { 'Content-Type': 'image/png' } } }, 201);
      if (String(url).startsWith('https://bucket.test/')) return new Response(null, { status: 200 });
      return json({ asset_id: 'ast_1', url: '/api/sessions/S1/assets/ast_1' });
    });
    const api = createSessionApi('tok', 'S1', { uploads: 'bucket', fetchImpl: fetchImpl as unknown as typeof fetch });
    const file = new File([new Uint8Array(1234)], 'pic.png', { type: 'image/png' });
    expect(await api.uploadAsset(file, envelope)).toMatchObject({ asset_id: 'ast_1' });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['POST', '/api/sessions/S1/assets/uploads'],
      ['PUT', 'https://bucket.test/k?sig'],
      ['POST', '/api/sessions/S1/assets/ast_1/complete'],
    ]);
    expect(JSON.parse(String(calls[0]!.body))).toMatchObject({ filename: 'pic.png', mime: 'image/png', bytes: 1234 });
    expect(calls[1]!.body).toBe(file);
    expect(calls[1]!.type).toBe('image/png');
  });

  it('says so when the bucket refuses the file', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/uploads') ? json({ asset_id: 'ast_1', upload: { method: 'PUT', url: 'https://bucket.test/k', headers: {} } }, 201) : new Response('denied', { status: 403 }),
    );
    const api = createSessionApi('tok', 'S1', { uploads: 'bucket', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(api.uploadAsset(new File(['x'], 'p.png', { type: 'image/png' }), envelope)).rejects.toThrow(/could not be stored \(403\)/);
  });
});

describe('addReference', () => {
  it('sends the file’s text in pages, then (with a bucket) the original, then says it is done', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const ref = { id: 'R1', status: 'pending' };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
      if (String(url).endsWith('/projects/P1/references')) return json({ reference: ref, upload: { method: 'PUT', url: 'https://bucket.test/r?sig', headers: { 'Content-Type': 'text/plain' } } }, 201);
      if (String(url).startsWith('https://bucket.test/')) return new Response(null, { status: 200 });
      return json({ reference: { ...ref, status: 'ready' } });
    });
    const api = createSessionApi('tok', 'S1', { uploads: 'bucket', fetchImpl: fetchImpl as unknown as typeof fetch });
    const file = new File(['Forces act in pairs.'], 'Forces.txt', { type: 'text/plain' });
    expect(await api.addReference!('P1', file, envelope)).toEqual({ id: 'R1', status: 'ready' });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['POST', '/api/sessions/S1/projects/P1/references'],
      ['PUT', 'https://bucket.test/r?sig'],
      ['POST', '/api/sessions/S1/references/R1/complete'],
    ]);
    expect(JSON.parse(String(calls[0]!.body))).toMatchObject({ name: 'Forces.txt', mime: 'text/plain', bytes: 20, pages: ['Forces act in pairs.'] });
    expect(calls[1]!.body).toBe(file);
  });

  it('starts a chat in a project', async () => {
    const fetchImpl = vi.fn(async () => json({ thread: {}, doc: {} }, 201));
    const api = createSessionApi('tok', 'S1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    await api.createThread(envelope, 'P1');
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ project_id: 'P1' });
    await api.createThread(envelope, { class_id: 'C1' });
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ envelope, class_id: 'C1' });
  });
});

describe('setTurnModel', () => {
  it('adds the picked model and effort to every turn', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({ ok: true });
    });
    const api = createSessionApi('tok', 'S1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const env = { client_ts: envelope.client_ts, focus_pane: 'chat' as const };
    await api.sendChat('T1', 'D1', 'One', env);
    api.setTurnModel!({ model: 'gpt-5.5', effort: 'high' });
    await api.sendChat('T1', 'D1', 'Two', env);
    expect(bodies).toEqual([
      { text: 'One', doc_id: 'D1', envelope: env },
      { text: 'Two', doc_id: 'D1', envelope: env, model: 'gpt-5.5', effort: 'high' },
    ]);
  });
});

describe('setEditMode', () => {
  it('sends edit_mode only in Editing mode, so Suggesting turns send what they always did', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({ ok: true });
    });
    const api = createSessionApi('tok', 'S1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const env = { client_ts: envelope.client_ts, focus_pane: 'chat' as const };
    api.setEditMode!('edit');
    await api.sendChat('T1', 'D1', 'One', env);
    api.setEditMode!('suggest');
    await api.sendChat('T1', 'D1', 'Two', env);
    expect(bodies).toEqual([
      { text: 'One', doc_id: 'D1', envelope: env, edit_mode: 'edit' },
      { text: 'Two', doc_id: 'D1', envelope: env },
    ]);
  });

  it('sends the look of Suggesting (suggest_view) with a Suggesting turn, and not with an Editing one', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({ ok: true });
    });
    const api = createSessionApi('tok', 'S1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const env = { client_ts: envelope.client_ts, focus_pane: 'chat' as const };
    api.setEditMode!('suggest', 'track');
    await api.sendChat('T1', 'D1', 'One', env);
    api.setEditMode!('edit', 'inline');
    await api.sendChat('T1', 'D1', 'Two', env);
    expect(bodies).toEqual([
      { text: 'One', doc_id: 'D1', envelope: env, suggest_view: 'track' },
      { text: 'Two', doc_id: 'D1', envelope: env, edit_mode: 'edit' },
    ]);
  });
});

describe('sendChatStream and Spyglass', () => {
  it('ends the turn at its result, then reads on for the flags, and sends the toggle', async () => {
    const result = { ok: true, turn_id: 't_1', message: 'Done.', changes: { blocks: [], docs: [], revisions: [] }, proposed_block_ids: [], created_doc_ids: [] };
    const flags = { flags: [{ check: 'scope', label: 'changed', block_ids: ['b1'], title: 'Answer 6 changed', why: 'Now Simile.' }], others: 0, by: 'judge' };
    let finish: () => void = () => undefined;
    const encoder = new TextEncoder();
    let sent: unknown = null;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(encoder.encode(`${JSON.stringify({ type: 'start', turn_id: 't_1' })}\n${JSON.stringify({ type: 'result', result })}\n`));
          // The flags come only once the judge is done.
          finish = () => {
            c.enqueue(encoder.encode(`${JSON.stringify({ type: 'spyglass', turn_id: 't_1', spyglass: flags })}\n`));
            c.close();
          };
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    });
    const api = createSessionApi('tok', 'S1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    api.setSpyglass!(false);
    const seen: unknown[] = [];
    const reply = await api.sendChatStream!('T1', 'D1', 'Tidy', { client_ts: envelope.client_ts, focus_pane: 'chat' }, undefined, () => undefined, undefined, { onSpyglass: (id, s) => seen.push([id, s]) });
    expect(reply).toEqual(result);
    expect(sent).toMatchObject({ spyglass: false });
    expect(seen).toEqual([]);
    finish();
    await vi.waitFor(() => expect(seen).toEqual([['t_1', flags]]));
  });
});
