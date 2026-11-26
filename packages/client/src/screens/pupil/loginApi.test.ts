import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { pupilLogin } from './loginApi';

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

afterEach(() => setFetch(null));

describe('pupilLogin', () => {
  it('posts the body as given and reads 204 as ok', async () => {
    const f = vi.fn(async () => reply(204));
    setFetch(f as unknown as typeof fetch);
    expect(await pupilLogin({ username: 'sam-fox', password: 'pw', code: 'ABCD-EFGH' })).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/pupil/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ username: 'sam-fox', password: 'pw', code: 'ABCD-EFGH' });
  });

  it('gives the refusal code, or failed when the answer has none', async () => {
    setFetch((async () => reply(401, { error: 'no', code: 'login_wrong' })) as unknown as typeof fetch);
    expect(await pupilLogin({ username: 'a', password: 'b' })).toEqual({ refused: 'login_wrong' });
    setFetch((async () => reply(500, 'oops')) as unknown as typeof fetch);
    expect(await pupilLogin({ username: 'a', password: 'b' })).toEqual({ refused: 'failed' });
  });
});
