/**
 * Pre-save zero-retention PII moderation gate (T2).
 * Runs deterministic scanning first, then an optional zero-retention model classifier.
 * Never logs or persists blocked text; fails closed if a model classifier is configured
 * without zero-retention guarantees.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../db/client.js';
import { HttpError } from '../http-error.js';
import { piiHintMessage, scanDeterministicPii } from './deterministic.js';
import { attachModerationTarget, recordModerationCheck, type ModerationTargetKind } from './store.js';

export const PII_POLICY_VERSION = 'pii-v1';

export interface PiiClassifierResult {
  verdict: 'allowed' | 'blocked';
  categories: string[];
  model: string;
  cost_gbp?: number;
}

export interface PiiClassifier {
  classify(text: string): Promise<PiiClassifierResult>;
}

export interface CheckPiiOptions {
  db: Db;
  sessionId: string;
  targetKind: ModerationTargetKind;
  targetId?: string | null;
  text: string;
  zeroRetention: boolean;
  classifier?: PiiClassifier | null;
}

export function hashModerationText(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export { attachModerationTarget };

/**
 * Checks teacher-authored text for pupil PII before saving.
 * Returns `{ checkId: null }` for empty text, `{ checkId }` when allowed,
 * or throws 422 `pii_detected` (or 503 `pii_check_unavailable` when failing closed).
 */
export async function checkTeacherTextPii(opts: CheckPiiOptions): Promise<{ checkId: string | null }> {
  const trimmed = opts.text.trim();
  if (!trimmed) return { checkId: null };

  const text_hash = hashModerationText(trimmed);
  const target_id = opts.targetId ?? null;
  const det = scanDeterministicPii(trimmed);

  if (det.categories.length > 0) {
    await recordModerationCheck(opts.db, {
      session_id: opts.sessionId,
      target_kind: opts.targetKind,
      target_id,
      text_hash,
      verdict: 'blocked',
      categories: det.categories,
      redactions: det.redactions,
      model: null,
      policy_version: PII_POLICY_VERSION,
    });
    throw new HttpError(422, piiHintMessage(det.categories), 'pii_detected');
  }

  if (opts.classifier) {
    if (!opts.zeroRetention) {
      await recordModerationCheck(opts.db, {
        session_id: opts.sessionId,
        target_kind: opts.targetKind,
        target_id,
        text_hash,
        verdict: 'error',
        categories: ['zero_retention_required'],
        redactions: {},
        model: null,
        policy_version: PII_POLICY_VERSION,
      });
      throw new HttpError(503, 'PII moderation requires a zero-retention model configuration.', 'pii_check_unavailable');
    }

    let result: PiiClassifierResult;
    try {
      result = await opts.classifier.classify(trimmed);
    } catch {
      await recordModerationCheck(opts.db, {
        session_id: opts.sessionId,
        target_kind: opts.targetKind,
        target_id,
        text_hash,
        verdict: 'error',
        categories: ['classifier_error'],
        redactions: {},
        model: null,
        policy_version: PII_POLICY_VERSION,
      });
      throw new HttpError(503, 'Could not verify text for personal data. Please try again.', 'pii_check_unavailable');
    }

    const checkId = await recordModerationCheck(opts.db, {
      session_id: opts.sessionId,
      target_kind: opts.targetKind,
      target_id,
      text_hash,
      verdict: result.verdict,
      categories: result.categories,
      redactions: {},
      model: result.model,
      policy_version: PII_POLICY_VERSION,
      cost_gbp: result.cost_gbp ?? 0,
    });
    if (result.verdict === 'blocked') {
      throw new HttpError(422, piiHintMessage(result.categories), 'pii_detected');
    }
    return { checkId };
  }

  const checkId = await recordModerationCheck(opts.db, {
    session_id: opts.sessionId,
    target_kind: opts.targetKind,
    target_id,
    text_hash,
    verdict: 'allowed',
    categories: [],
    redactions: {},
    model: null,
    policy_version: PII_POLICY_VERSION,
  });
  return { checkId };
}
