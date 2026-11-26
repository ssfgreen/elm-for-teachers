import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '@edw/shared/node';
import { loadConfigVersions, recordConfigVersions } from './config-versions.js';
import { JUDGE_PROMPT_HASH } from './gateway/judge.js';
import { tempDb, testLoaded, type TempDb } from './test-helpers.js';

let t: TempDb;
beforeAll(async () => {
  t = await tempDb();
});
afterAll(() => t.cleanup());

describe('config_versions', () => {
  it("records Spyglass's judge prompt under the hash its calls carry", async () => {
    await recordConfigVersions(t.db, testLoaded());
    const [row] = await loadConfigVersions(t.db, [JUDGE_PROMPT_HASH]);
    expect(row!.content).toContain('report_flags');
    expect(sha256Hex(row!.content)).toBe(JUDGE_PROMPT_HASH);
  });
});
