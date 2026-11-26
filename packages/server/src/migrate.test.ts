/** The command as a Kubernetes Job starts it: a real entry that always runs, whatever path it is started by. */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from './db/client.js';
import { pendingMigrations } from './db/migrate.js';

const ENTRY = fileURLToPath(new URL('./migrate.ts', import.meta.url));
let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function run(entry: string, url: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', entry],
      { cwd: path.dirname(ENTRY), env: { ...process.env, DATABASE_URL: url, ADMIN_PASSWORD: 'pw', PROVIDER: 'mock' } },
      (err, stdout, stderr) => resolve({ code: err ? Number(err.code ?? 1) : 0, out: stdout + stderr }),
    );
  });
}

describe('migrate entry', () => {
  it('migrates and exits 0, also when started through a symlink', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'edw-entry-'));
    const link = path.join(dir, 'migrate-link.ts');
    symlinkSync(ENTRY, link);
    const url = `file:${path.join(dir, 'e.db')}`;
    const res = await run(link, url);
    expect(res.out).toMatch(/applied \d+ migrations/);
    expect(res.code).toBe(0);
    const db = openDb({ url });
    expect(await pendingMigrations(db)).toEqual([]);
    db.close();
  }, 30_000);

  it('exits non-zero when the database is not one', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'edw-entry-'));
    const bad = path.join(dir, 'bad.db');
    writeFileSync(bad, 'not a database, only text '.repeat(10));
    const res = await run(ENTRY, `file:${bad}`);
    expect(res.out).toMatch(/migration failed/);
    expect(res.code).toBe(1);
  }, 30_000);
});
