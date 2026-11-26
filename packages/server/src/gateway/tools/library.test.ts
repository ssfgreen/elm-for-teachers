import { describe, expect, it } from 'vitest';
import { LibraryError, type LibraryClient } from '../../plugins/library-client.js';
import { libraryGrep, libraryRead } from './library.js';
import type { ToolContext } from './types.js';

const ctx = (client: LibraryClient, askFirst: string[] = []): ToolContext =>
  ({ libraries: [{ id: 'trails', name: 'TRAILS', description: 'AI literacy.', collection: 'trails', client }], askFirst: new Set(askFirst) }) as unknown as ToolContext;
const failing = (err: Error): LibraryClient => ({
  call: async () => {
    throw err;
  },
});

describe('library tools', () => {
  it("gives the model the library's reason for a bad request, so it can fix it", async () => {
    const out = await libraryGrep.execute({ library: 'trails', pattern: '(' }, ctx(failing(new LibraryError('the pattern is not a valid regular expression', 400))));
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.output).error).toBe('the pattern is not a valid regular expression');
  });

  it('gives the model a missing document as something to fix, not a library that is down', async () => {
    const out = await libraryRead.execute({ library: 'trails', path: 'nope.md' }, ctx(failing(new LibraryError('no document at nope.md', 404))));
    expect(JSON.parse(out.output).error).toBe('no document at nope.md');
  });

  it('tells the model to carry on without a library that is down', async () => {
    const out = await libraryRead.execute({ library: 'trails', path: 'a.md' }, ctx(failing(new LibraryError('the library could not be reached (TimeoutError)', null))));
    expect(JSON.parse(out.output).error).toMatch(/TRAILS could not be searched just now.*carry on without it/);
  });

  it('names the libraries there are when given one that is not, and asks first when it must', async () => {
    const ok: LibraryClient = { call: async () => ({ version: 'v' }) };
    const unknown = await libraryRead.execute({ library: 'sqa', path: 'a.md' }, ctx(ok));
    expect(JSON.parse(unknown.output)).toMatchObject({ error: 'no library called sqa', libraries: [{ id: 'trails', name: 'TRAILS' }] });
    const asked = await libraryRead.execute({ library: 'trails', path: 'a.md' }, ctx(ok, ['trails']));
    expect(asked.request).toBe('trails');
    expect(JSON.parse(asked.output).needs_permission).toBe('TRAILS');
  });
});
