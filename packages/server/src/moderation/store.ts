/**
 * Persistence for moderation_checks (migration 0053).
 * Never stores raw text — only text_hash, verdict, categories and redaction counts.
 * Strictly excluded from research events and export bundles.
 */
import { newUlid, nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';

export type ModerationTargetKind = 'class_note' | 'needs_group';
export type ModerationVerdict = 'allowed' | 'blocked' | 'error';

export interface NewModerationCheck {
  session_id: string;
  target_kind: ModerationTargetKind;
  target_id: string | null;
  text_hash: string;
  verdict: ModerationVerdict;
  categories: readonly string[];
  redactions: Record<string, number>;
  model: string | null;
  policy_version: string;
  cost_gbp?: number;
}

export async function recordModerationCheck(db: Db, input: NewModerationCheck): Promise<string> {
  const id = newUlid();
  await db.execute(
    `INSERT INTO moderation_checks
      (id, session_id, target_kind, target_id, text_hash, verdict, categories, redactions, model, policy_version, cost_gbp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.session_id,
      input.target_kind,
      input.target_id,
      input.text_hash,
      input.verdict,
      JSON.stringify(input.categories),
      JSON.stringify(input.redactions),
      input.model,
      input.policy_version,
      input.cost_gbp ?? 0,
      nowIso(),
    ],
  );
  return id;
}

export async function attachModerationTarget(db: Db, checkId: string, targetId: string): Promise<void> {
  await db.execute('UPDATE moderation_checks SET target_id = ? WHERE id = ?', [targetId, checkId]);
}
