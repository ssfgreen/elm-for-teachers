/** The pupil's highlights (#213): saved, checked against the copy, their own only; pictures; research data. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nowIso, READER_HIGHLIGHTS_MAX } from '@edw/shared';
import { saveAsset } from '../assets/store.js';
import type { AppDeps } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { forgetPupil } from '../pupils/tables.js';
import { tempDb, type TempDb } from '../test-helpers.js';
import { classIn, pupilIn, readerApp, readingIn } from './test-reading.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;

beforeEach(async () => {
  t = await tempDb();
  ({ deps, app } = await readerApp(t));
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

type Headers = Record<string, string>;
const url = (id: string) => `/api/pupil/readings/${id}/highlights`;
const add = (id: string, headers: Headers, body: object) => app.inject({ method: 'POST', url: url(id), headers, payload: body });
const list = async (id: string, headers: Headers) => (await app.inject({ url: url(id), headers })).json().highlights;
const remove = (id: string, hid: string, headers: Headers) => app.inject({ method: 'DELETE', url: `${url(id)}/${hid}`, headers });
const HL = { block_id: 'b_para', start: 0, end: 4, category: 'dont_understand' };

describe('highlights', () => {
  it('saves, lists and removes the pupil’s own highlight', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { headers } = await pupilIn(deps, c);
    const res = await add(id, headers, HL);
    expect(res.statusCode).toBe(201);
    const h = res.json().highlight;
    expect(h).toEqual({ id: expect.any(String), ...HL, created_at: expect.any(String) });
    expect(await list(id, headers)).toEqual([h]);
    expect((await add(id, headers, { ...HL, start: 5, end: 10, category: null })).statusCode).toBe(201);
    expect((await remove(id, h.id, headers)).statusCode).toBe(204);
    expect((await list(id, headers)).map((x: { category: string | null }) => x.category)).toEqual([null]);
  });

  it('refuses a range outside the block’s reader text, an unknown block or category, and a bad range', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { headers } = await pupilIn(deps, c);
    // "The water cycle": 15 characters once the markup is off.
    expect((await add(id, headers, { ...HL, block_id: 'b_head', start: 4, end: 15 })).statusCode).toBe(201);
    expect((await add(id, headers, { ...HL, block_id: 'b_head', start: 4, end: 16 })).json().code).toBe('bad_range');
    expect((await add(id, headers, { ...HL, block_id: 'b_pic', start: 0, end: 1 })).json().code).toBe('bad_range');
    expect((await add(id, headers, { ...HL, block_id: 'b_nope' })).json().code).toBe('unknown_block');
    for (const bad of [{ category: 'rude' }, { start: 3, end: 3 }, { start: -1 }, { end: 2.5 }]) {
      const res = await add(id, headers, { ...HL, ...bad });
      expect([bad, res.statusCode]).toEqual([bad, 400]);
    }
  });

  it(`refuses the highlight after ${READER_HIGHLIGHTS_MAX} on a reading`, async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { headers, members } = await pupilIn(deps, c);
    for (let i = 1; i < READER_HIGHLIGHTS_MAX; i++) {
      await deps.db.execute('INSERT INTO reader_highlights (id, session_id, class_id, reading_id, member_id, block_id, start, "end", category, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, NULL, ?)', [
        `h${i}`, c.session.session_id, c.cls.id, id, members[0]!.id, 'b_para', nowIso(),
      ]);
    }
    expect((await add(id, headers, HL)).statusCode).toBe(201);
    const res = await add(id, headers, HL);
    expect([res.statusCode, res.json().code]).toEqual([409, 'highlights_full']);
  });

  it('cannot see or remove another pupil’s highlight, and a write from another site is refused', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const mine = await pupilIn(deps, c);
    const theirs = await pupilIn(deps, c);
    const h = (await add(id, mine.headers, HL)).json().highlight;
    expect(await list(id, theirs.headers)).toEqual([]);
    expect((await remove(id, h.id, theirs.headers)).statusCode).toBe(404);
    expect((await add(id, { ...mine.headers, origin: 'https://other.example' }, HL)).statusCode).toBe(403);
    expect((await remove(id, h.id, { ...mine.headers, origin: 'https://other.example' })).statusCode).toBe(403);
    expect(await list(id, mine.headers)).toHaveLength(1);
  });
});

describe('pictures', () => {
  it('sends a picture the copy names, privately, and not one it does not', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { headers } = await pupilIn(deps, c);
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    for (const asset_id of ['ast_named', 'ast_other']) {
      await saveAsset(deps.db, { asset_id, session_id: c.session.session_id, mime: 'image/png', bytes: png.length, filename: null, data: png, created_at: nowIso() });
    }
    const ok = await app.inject({ url: `/api/pupil/readings/${id}/assets/ast_named`, headers });
    expect([ok.statusCode, ok.headers['content-type'], ok.headers['cache-control']]).toEqual([200, 'image/png', 'private, max-age=3600']);
    expect((await app.inject({ url: `/api/pupil/readings/${id}/assets/ast_other`, headers })).statusCode).toBe(404);
  });
});

describe('research data', () => {
  it('a highlight writes no event or call-log row, and the export has none', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { headers } = await pupilIn(deps, c);
    const count = async (table: string) => Number((await deps.db.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]!.n);
    const before = [await count('events'), await count('gateway_calls')];
    const h = (await add(id, headers, HL)).json().highlight;
    expect([await count('events'), await count('gateway_calls')]).toEqual(before);
    const { files } = await buildBundle(deps, c.session.session_id);
    const all = Object.values(files).map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))).join('\n');
    expect(all).not.toContain(h.id);
    expect(all).not.toContain('dont_understand');
  });

  it('after the pupil is removed, their highlights stay under the removed_pupils id', async () => {
    const c = await classIn(deps);
    const id = await readingIn(deps, c);
    const { pupil, headers, members } = await pupilIn(deps, c);
    await add(id, headers, HL);
    const anon = await forgetPupil(deps.db, pupil.id);
    const rows = (await deps.db.execute('SELECT member_id FROM reader_highlights WHERE reading_id = ?', [id])).rows.map((r) => r.member_id);
    expect(rows).toEqual([anon[c.cls.id]]);
    expect(rows).not.toContain(members[0]!.id);
    expect((await deps.db.execute('SELECT id FROM removed_pupils WHERE id = ?', [anon[c.cls.id]!])).rows).toHaveLength(1);
  });
});

