/**
 * The teacher's preferences for a workspace (shared/src/preferences.ts). A change is logged
 * (preferences_set, only the fields that changed) in the same transaction as the write.
 */
import type { Transaction } from '../db/types.js';
import { DocFont, NO_PREFERENCES, nowIso, type DocStyle, type Preferences, type PreferencesUpdate } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';

export interface PreferenceService {
  get(sessionId: string, tx?: Transaction): Promise<Preferences>;
  /** Sets the fields given; blank text clears the note. Setting what is already there logs nothing. */
  set(sessionId: string, update: PreferencesUpdate, envelope: ServerEnvelope): Promise<Preferences>;
}

/** The look a new doc starts with, from the preferences (undefined: the default look). */
export function newDocStyle(p: Preferences): DocStyle | undefined {
  return p.default_font ? { font: p.default_font } : undefined;
}

export function createPreferenceService(db: Db, events: EventStore): PreferenceService {
  async function get(sessionId: string, tx?: Transaction): Promise<Preferences> {
    const sql = 'SELECT teacher_note, default_font FROM preferences WHERE session_id = ?';
    const r = tx ? await tx.execute({ sql, args: [sessionId] }) : await db.execute(sql, [sessionId]);
    const row = r.rows[0];
    if (!row) return { ...NO_PREFERENCES };
    const font = DocFont.safeParse(row.default_font);
    return { teacher_note: row.teacher_note == null ? null : String(row.teacher_note), default_font: font.success ? font.data : null };
  }

  return {
    get,

    async set(sessionId, update, envelope) {
      return db.transaction(async (tx) => {
        const before = await get(sessionId, tx);
        const after: Preferences = { ...before };
        if (update.teacher_note !== undefined) after.teacher_note = update.teacher_note?.trim() || null;
        if (update.default_font !== undefined) after.default_font = update.default_font;
        const changed: Partial<Preferences> = {};
        if (after.teacher_note !== before.teacher_note) changed.teacher_note = after.teacher_note;
        if (after.default_font !== before.default_font) changed.default_font = after.default_font;
        if (Object.keys(changed).length) {
          await tx.execute({
            sql: 'INSERT INTO preferences (session_id, teacher_note, default_font, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (session_id) DO UPDATE SET teacher_note = excluded.teacher_note, default_font = excluded.default_font, updated_at = excluded.updated_at',
            args: [sessionId, after.teacher_note, after.default_font, nowIso()],
          });
          await events.appendServer(sessionId, 'preferences_set', changed, envelope, tx);
        }
        return after;
      });
    },
  };
}
