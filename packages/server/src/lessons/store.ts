/**
 * Teacher onboarding lesson progress store (migration 0055).
 * Keyed on session_id (not account_id) so secret-link study participants (/s/<token>)
 * can complete interactive onboarding lessons alongside signed-in teachers.
 */
import { nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Row } from '../db/types.js';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  session_id: string;
  lesson_id: string;
  status: LessonStatus;
  state: Record<string, unknown> | null;
  updated_at: string;
  completed_at: string | null;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function rowToLesson(r: Row): LessonProgress {
  const rawState = str(r.state_json);
  return {
    session_id: String(r.session_id),
    lesson_id: String(r.lesson_id),
    status: String(r.status) as LessonStatus,
    state: rawState ? (JSON.parse(rawState) as Record<string, unknown>) : null,
    updated_at: String(r.updated_at),
    completed_at: str(r.completed_at),
  };
}

export async function listLessonProgress(db: Db, sessionId: string): Promise<LessonProgress[]> {
  const r = await db.execute('SELECT * FROM lesson_progress WHERE session_id = ? ORDER BY lesson_id', [sessionId]);
  return r.rows.map(rowToLesson);
}

export async function upsertLessonProgress(
  db: Db,
  sessionId: string,
  lessonId: string,
  input: { status: LessonStatus; state?: Record<string, unknown> | null },
): Promise<LessonProgress> {
  const now = nowIso();
  const existing = await db.execute('SELECT * FROM lesson_progress WHERE session_id = ? AND lesson_id = ?', [sessionId, lessonId]);
  const prev = existing.rows[0] ? rowToLesson(existing.rows[0]) : null;
  const completedAt = input.status === 'completed' ? (prev?.completed_at ?? now) : null;
  const state = input.state === undefined ? (prev?.state ?? null) : input.state;
  const stateJson = state ? JSON.stringify(state) : null;

  if (prev) {
    await db.execute(
      'UPDATE lesson_progress SET status = ?, state_json = ?, updated_at = ?, completed_at = ? WHERE session_id = ? AND lesson_id = ?',
      [input.status, stateJson, now, completedAt, sessionId, lessonId],
    );
  } else {
    await db.execute(
      'INSERT INTO lesson_progress (session_id, lesson_id, status, state_json, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, lessonId, input.status, stateJson, now, completedAt],
    );
  }
  return { session_id: sessionId, lesson_id: lessonId, status: input.status, state, updated_at: now, completed_at: completedAt };
}
