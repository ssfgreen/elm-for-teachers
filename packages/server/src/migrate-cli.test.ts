import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from './db/client.js';
import { pendingMigrations } from './db/migrate.js';
import { runMigrations } from './migrate-cli.js';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function quietLog() {
  const lines: string[] = [];
  return { lines, log: { info: (m: string) => lines.push(m), error: (m: string) => lines.push(m) } };
}

describe('migrate command', () => {
  it('applies pending migrations and exits 0, then 0 again with nothing to do', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'edw-mig-'));
    const url = `file:${path.join(dir, 'm.db')}`;
    const { lines, log } = quietLog();
    expect(await runMigrations({ DATABASE_URL: url }, log)).toBe(0);
    expect(lines[0]).toMatch(/^applied \d+ migrations: 0004_editor\.sql/);
    expect(await runMigrations({ DATABASE_URL: url }, log)).toBe(0);
    expect(lines[1]).toBe('no pending migrations');
    const db = openDb({ url });
    expect(await pendingMigrations(db)).toEqual([]);
    db.close();
  });

  it('exits non-zero when a migration fails', async () => {
    const { lines, log } = quietLog();
    const failing = () => Promise.reject(new Error('no such table: x'));
    expect(await runMigrations({ DATABASE_URL: 'file::memory:' }, log, failing)).toBe(1);
    expect(lines).toEqual(['migration failed']);
  });
});
