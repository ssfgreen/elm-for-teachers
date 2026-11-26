import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openDb } from './client.js';
import { migrate } from './migrate.js';

let dir: string | undefined;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

it('migration 0051 keeps the words of pupils’ asks and drops their link to the membership', async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'edw-0051-'));
  const db = openDb({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  // Back to how 0050 left the table, with an ask in it (only its workspace is checked by the copy).
  await db.execute('DROP TABLE reader_ask_texts');
  await db.execute(`CREATE TABLE reader_ask_texts (
    ask_id TEXT PRIMARY KEY REFERENCES reader_asks(id),
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    member_id TEXT NOT NULL REFERENCES class_members(id),
    highlighted_text TEXT NOT NULL,
    reply TEXT NOT NULL)`);
  await db.execute("DELETE FROM schema_migrations WHERE name = '0051_reader_ask_texts_kept.sql'");
  await db.execute("INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at) VALUES ('S', 'x', 't', 'h', 'h', 'n', 'n')");
  await db.execute('PRAGMA foreign_keys = OFF');
  await db.execute("INSERT INTO reader_asks (id, session_id, class_id, reading_id, member_id, prompt_id, model, config_hash, safety_hash, created_at) VALUES ('A1', 'S', 'C', 'R', 'M', 'P', 'm', 'h', 'h', 'n')");
  await db.execute("INSERT INTO reader_ask_texts (ask_id, session_id, member_id, highlighted_text, reply) VALUES ('A1', 'S', 'M', 'straight roads', 'Why straight?')");
  await db.execute('PRAGMA foreign_keys = ON');

  expect((await migrate(db)).applied).toEqual(['0051_reader_ask_texts_kept.sql']);
  expect((await db.execute('SELECT * FROM reader_ask_texts')).rows.map((r) => ({ ...r }))).toEqual([{ ask_id: 'A1', session_id: 'S', highlighted_text: 'straight roads', reply: 'Why straight?' }]);
  db.close();
});
