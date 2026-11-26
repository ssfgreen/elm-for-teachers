import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventStore } from '../events/store.js';
import { serialiseTransactions } from '../serial-db.js';
import { focusEvent } from '../test-helpers.js';
import { openDb } from './client.js';
import { migrate } from './migrate.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Two server copies (as serverless hosting runs them) writing the same database. */
async function twoInstances() {
  const dir = mkdtempSync(path.join(tmpdir(), 'edw-inst-'));
  dirs.push(dir);
  const url = `file:${path.join(dir, 'shared.db')}`;
  const a = serialiseTransactions(openDb({ url }));
  const b = serialiseTransactions(openDb({ url }));
  // Both migrate at once, as two cold starts would.
  await Promise.all([migrate(a), migrate(b)]);
  await a.execute(`INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at) VALUES ('S', 'x', 't', 'h', 'h', 'n', 'n')`);
  return { a, b };
}

describe('several server copies on one database', () => {
  it('number every event once, gapless, when both append to the same workspace at the same time', async () => {
    const { a, b } = await twoInstances();
    const sa = createEventStore(a);
    const sb = createEventStore(b);
    const batches = Array.from({ length: 40 }, (_, i) => (i % 2 ? sa : sb).appendClient('S', [focusEvent(), focusEvent()]));
    await Promise.all(batches);
    const seqs = (await sa.list('S')).map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    a.close();
    b.close();
  }, 30_000);

  it('store a batch once when both copies receive the same retried batch', async () => {
    const { a, b } = await twoInstances();
    const batch = [focusEvent(), focusEvent(), focusEvent()];
    const [ra, rb] = await Promise.all([createEventStore(a).appendClient('S', batch), createEventStore(b).appendClient('S', batch)]);
    expect(ra.accepted + rb.accepted).toBe(3);
    expect((await createEventStore(a).list('S')).map((e) => e.seq)).toEqual([1, 2, 3]);
    a.close();
    b.close();
  }, 30_000);
});
