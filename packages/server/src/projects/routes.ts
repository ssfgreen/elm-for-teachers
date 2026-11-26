/**
 * Project routes (participant token):
 *   GET  /api/sessions/:sessionId/projects                         -> { projects } (archived ones too, marked)
 *   POST /api/sessions/:sessionId/projects {name, description?, envelope} -> 201 { project }
 *   POST /api/sessions/:sessionId/projects/:projectId/update {description?, instructions?, envelope} -> { project }
 *   POST /api/sessions/:sessionId/projects/:projectId/rename {name, envelope} -> { project }
 *   POST /api/sessions/:sessionId/projects/:projectId/archive {envelope}      -> { project }
 *   POST /api/sessions/:sessionId/projects/:projectId/delete {confirm: "DELETE", envelope} -> { project, thread_ids }
 * A chat is started in a project with POST .../threads {project_id, envelope}.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROJECT_DESCRIPTION_MAX, PROJECT_INSTRUCTIONS_MAX, PROJECT_NAME_MAX } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { createProjectService } from './service.js';

const NameBody = z.object({ name: z.string().trim().min(1).max(PROJECT_NAME_MAX), envelope: Envelope });
const ArchiveBody = z.object({ envelope: Envelope });
/** The word the teacher types to delete a project, checked here too. */
const DeleteBody = z.object({ envelope: Envelope, confirm: z.literal('DELETE') });
const CreateBody = NameBody.extend({ description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable().optional() });
const UpdateBody = z.object({
  description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable().optional(),
  instructions: z.string().max(PROJECT_INSTRUCTIONS_MAX).nullable().optional(),
  envelope: Envelope,
});

type ProjectParams = { Params: { sessionId: string; projectId: string } };

export function registerProjectRoutes(app: FastifyInstance, deps: AppDeps): void {
  const projects = createProjectService(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };

  app.get('/api/sessions/:sessionId/projects', guard, async (req) => ({ projects: await projects.list(req.session!.session_id) }));

  app.post('/api/sessions/:sessionId/projects', guard, async (req, reply) => {
    const { name, description, envelope } = parseOr400(CreateBody, req.body);
    return reply.code(201).send({ project: await projects.create(req.session!.session_id, { name, description }, envelope) });
  });

  app.post<ProjectParams>('/api/sessions/:sessionId/projects/:projectId/rename', guard, async (req) => {
    const { name, envelope } = parseOr400(NameBody, req.body);
    const project = await projects.rename(req.session!.session_id, req.params.projectId, name, envelope);
    if (!project) throw notFound('project');
    return { project };
  });

  app.post<ProjectParams>('/api/sessions/:sessionId/projects/:projectId/update', guard, async (req) => {
    const { envelope, ...fields } = parseOr400(UpdateBody, req.body);
    const project = await projects.update(req.session!.session_id, req.params.projectId, fields, envelope);
    if (!project) throw notFound('project');
    return { project };
  });

  app.post<ProjectParams>('/api/sessions/:sessionId/projects/:projectId/archive', guard, async (req) => {
    const { envelope } = parseOr400(ArchiveBody, req.body);
    const project = await projects.archive(req.session!.session_id, req.params.projectId, envelope);
    if (!project) throw notFound('project');
    return { project };
  });

  app.post<ProjectParams>('/api/sessions/:sessionId/projects/:projectId/delete', guard, async (req) => {
    const { envelope } = parseOr400(DeleteBody, req.body);
    const done = await projects.delete(req.session!.session_id, req.params.projectId, envelope);
    if (!done) throw notFound('project');
    return done;
  });
}
