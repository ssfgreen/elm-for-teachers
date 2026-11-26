/**
 * Projects (shared `Project`): a teacher's collection of chats, and later of the reference
 * files and skills those chats use. They belong to the workspace for now and will move to a
 * teacher account with it (auth.ts resolves who is asking). Every change is logged
 * (project_create, project_rename, project_update, project_archive) in the same transaction as
 * the write. The description and instructions are the teacher's content for the model, given
 * in a message of their own after the system prompt (gateway/agent.ts `projectMessage`).
 */
import type { Transaction } from '../db/types.js';
import { newUlid, nowIso, type Project } from '@edw/shared';
import type { Db } from '../db/client.js';
import { rowToProject } from '../db/rows.js';
import type { EventStore, ServerEnvelope } from '../deps.js';

export interface ProjectService {
  /** The session's projects, archived ones too (marked), oldest first; deleted ones are left out. */
  list(sessionId: string): Promise<Project[]>;
  get(sessionId: string, projectId: string, tx?: Transaction): Promise<Project | null>;
  create(sessionId: string, fields: { name: string; description?: string | null }, envelope: ServerEnvelope): Promise<Project>;
  /** Null when the project is not this session's. */
  rename(sessionId: string, projectId: string, name: string, envelope: ServerEnvelope): Promise<Project | null>;
  /** Changes the description and/or instructions (empty text clears one); logs only what changed. Null when not this session's. */
  update(sessionId: string, projectId: string, fields: ProjectTextFields, envelope: ServerEnvelope): Promise<Project | null>;
  /** Hides the project; its chats are kept. Archiving twice logs once. Null when not this session's. */
  archive(sessionId: string, projectId: string, envelope: ServerEnvelope): Promise<Project | null>;
  /** Hides the project and its chats from the teacher (rows kept). Null when not this session's or already deleted. */
  delete(sessionId: string, projectId: string, envelope: ServerEnvelope): Promise<{ project: Project; thread_ids: string[] } | null>;
}

export interface ProjectTextFields {
  description?: string | null;
  instructions?: string | null;
}

const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export function createProjectService(db: Db, events: EventStore): ProjectService {
  const get = async (sessionId: string, projectId: string, tx?: Transaction) => {
    const sql = 'SELECT * FROM projects WHERE session_id = ? AND id = ? AND deleted_at IS NULL';
    const r = tx ? await tx.execute({ sql, args: [sessionId, projectId] }) : await db.execute(sql, [sessionId, projectId]);
    return r.rows[0] ? rowToProject(r.rows[0]) : null;
  };

  return {
    async list(sessionId) {
      const r = await db.execute('SELECT * FROM projects WHERE session_id = ? AND deleted_at IS NULL ORDER BY created_at, id', [sessionId]);
      return r.rows.map(rowToProject);
    },

    get,

    create(sessionId, { name, description }, envelope) {
      return db.transaction(async (tx) => {
        const project: Project = { id: newUlid(), session_id: sessionId, name, description: orNull(description), instructions: null, created_at: nowIso(), archived_at: null, deleted_at: null };
        await tx.execute({
          sql: 'INSERT INTO projects (id, session_id, name, description, instructions, created_at, archived_at) VALUES (?, ?, ?, ?, NULL, ?, NULL)',
          args: [project.id, sessionId, name, project.description, project.created_at],
        });
        await events.appendServer(sessionId, 'project_create', { project_id: project.id, name, description: project.description }, envelope, tx);
        return project;
      });
    },

    rename(sessionId, projectId, name, envelope) {
      return db.transaction(async (tx) => {
        const p = await get(sessionId, projectId, tx);
        if (!p) return null;
        await tx.execute({ sql: 'UPDATE projects SET name = ? WHERE id = ?', args: [name, projectId] });
        await events.appendServer(sessionId, 'project_rename', { project_id: projectId, name }, envelope, tx);
        return { ...p, name };
      });
    },

    update(sessionId, projectId, fields, envelope) {
      return db.transaction(async (tx) => {
        const p = await get(sessionId, projectId, tx);
        if (!p) return null;
        const changed: ProjectTextFields = {};
        for (const k of ['description', 'instructions'] as const) {
          if (fields[k] === undefined) continue;
          const v = orNull(fields[k]);
          if (v !== p[k]) changed[k] = v;
        }
        if (Object.keys(changed).length === 0) return p;
        const next = { ...p, ...changed };
        await tx.execute({ sql: 'UPDATE projects SET description = ?, instructions = ? WHERE id = ?', args: [next.description, next.instructions, projectId] });
        await events.appendServer(sessionId, 'project_update', { project_id: projectId, ...changed }, envelope, tx);
        return next;
      });
    },

    archive(sessionId, projectId, envelope) {
      return db.transaction(async (tx) => {
        const p = await get(sessionId, projectId, tx);
        if (!p || p.archived_at) return p;
        const at = nowIso();
        await tx.execute({ sql: 'UPDATE projects SET archived_at = ? WHERE id = ?', args: [at, projectId] });
        await events.appendServer(sessionId, 'project_archive', { project_id: projectId }, envelope, tx);
        return { ...p, archived_at: at };
      });
    },

    delete(sessionId, projectId, envelope) {
      return db.transaction(async (tx) => {
        const p = await get(sessionId, projectId, tx);
        if (!p) return null;
        const at = nowIso();
        const r = await tx.execute({ sql: 'SELECT id FROM threads WHERE session_id = ? AND project_id = ? ORDER BY created_at, id', args: [sessionId, projectId] });
        const thread_ids = r.rows.map((row) => String(row.id));
        await tx.execute({ sql: 'UPDATE projects SET deleted_at = ? WHERE id = ?', args: [at, projectId] });
        await events.appendServer(sessionId, 'project_delete', { project_id: projectId, thread_ids }, envelope, tx);
        return { project: { ...p, deleted_at: at }, thread_ids };
      });
    },
  };
}
