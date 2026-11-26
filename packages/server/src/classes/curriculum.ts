/**
 * A class's curriculum (docs/classes.md, C.4): items picked from the library, each kept with its
 * code, its text as picked and the library's version, and a status of planned, now or done.
 * Logged in full (`curriculum_pick`, `curriculum_status`): they are the curriculum's words.
 */
import type { Row, Transaction } from '../db/types.js';
import { CURRICULUM_PER_CLASS, CurriculumItem, newUlid, nowIso, type CurriculumPick, type CurriculumStatus } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { conflict, notFound } from '../http-error.js';

export function rowToCurriculum(r: Row): CurriculumItem {
  return CurriculumItem.parse({
    id: r.id,
    class_id: r.owner_id,
    framework: r.framework,
    code: r.code,
    kind: r.kind,
    text: r.text,
    source_version: r.source_version ?? null,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

export interface CurriculumService {
  /** The class's items not removed, oldest first. */
  list(sessionId: string, classId: string): Promise<CurriculumItem[]>;
  /** Adds items with one status; a code the class already has is left as it is. 404 for a class not this session's. */
  pick(sessionId: string, classId: string, picks: CurriculumPick[], status: CurriculumStatus, envelope: ServerEnvelope): Promise<CurriculumItem[]>;
  /** Null when the item is not this class's. */
  setStatus(sessionId: string, classId: string, itemId: string, status: CurriculumStatus | 'removed', envelope: ServerEnvelope): Promise<CurriculumItem | null>;
}

/** A class's items not removed, oldest first. */
export async function curriculumOf(x: Transaction | Db, sessionId: string, classId: string): Promise<CurriculumItem[]> {
  const sql = "SELECT * FROM class_curriculum WHERE session_id = ? AND owner_kind = 'class' AND owner_id = ? AND removed_at IS NULL ORDER BY created_at, rowid";
  const r = 'transaction' in x ? await x.execute(sql, [sessionId, classId]) : await x.execute({ sql, args: [sessionId, classId] });
  return r.rows.map(rowToCurriculum);
}

export function createCurriculumService(db: Db, events: EventStore): CurriculumService {
  const listIn = curriculumOf;

  return {
    list: (sessionId, classId) => listIn(db, sessionId, classId),

    pick(sessionId, classId, picks, status, envelope) {
      return db.transaction(async (tx) => {
        const c = await tx.execute({ sql: 'SELECT archived_at FROM classes WHERE session_id = ? AND id = ?', args: [sessionId, classId] });
        if (!c.rows[0]) throw notFound('class');
        const existing = await listIn(tx, sessionId, classId);
        const have = new Set(existing.map((i) => i.code.toLowerCase()));
        const fresh = picks.filter((p) => !have.has(p.code.toLowerCase()) && (have.add(p.code.toLowerCase()), true));
        if (existing.length + fresh.length > CURRICULUM_PER_CLASS) throw conflict(`a class holds at most ${CURRICULUM_PER_CLASS} curriculum items`, 'curriculum_full');
        const at = nowIso();
        const added: CurriculumItem[] = [];
        for (const p of fresh) {
          const item: CurriculumItem = { id: newUlid(), class_id: classId, framework: p.framework, code: p.code, kind: p.kind, text: p.text, source_version: p.source_version ?? null, status, created_at: at, updated_at: at };
          await tx.execute({
            sql: "INSERT INTO class_curriculum (id, session_id, owner_kind, owner_id, framework, code, kind, text, source_version, status, created_at, updated_at) VALUES (?, ?, 'class', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            args: [item.id, sessionId, classId, item.framework, item.code, item.kind, item.text, item.source_version, status, at, at],
          });
          added.push(item);
        }
        if (added.length) {
          const items = added.map((i) => ({ item_id: i.id, code: i.code, text: i.text, framework: i.framework, source_version: i.source_version, status: i.status }));
          await events.appendServer(sessionId, 'curriculum_pick', { class_id: classId, items }, envelope, tx);
        }
        return added;
      });
    },

    setStatus(sessionId, classId, itemId, status, envelope) {
      return db.transaction(async (tx) => {
        const item = (await listIn(tx, sessionId, classId)).find((i) => i.id === itemId);
        if (!item) return null;
        if (item.status === status) return item;
        const at = nowIso();
        if (status === 'removed') await tx.execute({ sql: 'UPDATE class_curriculum SET removed_at = ?, updated_at = ? WHERE id = ?', args: [at, at, itemId] });
        else await tx.execute({ sql: 'UPDATE class_curriculum SET status = ?, updated_at = ? WHERE id = ?', args: [status, at, itemId] });
        await events.appendServer(sessionId, 'curriculum_status', { class_id: classId, item_id: itemId, code: item.code, status, before: item.status }, envelope, tx);
        return status === 'removed' ? { ...item, updated_at: at } : { ...item, status, updated_at: at };
      });
    },
  };
}
