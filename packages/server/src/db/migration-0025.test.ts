import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openDb } from './client.js';
import { migrate } from './migrate.js';

let dir: string | undefined;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

it('migration 0025 numbers the pupils already in each class in their order, the ones who left too', async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'edw-0025-'));
  const db = openDb({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  // Back to how a database was before 0025, with pupils in it.
  await db.execute('ALTER TABLE class_pupils DROP COLUMN number');
  await db.execute("DELETE FROM schema_migrations WHERE name = '0025_pupil_numbers.sql'");
  await db.execute("INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at) VALUES ('S', 'x', 't', 'h', 'h', 'n', 'n')");
  await db.execute("INSERT INTO schools (id, session_id, name, created_at) VALUES ('SC', 'S', 'School', 'n')");
  await db.execute("INSERT INTO year_groups (id, session_id, school_id, school_year, name, created_at) VALUES ('Y', 'S', 'SC', '2026-27', 'P7', 'n')");
  for (const c of ['A', 'B']) await db.execute(`INSERT INTO classes (id, session_id, school_id, school_year, year_group_id, name, created_at) VALUES ('${c}', 'S', 'SC', '2026-27', 'Y', '${c}', 'n')`);
  const pupils = [
    ['p1', 'A', 1, null],
    ['p2', 'A', 0, null],
    ['p3', 'A', 2, 'gone'],
    ['p4', 'B', 0, null],
  ] as const;
  for (const [id, cls, position, archived] of pupils)
    await db.execute("INSERT INTO class_pupils (id, session_id, class_id, label, position, created_at, archived_at) VALUES (?, 'S', ?, ?, ?, 'n', ?)", [id, cls, id, position, archived]);

  expect((await migrate(db)).applied).toEqual(['0025_pupil_numbers.sql']);
  const rows = (await db.execute('SELECT id, number FROM class_pupils ORDER BY id')).rows.map((r) => [r.id, Number(r.number)]);
  expect(rows).toEqual([
    ['p1', 2],
    ['p2', 1],
    ['p3', 3],
    ['p4', 1],
  ]);
  db.close();
});
