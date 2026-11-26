/**
 * The reader's asks in the database (#214): `reader_asks` (ids, tokens and cost) and
 * `reader_ask_texts` (the passage and the reply, keyed by the ask), migrations 0050 and 0051. Never `events`, `gateway_calls`
 * or the export (question 49). Reads the reading, its prompts and the library's rows directly, so
 * an ask writes nothing anywhere else (the library's own `list` can put its defaults in, and logs).
 */
import { ReadingBlock, type ReadingBlock as Block } from '@edw/shared';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import type { Row } from '../db/types.js';
import type { EarlierAsk } from './request.js';

/** The longest chain walked: above any follow-up limit a class can set (10). */
const CHAIN_MAX = 20;

export interface AskReading {
  id: string;
  session_id: string;
  class_id: string;
  blocks: Block[];
  /** Its own follow-up limit; null for the class's. */
  follow_ups_max: number | null;
  /** Removed by the teacher: still found, so a pupil of another class is told 403, not 404. */
  removed: boolean;
}

export interface AskPrompt {
  id: string;
  instruction: string;
  after_highlight: boolean;
  follow_up: boolean;
}

export interface NewAsk {
  id: string;
  session_id: string;
  class_id: string;
  reading_id: string;
  member_id: string;
  prompt_id: string;
  parent_ask_id: string | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cache_write_tokens: number | null;
  cost_gbp: number | null;
  config_hash: string;
  safety_hash: string;
  created_at: string;
  highlighted_text: string;
  reply: string;
}

const intOrNull = (v: unknown) => (v == null ? null : Number(v));

export interface ReaderAskStore {
  /** A reading, removed or not, with its frozen copy; null for an unknown id. */
  reading(readingId: string): Promise<AskReading | null>;
  /** The prompt, if the reading allows it and it is still in the library; null otherwise. */
  prompt(reading: Pick<AskReading, 'id' | 'session_id'>, promptId: string): Promise<AskPrompt | null>;
  /**
   * The chain an ask follows up, oldest first and ending with `parentId`: null unless the parent
   * is this member's ask on this reading. Each earlier ask has its prompt's instruction as it is now.
   */
  chain(memberId: string, readingId: string, parentId: string): Promise<EarlierAsk[] | null>;
  /** What this membership's asks have cost, in pounds. */
  memberSpendGbp(memberId: string): Promise<number>;
  /** The ask and its words, in one transaction. */
  save(ask: NewAsk): Promise<void>;
}

export function createReaderAskStore(db: Db): ReaderAskStore {
  return {
    async reading(readingId) {
      const r = (await db.execute('SELECT id, session_id, class_id, blocks, follow_ups_max, removed_at FROM readings WHERE id = ?', [readingId])).rows[0];
      if (!r) return null;
      return {
        id: String(r.id),
        session_id: String(r.session_id),
        class_id: String(r.class_id),
        blocks: z.array(ReadingBlock).parse(JSON.parse(String(r.blocks))),
        follow_ups_max: intOrNull(r.follow_ups_max),
        removed: r.removed_at != null,
      };
    },

    async prompt(reading, promptId) {
      const r = (
        await db.execute(
          `SELECT p.id, p.instruction, p.after_highlight, p.follow_up FROM reading_prompts rp
           JOIN reader_prompts p ON p.id = rp.prompt_id
           WHERE rp.reading_id = ? AND rp.prompt_id = ? AND p.session_id = ? AND p.removed_at IS NULL`,
          [reading.id, promptId, reading.session_id],
        )
      ).rows[0];
      return r ? { id: String(r.id), instruction: String(r.instruction), after_highlight: Number(r.after_highlight) === 1, follow_up: Number(r.follow_up) === 1 } : null;
    },

    async chain(memberId, readingId, parentId) {
      const out: EarlierAsk[] = [];
      let next: string | null = parentId;
      while (next !== null && out.length < CHAIN_MAX) {
        const r: Row | undefined = (
          await db.execute(
            `SELECT a.parent_ask_id, p.instruction, t.highlighted_text, t.reply FROM reader_asks a
             JOIN reader_prompts p ON p.id = a.prompt_id
             JOIN reader_ask_texts t ON t.ask_id = a.id
             WHERE a.id = ? AND a.member_id = ? AND a.reading_id = ?`,
            [next, memberId, readingId],
          )
        ).rows[0];
        if (!r) return null;
        out.unshift({ highlighted_text: String(r.highlighted_text), instruction: String(r.instruction), reply: String(r.reply) });
        next = r.parent_ask_id == null ? null : String(r.parent_ask_id);
      }
      return out;
    },

    async memberSpendGbp(memberId) {
      const r = await db.execute('SELECT COALESCE(SUM(cost_gbp), 0) AS gbp FROM reader_asks WHERE member_id = ?', [memberId]);
      return Number(r.rows[0]?.gbp ?? 0);
    },

    save: (a) =>
      db.transaction(async (tx) => {
        await tx.execute({
          sql: `INSERT INTO reader_asks (id, session_id, class_id, reading_id, member_id, prompt_id, parent_ask_id, model, input_tokens, output_tokens, cached_tokens, cache_write_tokens, cost_gbp, config_hash, safety_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [a.id, a.session_id, a.class_id, a.reading_id, a.member_id, a.prompt_id, a.parent_ask_id, a.model, a.input_tokens, a.output_tokens, a.cached_tokens, a.cache_write_tokens, a.cost_gbp, a.config_hash, a.safety_hash, a.created_at],
        });
        await tx.execute({
          sql: 'INSERT INTO reader_ask_texts (ask_id, session_id, highlighted_text, reply) VALUES (?, ?, ?, ?)',
          args: [a.id, a.session_id, a.highlighted_text, a.reply],
        });
      }),
  };
}
