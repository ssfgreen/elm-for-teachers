/**
 * The workspace's projects: the list (archived ones too, marked), files that failed when a
 * project was made, and the actions that open, make, rename, update, archive and delete one. Taken out
 * of WorkspaceScreen with no change in behaviour.
 */
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Project } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import { fileError } from '../components/files';
import type { EventLogger } from '../events/logger';
import type { MainView } from './WorkspaceScreen';

export function useProjects({ api, getEnvelope, logger, setView }: { api: SessionApi; getEnvelope: () => Envelope; logger: EventLogger; setView: Dispatch<SetStateAction<MainView>> }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectNotices, setProjectNotices] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects?.()
      .then((ps) => {
        if (!cancelled) setProjects(ps);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const showProject = useCallback(
    (id: string | null) => {
      logger.log('project_open', { project_id: id });
      setProjectNotices([]);
      setView(id ? { kind: 'project', id } : { kind: 'new-project' });
    },
    [logger, setView],
  );
  const putProject = useCallback((p: Project) => setProjects((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p])), []);

  /** Makes the project, adds its files one by one (one that fails is reported on the page), then shows it. */
  const createProject = useCallback(
    async (fields: { name: string; description: string | null }, files: File[]) => {
      if (!api.createProject) throw new Error('projects are not available');
      const project = await api.createProject(fields, getEnvelope());
      putProject(project);
      const failed: string[] = [];
      for (const file of files) {
        try {
          await api.addReference?.(project.id, file, getEnvelope());
        } catch (err) {
          failed.push(fileError(err, file.name));
        }
      }
      logger.log('project_open', { project_id: project.id });
      setView({ kind: 'project', id: project.id });
      setProjectNotices(failed);
    },
    [api, getEnvelope, logger, putProject, setView],
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
      void api
        .renameProject?.(id, name, getEnvelope())
        .then(putProject)
        .catch((err: unknown) => logger.log('error', { source: 'client', message: `rename project failed: ${err instanceof Error ? err.message : String(err)}` }));
    },
    [api, getEnvelope, logger, putProject],
  );

  const updateProject = useCallback(
    async (id: string, fields: { description?: string | null; instructions?: string | null }) => {
      if (!api.updateProject) throw new Error('projects are not available');
      putProject(await api.updateProject(id, fields, getEnvelope()));
    },
    [api, getEnvelope, putProject],
  );

  const archiveProject = useCallback(
    async (id: string) => {
      if (!api.archiveProject) throw new Error('projects are not available');
      putProject(await api.archiveProject(id, getEnvelope()));
      setView({ kind: 'editor' });
    },
    [api, getEnvelope, putProject, setView],
  );

  /** Deletes the project (the teacher typed DELETE) and goes back to the editor; resolves to its chats' ids, now gone. */
  const deleteProject = useCallback(
    async (id: string) => {
      if (!api.deleteProject) throw new Error('projects are not available');
      const { thread_ids } = await api.deleteProject(id, getEnvelope());
      setProjects((ps) => ps.filter((p) => p.id !== id));
      setView({ kind: 'editor' });
      return thread_ids;
    },
    [api, getEnvelope, setView],
  );

  return { projects, projectNotices, setProjectNotices, showProject, createProject, renameProject, updateProject, archiveProject, deleteProject };
}
