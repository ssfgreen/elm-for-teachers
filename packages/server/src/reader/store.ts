/**
 * What the pupil's reader reads and writes (#213): the readings of the pupil's classes, one
 * reading's frozen copy with the prompts it allows (label and ticks only: never the hidden
 * instruction), and the pupil's own highlights, kept by membership (`class_members.id`).
 *
 * It reads `readings`, `reading_prompts`, `reader_prompts` and `classes` and writes only
 * `reader_highlights`. A highlight is not a research event: nothing here writes `events`.
 */
import { newUlid, nowIso, READER_HIGHLIGHTS_MAX, type Highlight, type HighlightCategory, type HighlightFields, type PupilPrompt, type PupilReadingItem, type ReadingBlock } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Row } from '../db/types.js';

/** A reading's row, removed or not. */
export interface ReadingRow {
  id: string;
  session_id: string;
  class_id: string;
  name: string;
  blocks: ReadingBlock[];
  follow_ups_max: number | null;
  removed: boolean;
}

export interface ReaderStore {
  /** The readings (not removed) of these classes, newest first. */
  readingsOf(classes: ReadonlyArray<{ class_id: string; class_name: string }>): Promise<PupilReadingItem[]>;
  /** A reading by id, removed or not; null when there is none. */
  reading(readingId: string): Promise<ReadingRow | null>;
  /** The prompts a reading allows that are still in the library, in its order: label and ticks only. */
  prompts(readingId: string): Promise<PupilPrompt[]>;
  /** The reading's own follow-up limit, else its class's; null when both follow config. */
  followUpsMax(r: ReadingRow): Promise<number | null>;
  highlights(memberId: string, readingId: string): Promise<Highlight[]>;
  /** 'full' at READER_HIGHLIGHTS_MAX. The caller has checked the range against the copy. */
  addHighlight(r: ReadingRow, memberId: string, h: HighlightFields): Promise<Highlight | 'full'>;
  /** False when the member has no such highlight on the reading. */
  removeHighlight(memberId: string, readingId: string, highlightId: string): Promise<boolean>;
}

const toHighlight = (r: Row): Highlight => ({
  id: String(r.id),
  block_id: String(r.block_id),
  start: Number(r.start),
  end: Number(r.end),
  category: r.category === null || r.category === undefined ? null : (String(r.category) as HighlightCategory),
  created_at: String(r.created_at),
});

const HIGHLIGHT_COLUMNS = 'id, block_id, start, "end", category, created_at';

export function createReaderStore(db: Db): ReaderStore {
  return {
    async readingsOf(classes) {
      if (classes.length === 0) return [];
      const names = new Map(classes.map((c) => [c.class_id, c.class_name]));
      const r = await db.execute(
        `SELECT id, name, class_id, created_at FROM readings WHERE removed_at IS NULL AND class_id IN (${classes.map(() => '?').join(', ')}) ORDER BY created_at DESC, id DESC`,
        classes.map((c) => c.class_id),
      );
      return r.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        class_id: String(row.class_id),
        class_name: names.get(String(row.class_id)) ?? '',
        set_on: String(row.created_at).slice(0, 10),
      }));
    },

    async reading(readingId) {
      const row = (await db.execute('SELECT id, session_id, class_id, name, blocks, follow_ups_max, removed_at FROM readings WHERE id = ?', [readingId])).rows[0];
      if (!row) return null;
      return {
        id: String(row.id),
        session_id: String(row.session_id),
        class_id: String(row.class_id),
        name: String(row.name),
        blocks: JSON.parse(String(row.blocks)) as ReadingBlock[],
        follow_ups_max: row.follow_ups_max === null ? null : Number(row.follow_ups_max),
        removed: row.removed_at !== null,
      };
    },

    async prompts(readingId) {
      // Named columns only: the instruction never leaves this query.
      const r = await db.execute(
        `SELECT p.id, p.label, p.after_highlight, p.follow_up FROM reading_prompts rp JOIN reader_prompts p ON p.id = rp.prompt_id
         WHERE rp.reading_id = ? AND p.removed_at IS NULL ORDER BY rp.position`,
        [readingId],
      );
      return r.rows.map((row) => ({ id: String(row.id), label: String(row.label), after_highlight: Number(row.after_highlight) === 1, follow_up: Number(row.follow_up) === 1 }));
    },

    async followUpsMax(reading) {
      if (reading.follow_ups_max !== null) return reading.follow_ups_max;
      const row = (await db.execute('SELECT reader_follow_ups_max FROM classes WHERE id = ?', [reading.class_id])).rows[0];
      return row && row.reader_follow_ups_max !== null ? Number(row.reader_follow_ups_max) : null;
    },

    async highlights(memberId, readingId) {
      const r = await db.execute(`SELECT ${HIGHLIGHT_COLUMNS} FROM reader_highlights WHERE member_id = ? AND reading_id = ? ORDER BY created_at, id`, [memberId, readingId]);
      return r.rows.map(toHighlight);
    },

    addHighlight(reading, memberId, h) {
      return db.transaction(async (tx) => {
        const n = Number((await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM reader_highlights WHERE member_id = ? AND reading_id = ?', args: [memberId, reading.id] })).rows[0]?.n ?? 0);
        if (n >= READER_HIGHLIGHTS_MAX) return 'full' as const;
        const made: Highlight = { id: newUlid(), block_id: h.block_id, start: h.start, end: h.end, category: h.category, created_at: nowIso() };
        await tx.execute({
          sql: 'INSERT INTO reader_highlights (id, session_id, class_id, reading_id, member_id, block_id, start, "end", category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [made.id, reading.session_id, reading.class_id, reading.id, memberId, made.block_id, made.start, made.end, made.category, made.created_at],
        });
        return made;
      });
    },

    async removeHighlight(memberId, readingId, highlightId) {
      const r = await db.execute('DELETE FROM reader_highlights WHERE id = ? AND member_id = ? AND reading_id = ?', [highlightId, memberId, readingId]);
      return r.rowsAffected > 0;
    },
  };
}
