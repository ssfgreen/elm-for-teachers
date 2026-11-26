/**
 * Append-only event log.
 *
 * Seq assignment: every append runs inside a write transaction (libsql `BEGIN IMMEDIATE`
 * for local files), and each event's seq is read as `MAX(seq) + 1` through that same
 * transaction immediately before its insert. The write lock makes the read-then-insert
 * atomic, so seq is gapless per session and concurrent appends cannot collide; because seq
 * is re-read per event, hooks may append server events in between client events.
 *
 * De-duplication: the event_ids of a client batch are looked up in one `IN` query and
 * any already stored (or repeated within the batch) are skipped, so a resent beacon batch
 * is accepted as a no-op and returns the same last_seq.
 */
import type { InValue, Transaction } from '../db/types.js';
import { newUlid, nowIso, type ClientEvent, type Event, type EventKind } from '@edw/shared';
import type { Db } from '../db/client.js';
import { eventToRow, rowToEvent } from '../db/rows.js';
import type { EventHook, EventStore, ServerEnvelope } from '../deps.js';

const INSERT_SQL = `INSERT INTO events (session_id, seq, event_id, kind, client_ts, server_ts, focus_pane, doc_id, thread_id, payload)
  VALUES (:session_id, :seq, :event_id, :kind, :client_ts, :server_ts, :focus_pane, :doc_id, :thread_id, :payload)`;

async function insert(tx: Transaction, event: Event): Promise<void> {
  await tx.execute({ sql: INSERT_SQL, args: eventToRow(event) });
}

export function createEventStore(db: Db): EventStore {
  const hooks: EventHook[] = [];

  async function nextSeq(tx: Transaction, sessionId: string): Promise<number> {
    const r = await tx.execute({
      sql: 'SELECT COALESCE(MAX(seq), 0) AS n FROM events WHERE session_id = ?',
      args: [sessionId],
    });
    return Number(r.rows[0]?.n ?? 0) + 1;
  }

  return {
    async appendClient(sessionId: string, events: ClientEvent[]) {
      if (events.length === 0) {
        return { accepted: 0, last_seq: await this.lastSeq(sessionId), stored: [] };
      }
      return db.transaction(async (tx) => {
        const ids = events.map((e) => e.event_id);
        const existing = await tx.execute({
          sql: `SELECT event_id FROM events WHERE event_id IN (${ids.map(() => '?').join(', ')})`,
          args: ids,
        });
        const seen = new Set(existing.rows.map((r) => String(r.event_id)));
        const stored: Event[] = [];
        for (const ce of events) {
          if (seen.has(ce.event_id)) continue;
          seen.add(ce.event_id);
          const event = { ...ce, session_id: sessionId, seq: await nextSeq(tx, sessionId), server_ts: nowIso() } as Event;
          await insert(tx, event);
          stored.push(event);
          for (const hook of hooks) await hook(event, tx);
        }
        const last = await nextSeq(tx, sessionId);
        return { accepted: stored.length, last_seq: last - 1, stored };
      });
    },

    async appendServer(sessionId, kind, payload, envelope: ServerEnvelope, tx?: Transaction) {
      const build = async (t: Transaction): Promise<Event> => {
        const event = {
          event_id: envelope.event_id ?? newUlid(),
          session_id: sessionId,
          seq: await nextSeq(t, sessionId),
          server_ts: nowIso(),
          client_ts: envelope.client_ts,
          focus_pane: envelope.focus_pane,
          doc_id: envelope.doc_id,
          thread_id: envelope.thread_id,
          kind,
          payload,
        } as Event;
        await insert(t, event);
        return event;
      };
      return tx ? build(tx) : db.transaction(build);
    },

    async list(sessionId, opts = {}) {
      if (opts.kinds && opts.kinds.length === 0) return [];
      const where = ['session_id = ?'];
      const args: InValue[] = [sessionId];
      if (opts.fromSeq !== undefined) {
        where.push('seq >= ?');
        args.push(opts.fromSeq);
      }
      if (opts.toSeq !== undefined) {
        where.push('seq <= ?');
        args.push(opts.toSeq);
      }
      if (opts.kinds) {
        where.push(`kind IN (${opts.kinds.map(() => '?').join(', ')})`);
        args.push(...(opts.kinds as EventKind[]));
      }
      const r = await db.execute(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY seq`, args);
      return r.rows.map(rowToEvent);
    },

    async lastSeq(sessionId) {
      const r = await db.execute('SELECT COALESCE(MAX(seq), 0) AS n FROM events WHERE session_id = ?', [sessionId]);
      return Number(r.rows[0]?.n ?? 0);
    },

    async countSince(sessionId, kind, since) {
      const r = await db.execute('SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND kind = ? AND server_ts > ?', [sessionId, kind, since]);
      return Number(r.rows[0]?.n ?? 0);
    },

    addHook(hook) {
      hooks.push(hook);
    },
  };
}
