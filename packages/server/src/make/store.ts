/** The make kit's board, one row per workspace in make_boards (migration 0015). The only SQL on that table. */
import type { Transaction } from '../db/types.js';
import { EMPTY_BOARD, MakeBoard } from '@edw/shared';
import type { AppDeps } from '../deps.js';

export async function loadBoard(db: AppDeps['db'], sessionId: string): Promise<{ board: MakeBoard; updated_at: string | null }> {
  const r = await db.execute('SELECT board, updated_at FROM make_boards WHERE session_id = ?', [sessionId]);
  const row = r.rows[0];
  if (!row) return { board: EMPTY_BOARD, updated_at: null };
  return { board: MakeBoard.parse(JSON.parse(String(row.board))), updated_at: String(row.updated_at) };
}

export async function saveBoard(tx: Transaction, sessionId: string, board: MakeBoard, at: string): Promise<void> {
  await tx.execute({
    sql: 'INSERT INTO make_boards (session_id, board, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET board = excluded.board, updated_at = excluded.updated_at',
    args: [sessionId, JSON.stringify(board), at],
  });
}
