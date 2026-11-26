/**
 * Needs groups store (T1, migration 0052): generic or class-assigned groups of learning needs
 * ("Dyslexia group", "Level 1 learners") and their chosen library adaptations.
 * Holds zero pupil personal data.
 */
import {
  ADAPTATIONS_PER_NEEDS_GROUP,
  NEEDS_GROUPS_PER_SESSION,
  NeedsGroup,
  NeedsGroupAdaptation,
  newUlid,
  nowIso,
  type AdaptationPick,
  type AdaptationStatus,
  type NeedsGroupInput,
  type NeedsGroupSummary,
  type NeedsGroupUpdate,
} from '@edw/shared';
import type { Db } from '../db/client.js';
import { run, type DbOrTx } from '../db/run.js';
import type { Row, Transaction } from '../db/types.js';
import { conflict, notFound } from '../http-error.js';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const orNull = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

function rowToGroup(r: Row): NeedsGroup {
  return NeedsGroup.parse({
    id: r.id,
    session_id: r.session_id,
    name: r.name,
    description: str(r.description),
    what_helps: str(r.what_helps),
    position: Number(r.position ?? 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: str(r.archived_at),
  });
}

function rowToAdaptation(r: Row): NeedsGroupAdaptation {
  return NeedsGroupAdaptation.parse({
    id: r.id,
    needs_group_id: r.needs_group_id,
    entry_id: r.entry_id,
    title: r.title,
    changes_goal: Number(r.changes_goal) === 1,
    status: r.status,
    overrides: str(r.overrides),
    source_version: str(r.source_version),
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

async function hydrate(x: DbOrTx, sessionId: string, groups: NeedsGroup[]): Promise<NeedsGroupSummary[]> {
  if (!groups.length) return [];
  const [links, adapts] = await Promise.all([
    run(x, { sql: 'SELECT needs_group_id, class_id FROM needs_group_classes WHERE session_id = ? ORDER BY created_at', args: [sessionId] }),
    run(x, { sql: 'SELECT * FROM needs_group_adaptations WHERE session_id = ? AND removed_at IS NULL ORDER BY created_at, id', args: [sessionId] }),
  ]);
  const classesByGroup = new Map<string, string[]>();
  for (const r of links.rows) {
    const gid = String(r.needs_group_id);
    const list = classesByGroup.get(gid) ?? [];
    list.push(String(r.class_id));
    classesByGroup.set(gid, list);
  }
  const adaptsByGroup = new Map<string, NeedsGroupAdaptation[]>();
  for (const r of adapts.rows) {
    const a = rowToAdaptation(r);
    const list = adaptsByGroup.get(a.needs_group_id) ?? [];
    list.push(a);
    adaptsByGroup.set(a.needs_group_id, list);
  }
  return groups.map((g) => ({
    ...g,
    class_ids: classesByGroup.get(g.id) ?? [],
    adaptations: adaptsByGroup.get(g.id) ?? [],
  }));
}

/** Active needs groups linked to a class, with their chosen adaptations. */
export async function needsGroupsForClass(db: Db, sessionId: string, classId: string): Promise<NeedsGroupSummary[]> {
  const r = await db.execute(
    `SELECT g.* FROM needs_groups g
     JOIN needs_group_classes l ON l.needs_group_id = g.id
     WHERE g.session_id = ? AND l.class_id = ? AND g.archived_at IS NULL
     ORDER BY g.position, g.created_at, g.id`,
    [sessionId, classId],
  );
  return hydrate(db, sessionId, r.rows.map(rowToGroup));
}

/** One needs group with its class links and adaptations, or null if not in this session. */
export async function getNeedsGroup(db: Db, sessionId: string, groupId: string): Promise<NeedsGroupSummary | null> {
  const r = await db.execute('SELECT * FROM needs_groups WHERE session_id = ? AND id = ?', [sessionId, groupId]);
  if (!r.rows[0]) return null;
  const [hydrated] = await hydrate(db, sessionId, [rowToGroup(r.rows[0])]);
  return hydrated ?? null;
}

export interface NeedsGroupStore {
  list(sessionId: string): Promise<NeedsGroupSummary[]>;
  get(sessionId: string, groupId: string): Promise<NeedsGroupSummary | null>;
  create(sessionId: string, input: NeedsGroupInput): Promise<NeedsGroupSummary>;
  update(sessionId: string, groupId: string, patch: NeedsGroupUpdate): Promise<NeedsGroupSummary | null>;
  archive(sessionId: string, groupId: string): Promise<NeedsGroupSummary | null>;
  attachClass(sessionId: string, groupId: string, classId: string): Promise<NeedsGroupSummary | null>;
  detachClass(sessionId: string, groupId: string, classId: string): Promise<NeedsGroupSummary | null>;
  addAdaptation(sessionId: string, groupId: string, pick: AdaptationPick): Promise<NeedsGroupAdaptation | null>;
  updateAdaptation(sessionId: string, groupId: string, adaptationId: string, fields: { status?: AdaptationStatus; overrides?: string | null }): Promise<NeedsGroupAdaptation | null>;
  removeAdaptation(sessionId: string, groupId: string, adaptationId: string): Promise<NeedsGroupAdaptation | null>;
}

async function assertClassOpen(tx: Transaction, sessionId: string, classId: string): Promise<void> {
  const r = await tx.execute({ sql: 'SELECT archived_at FROM classes WHERE session_id = ? AND id = ?', args: [sessionId, classId] });
  if (!r.rows[0]) throw notFound('class');
  if (r.rows[0].archived_at != null) throw conflict('that class is archived', 'class_archived');
}

export function createNeedsGroupStore(db: Db): NeedsGroupStore {
  const loadOne = async (tx: DbOrTx, sessionId: string, id: string): Promise<NeedsGroup | null> => {
    const r = await run(tx, { sql: 'SELECT * FROM needs_groups WHERE session_id = ? AND id = ?', args: [sessionId, id] });
    return r.rows[0] ? rowToGroup(r.rows[0]) : null;
  };

  return {
    async list(sessionId) {
      const r = await db.execute('SELECT * FROM needs_groups WHERE session_id = ? ORDER BY position, created_at, id', [sessionId]);
      return hydrate(db, sessionId, r.rows.map(rowToGroup));
    },

    get: (sessionId, groupId) => getNeedsGroup(db, sessionId, groupId),

    create(sessionId, input) {
      return db.transaction(async (tx) => {
        const count = await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM needs_groups WHERE session_id = ? AND archived_at IS NULL', args: [sessionId] });
        if (Number(count.rows[0]?.n ?? 0) >= NEEDS_GROUPS_PER_SESSION) {
          throw conflict(`a workspace holds at most ${NEEDS_GROUPS_PER_SESSION} needs groups`, 'needs_groups_full');
        }
        const posRow = await tx.execute({ sql: 'SELECT COALESCE(MAX(position), -1) AS m FROM needs_groups WHERE session_id = ?', args: [sessionId] });
        const position = Number(posRow.rows[0]?.m ?? -1) + 1;
        const at = nowIso();
        const id = newUlid();
        const g: NeedsGroup = {
          id,
          session_id: sessionId,
          name: input.name.trim(),
          description: orNull(input.description),
          what_helps: orNull(input.what_helps),
          position,
          created_at: at,
          updated_at: at,
          archived_at: null,
        };
        await tx.execute({
          sql: 'INSERT INTO needs_groups (id, session_id, name, description, what_helps, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [g.id, sessionId, g.name, g.description, g.what_helps, g.position, at, at],
        });
        const uniqueClasses = [...new Set(input.class_ids ?? [])];
        for (const classId of uniqueClasses) {
          await assertClassOpen(tx, sessionId, classId);
          await tx.execute({
            sql: 'INSERT INTO needs_group_classes (needs_group_id, class_id, session_id, created_at) VALUES (?, ?, ?, ?)',
            args: [g.id, classId, sessionId, at],
          });
        }
        return { ...g, class_ids: uniqueClasses, adaptations: [] };
      });
    },

    update(sessionId, groupId, patch) {
      return db.transaction(async (tx) => {
        const g = await loadOne(tx, sessionId, groupId);
        if (!g) return null;
        const next: NeedsGroup = {
          ...g,
          name: patch.name !== undefined && patch.name.trim() ? patch.name.trim() : g.name,
          description: patch.description !== undefined ? orNull(patch.description) : g.description,
          what_helps: patch.what_helps !== undefined ? orNull(patch.what_helps) : g.what_helps,
          position: patch.position !== undefined ? patch.position : g.position,
          updated_at: nowIso(),
        };
        await tx.execute({
          sql: 'UPDATE needs_groups SET name = ?, description = ?, what_helps = ?, position = ?, updated_at = ? WHERE id = ?',
          args: [next.name, next.description, next.what_helps, next.position, next.updated_at, groupId],
        });
        const [hydrated] = await hydrate(tx, sessionId, [next]);
        return hydrated ?? null;
      });
    },

    archive(sessionId, groupId) {
      return db.transaction(async (tx) => {
        const g = await loadOne(tx, sessionId, groupId);
        if (!g) return null;
        const at = g.archived_at ?? nowIso();
        if (!g.archived_at) {
          await tx.execute({ sql: 'UPDATE needs_groups SET archived_at = ?, updated_at = ? WHERE id = ?', args: [at, at, groupId] });
        }
        const [hydrated] = await hydrate(tx, sessionId, [{ ...g, archived_at: at, updated_at: at }]);
        return hydrated ?? null;
      });
    },

    attachClass(sessionId, groupId, classId) {
      return db.transaction(async (tx) => {
        const g = await loadOne(tx, sessionId, groupId);
        if (!g) return null;
        if (g.archived_at) throw conflict('that needs group is archived', 'needs_group_archived');
        await assertClassOpen(tx, sessionId, classId);
        const existing = await tx.execute({
          sql: 'SELECT 1 FROM needs_group_classes WHERE needs_group_id = ? AND class_id = ?',
          args: [groupId, classId],
        });
        if (!existing.rows.length) {
          await tx.execute({
            sql: 'INSERT INTO needs_group_classes (needs_group_id, class_id, session_id, created_at) VALUES (?, ?, ?, ?)',
            args: [groupId, classId, sessionId, nowIso()],
          });
        }
        const [hydrated] = await hydrate(tx, sessionId, [g]);
        return hydrated ?? null;
      });
    },

    detachClass(sessionId, groupId, classId) {
      return db.transaction(async (tx) => {
        const g = await loadOne(tx, sessionId, groupId);
        if (!g) return null;
        await tx.execute({
          sql: 'DELETE FROM needs_group_classes WHERE session_id = ? AND needs_group_id = ? AND class_id = ?',
          args: [sessionId, groupId, classId],
        });
        const [hydrated] = await hydrate(tx, sessionId, [g]);
        return hydrated ?? null;
      });
    },

    addAdaptation(sessionId, groupId, pick) {
      return db.transaction(async (tx) => {
        const g = await loadOne(tx, sessionId, groupId);
        if (!g || g.archived_at) return null;
        const cur = (
          await tx.execute({
            sql: 'SELECT * FROM needs_group_adaptations WHERE session_id = ? AND needs_group_id = ? AND removed_at IS NULL',
            args: [sessionId, groupId],
          })
        ).rows.map(rowToAdaptation);
        if (cur.some((a) => a.entry_id === pick.entry_id)) throw conflict('the needs group already has that adaptation', 'adaptation_exists');
        if (cur.length >= ADAPTATIONS_PER_NEEDS_GROUP) {
          throw conflict(`a needs group has at most ${ADAPTATIONS_PER_NEEDS_GROUP} adaptations`, 'adaptations_full');
        }
        const at = nowIso();
        const a: NeedsGroupAdaptation = {
          id: newUlid(),
          needs_group_id: groupId,
          entry_id: pick.entry_id,
          title: pick.title,
          changes_goal: pick.changes_goal,
          status: pick.status,
          overrides: orNull(pick.overrides),
          source_version: pick.source_version ?? null,
          created_at: at,
          updated_at: at,
        };
        await tx.execute({
          sql: 'INSERT INTO needs_group_adaptations (id, session_id, needs_group_id, entry_id, title, changes_goal, status, overrides, source_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [a.id, sessionId, groupId, a.entry_id, a.title, a.changes_goal ? 1 : 0, a.status, a.overrides, a.source_version, at, at],
        });
        return a;
      });
    },

    updateAdaptation(sessionId, groupId, adaptationId, fields) {
      return db.transaction(async (tx) => {
        const r = await tx.execute({
          sql: 'SELECT * FROM needs_group_adaptations WHERE session_id = ? AND needs_group_id = ? AND id = ? AND removed_at IS NULL',
          args: [sessionId, groupId, adaptationId],
        });
        if (!r.rows[0]) return null;
        const a = rowToAdaptation(r.rows[0]);
        const next: NeedsGroupAdaptation = {
          ...a,
          ...(fields.status ? { status: fields.status } : {}),
          ...(fields.overrides !== undefined ? { overrides: orNull(fields.overrides) } : {}),
          updated_at: nowIso(),
        };
        await tx.execute({
          sql: 'UPDATE needs_group_adaptations SET status = ?, overrides = ?, updated_at = ? WHERE id = ?',
          args: [next.status, next.overrides, next.updated_at, adaptationId],
        });
        return next;
      });
    },

    removeAdaptation(sessionId, groupId, adaptationId) {
      return db.transaction(async (tx) => {
        const r = await tx.execute({
          sql: 'SELECT * FROM needs_group_adaptations WHERE session_id = ? AND needs_group_id = ? AND id = ? AND removed_at IS NULL',
          args: [sessionId, groupId, adaptationId],
        });
        if (!r.rows[0]) return null;
        const a = rowToAdaptation(r.rows[0]);
        const at = nowIso();
        await tx.execute({ sql: 'UPDATE needs_group_adaptations SET removed_at = ?, updated_at = ? WHERE id = ?', args: [at, at, adaptationId] });
        return { ...a, updated_at: at };
      });
    },
  };
}
