/**
 * A class's settings for the pupil reader (#186, #195): three nullable columns on `classes`
 * (migrations 0044, 0046). NULL means config's default, read when asked (never kept), so a class
 * that has not chosen follows config. A real change to the follow-up limit or the budget is logged
 * as `class_reader_settings` with the class's id and the figures in force after it (question 81);
 * a change to the safety instruction as `class_reader_safety_set`, with a hash and the length of
 * the text, never the text (question 88, Sam 23 Nov 2026). A change to the same values is not logged.
 */
import type { ClassReaderSettings, ClassReaderSettingsPatch } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import type { Db } from '../db/client.js';
import { run, type DbOrTx } from '../db/run.js';
import type { Row, Transaction } from '../db/types.js';
import type { EventStore, ServerEnvelope } from '../deps.js';

/** Config `reader`'s defaults (`ReaderConfig` fits). */
export interface ReaderDefaults {
  follow_ups_max: number;
  pupil_budget_gbp: number;
  safety_instruction: string;
}

export interface ReaderSettingsStore {
  /** Null for a class not in this workspace. */
  get(sessionId: string, classId: string): Promise<ClassReaderSettings | null>;
  /** Null for a class not in this workspace. */
  set(sessionId: string, classId: string, patch: ClassReaderSettingsPatch, envelope: ServerEnvelope): Promise<ClassReaderSettings | null>;
}

type Stored = { follow_ups_max: number | null; pupil_budget_gbp: number | null; safety_instruction: string | null };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** To the penny: PostgreSQL's REAL is single precision, so 0.07 can come back as 0.0700000003. */
const pence = (v: unknown): number | null => (num(v) === null ? null : Math.round(Number(v) * 100) / 100);
const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

async function stored(x: DbOrTx, sessionId: string, classId: string): Promise<Stored | null> {
  const r = await run(x, { sql: 'SELECT reader_follow_ups_max, reader_pupil_budget_gbp, reader_safety_instruction FROM classes WHERE session_id = ? AND id = ?', args: [sessionId, classId] });
  const row: Row | undefined = r.rows[0];
  return row ? { follow_ups_max: num(row.reader_follow_ups_max), pupil_budget_gbp: pence(row.reader_pupil_budget_gbp), safety_instruction: text(row.reader_safety_instruction) } : null;
}

const write = (tx: Transaction, sessionId: string, classId: string, s: Stored) =>
  tx.execute({
    sql: 'UPDATE classes SET reader_follow_ups_max = ?, reader_pupil_budget_gbp = ?, reader_safety_instruction = ? WHERE session_id = ? AND id = ?',
    args: [s.follow_ups_max, s.pupil_budget_gbp, s.safety_instruction, sessionId, classId],
  });

/** The values in force, config's defaults, and which the teacher set. Pure. */
export function effective(s: Stored, defaults: ReaderDefaults): ClassReaderSettings {
  const { follow_ups_max, pupil_budget_gbp, safety_instruction } = defaults;
  return {
    follow_ups_max: s.follow_ups_max ?? follow_ups_max,
    pupil_budget_gbp: s.pupil_budget_gbp ?? pupil_budget_gbp,
    safety_instruction: s.safety_instruction ?? safety_instruction,
    defaults: { follow_ups_max, pupil_budget_gbp, safety_instruction },
    set: { follow_ups_max: s.follow_ups_max !== null, pupil_budget_gbp: s.pupil_budget_gbp !== null, safety_instruction: s.safety_instruction !== null },
  };
}

/**
 * The safety instruction a class's reader runs under: the class's own, or config's default.
 * The one place the server works this out (R2 will send it). Null for a class not in this workspace.
 */
export async function classSafetyInstruction(x: DbOrTx, sessionId: string, classId: string, defaults: Pick<ReaderDefaults, 'safety_instruction'>): Promise<string | null> {
  const s = await stored(x, sessionId, classId);
  return s ? (s.safety_instruction ?? defaults.safety_instruction) : null;
}

/** `class_reader_settings`: the class, and the figures in force after the change (question 81). */
const figures = (classId: string, s: ClassReaderSettings) => ({ class_id: classId, follow_ups_max: s.follow_ups_max, pupil_budget_gbp: s.pupil_budget_gbp });

/** `class_reader_safety_set`: never the text, only whether it is the default, its hash and its length. */
export const safetyPayload = (classId: string, s: ClassReaderSettings) => ({
  class_id: classId,
  is_default: !s.set.safety_instruction,
  text_hash: `sha256:${sha256Hex(s.safety_instruction)}`,
  text_length: s.safety_instruction.length,
});

/** Logs what changed between two stored states, if anything. */
async function logChanges(tx: Transaction, events: EventStore, sessionId: string, classId: string, before: Stored, after: Stored, defaults: ReaderDefaults, envelope: ServerEnvelope): Promise<ClassReaderSettings> {
  const now = effective(after, defaults);
  if (after.follow_ups_max !== before.follow_ups_max || after.pupil_budget_gbp !== before.pupil_budget_gbp) {
    await events.appendServer(sessionId, 'class_reader_settings', figures(classId, now), envelope, tx);
  }
  if (after.safety_instruction !== before.safety_instruction) {
    await events.appendServer(sessionId, 'class_reader_safety_set', safetyPayload(classId, now), envelope, tx);
  }
  return now;
}

/**
 * Gives the new class the old one's settings, inside the copy's transaction, and logs what there
 * was to carry. Used by "Copy to next year" (copy.ts).
 */
export async function copyReaderSettings(tx: Transaction, events: EventStore, defaults: ReaderDefaults, sessionId: string, fromId: string, toId: string, envelope: ServerEnvelope): Promise<void> {
  const from = await stored(tx, sessionId, fromId);
  const blank: Stored = { follow_ups_max: null, pupil_budget_gbp: null, safety_instruction: null };
  if (!from || (from.follow_ups_max === null && from.pupil_budget_gbp === null && from.safety_instruction === null)) return;
  await write(tx, sessionId, toId, from);
  await logChanges(tx, events, sessionId, toId, blank, from, defaults, envelope);
}

export function createReaderSettingsStore(db: Db, events: EventStore, defaults: () => ReaderDefaults): ReaderSettingsStore {
  return {
    async get(sessionId, classId) {
      const s = await stored(db, sessionId, classId);
      return s ? effective(s, defaults()) : null;
    },

    set(sessionId, classId, patch, envelope) {
      return db.transaction(async (tx) => {
        const before = await stored(tx, sessionId, classId);
        if (!before) return null;
        const pick = <K extends keyof Stored>(k: K): Stored[K] => (patch[k] === undefined ? before[k] : (patch[k] as Stored[K]));
        const after: Stored = { follow_ups_max: pick('follow_ups_max'), pupil_budget_gbp: pick('pupil_budget_gbp'), safety_instruction: pick('safety_instruction') };
        const changed = (Object.keys(after) as (keyof Stored)[]).some((k) => after[k] !== before[k]);
        if (changed) await write(tx, sessionId, classId, after);
        return logChanges(tx, events, sessionId, classId, before, after, defaults(), envelope);
      });
    },
  };
}
