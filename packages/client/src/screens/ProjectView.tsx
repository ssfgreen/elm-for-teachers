/**
 * A project's page as the workspace shows it: the page, with the box that starts a chat in the
 * project. Moved out of WorkspaceScreen as it was (no change in behaviour).
 */
import type { Project, Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import { ChatComposer, type AttachedFile, type ChatComposerProps } from '../components/ChatComposer';
import type { EventLogger } from '../events/logger';
import type { ClipboardMarker } from '../events/trackers';
import { ProjectPage } from './ProjectScreens';
import type { useProjects } from './useProjects';

export interface ProjectViewProps {
  project: Project;
  threads: Thread[];
  api: SessionApi;
  getEnvelope: () => Envelope;
  logger: EventLogger;
  batchMs: number;
  getClipboard: () => ClipboardMarker | null;
  bar: ChatComposerProps['bar'];
  projects: Pick<ReturnType<typeof useProjects>, 'renameProject' | 'updateProject' | 'archiveProject' | 'deleteProject' | 'projectNotices' | 'setProjectNotices'>;
  /** After a delete: the project's chats, which are gone. */
  onChatsGone: (threadIds: string[]) => void;
  onOpenChat: (threadId: string) => void;
  startProjectChat: (projectId: string, text: string, attached: AttachedFile[]) => Promise<void>;
  addProjectChatFile: (projectId: string, file: File) => Promise<AttachedFile>;
}

export function ProjectView({ project, threads, api, getEnvelope, logger, batchMs, getClipboard, bar, projects, onChatsGone, onOpenChat, startProjectChat, addProjectChatFile }: ProjectViewProps) {
  const { renameProject, updateProject, archiveProject, deleteProject, projectNotices, setProjectNotices } = projects;
  return (
    <ProjectPage
      project={project}
      chats={threads.filter((t) => t.project_id === project.id)}
      api={api}
      getEnvelope={getEnvelope}
      onRename={(name) => renameProject(project.id, name)}
      onUpdate={(fields) => updateProject(project.id, fields)}
      onArchive={() => archiveProject(project.id)}
      onDelete={api.deleteProject ? () => deleteProject(project.id).then(onChatsGone) : undefined}
      onOpenChat={onOpenChat}
      composer={
        <ChatComposer
          key={project.id}
          logger={logger}
          batchMs={batchMs}
          getClipboard={getClipboard}
          addFile={api.addChatFile ? (file) => addProjectChatFile(project.id, file) : undefined}
          removeFile={(id) => void api.deleteReference?.(id, getEnvelope()).catch(() => undefined)}
          onSend={(text, attached, restore) =>
            startProjectChat(project.id, text, attached).catch((err: unknown) => {
              restore();
              logger.log('error', { source: 'client', message: `start project chat failed: ${err instanceof Error ? err.message : String(err)}` });
              setProjectNotices(['The chat could not be started. Please try again.']);
            })
          }
          bar={bar}
          docked={false}
          placeholder="Start a chat in this project…"
          label="Start a chat in this project"
        />
      }
      notices={projectNotices}
      onPreviewFile={(id) => logger.log('reference_open', { reference_id: id })}
    />
  );
}
