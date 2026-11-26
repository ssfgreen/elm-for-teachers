/**
 * Class routes (participant token), all under /api/sessions/:sessionId:
 *   GET  /classes                                  -> { schools, year_groups, classes } (archived too, marked; pupil counts, no pupils)
 *   GET  /classes/:classId                         -> { class, year_group, pupils, adaptations, curriculum }
 *   POST /schools {name, envelope}                 -> 201 { school }
 *   POST /schools/:id/rename {name, envelope}      -> { school }
 *   POST /year-groups {name, school_id?, school_year?, envelope} -> 201 { year_group } (default: the first school, this school year)
 *   POST /year-groups/:id/update {name?, note?, envelope}  -> { year_group }
 *   POST /year-groups/:id/archive {envelope}       -> { year_group }
 *   POST /classes {year_group_id, name, stage?, subject?, note?, envelope} -> 201 { class }
 *   POST /classes/demo {envelope}                  -> 201 { class } (the fictional P7A, starred, this school year)
 *   POST /classes/:id/update {name?, stage?, subject?, note?, year_group_id?, starred?, envelope} -> { class }
 *   POST /classes/:id/copy {year_group_name?, name?, envelope} -> 201 { class } (next school year, with its pupils)
 *   POST /classes/:id/archive {envelope}           -> { class }
 *   POST /classes/:id/pupils {pupils: [...], envelope}      -> 201 { pupils } (the rows added)
 *   POST /classes/:id/pupils/:pupilId/update {fields..., envelope} -> { pupil }
 *   POST /classes/:id/pupils/:pupilId/move {to_class_id, envelope} -> { pupil }
 *   POST /classes/:id/pupils/:pupilId/archive {envelope}   -> { pupil }
 * A chat is started for a class or year group with POST .../threads {class_id | year_group_id}.
 * Curriculum items and pupils' adaptations have their own routes (curriculum-routes.ts,
 * adaptation-routes.ts).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CLASS_FIELD_MAX, CLASS_NAME_MAX, CLASS_NOTE_MAX, CurriculumProfile, PupilFields, PUPILS_PER_CLASS, SchoolYear, Ulid } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { createAdaptationService } from './adaptations.js';
import { copyToNextYear } from './copy.js';
import { createCurriculumService } from './curriculum.js';
import { addDemoClass } from './demo-seed.js';
import { createPupilService } from './pupils.js';
import { createSchoolStore } from './schools.js';
import { createClassService } from './service.js';
import { attachModerationTarget, checkTeacherTextPii } from '../moderation/pii.js';

const Name = z.string().trim().min(1).max(CLASS_NAME_MAX);
const Field = z.string().max(CLASS_FIELD_MAX).nullable().optional();
const Note = z.string().max(CLASS_NOTE_MAX).nullable().optional();
const Profile = CurriculumProfile.nullable().optional();
const Only = z.object({ envelope: Envelope });
const NameBody = z.object({ name: Name, envelope: Envelope });
const YearGroupBody = z.object({ name: Name, school_id: Ulid.optional(), school_year: SchoolYear.optional(), envelope: Envelope });
const CopyBody = z.object({ year_group_name: Name.optional(), name: Name.optional(), envelope: Envelope });
const YearGroupUpdate = z.object({ name: Name.optional(), note: Note, envelope: Envelope });
const ClassBody = z.object({ year_group_id: Ulid, name: Name, stage: Field, subject: Field, note: Note, curriculum_profile: Profile, envelope: Envelope });
const ClassUpdate = z.object({ year_group_id: Ulid.optional(), name: Name.optional(), stage: Field, subject: Field, note: Note, curriculum_profile: Profile, starred: z.boolean().optional(), envelope: Envelope });
const PupilsBody = z.object({ pupils: z.array(PupilFields).min(1).max(PUPILS_PER_CLASS), envelope: Envelope });
const PupilUpdate = PupilFields.extend({ envelope: Envelope });
const MoveBody = z.object({ to_class_id: Ulid, envelope: Envelope });

type Id = { Params: { sessionId: string; id: string } };
type PupilId = { Params: { sessionId: string; id: string; pupilId: string } };

export function registerClassRoutes(app: FastifyInstance, deps: AppDeps): void {
  const classes = createClassService(deps.db, deps.events);
  const pupils = createPupilService(deps.db, deps.events);
  const schools = createSchoolStore(deps.db, deps.events);
  const adaptations = createAdaptationService(deps.db, deps.events);
  const curriculum = createCurriculumService(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId';
  const found = <T>(v: T | null, what: string): T => {
    if (!v) throw notFound(what);
    return v;
  };

  app.get(`${base}/classes`, guard, async (req) => classes.list(req.session!.session_id));

  app.get<Id>(`${base}/classes/:id`, guard, async (req) => {
    const sid = req.session!.session_id;
    const c = found(await classes.get(sid, req.params.id), 'class');
    return {
      class: c,
      year_group: await classes.yearGroup(sid, c.year_group_id),
      pupils: await pupils.list(sid, c.id),
      adaptations: await adaptations.list(sid, c.id),
      curriculum: await curriculum.list(sid, c.id),
    };
  });

  app.post(`${base}/schools`, guard, async (req, reply) => {
    const { name, envelope } = parseOr400(NameBody, req.body);
    return reply.code(201).send({ school: await schools.create(req.session!.session_id, name, envelope) });
  });

  app.post<Id>(`${base}/schools/:id/rename`, guard, async (req) => {
    const { name, envelope } = parseOr400(NameBody, req.body);
    return { school: found(await schools.rename(req.session!.session_id, req.params.id, name, envelope), 'school') };
  });

  app.post(`${base}/year-groups`, guard, async (req, reply) => {
    const { envelope, ...fields } = parseOr400(YearGroupBody, req.body);
    return reply.code(201).send({ year_group: await classes.createYearGroup(req.session!.session_id, fields, envelope) });
  });

  app.post<Id>(`${base}/year-groups/:id/update`, guard, async (req) => {
    const { envelope, ...fields } = parseOr400(YearGroupUpdate, req.body);
    return { year_group: found(await classes.updateYearGroup(req.session!.session_id, req.params.id, fields, envelope), 'year group') };
  });

  app.post<Id>(`${base}/year-groups/:id/archive`, guard, async (req) => {
    const { envelope } = parseOr400(Only, req.body);
    return { year_group: found(await classes.archiveYearGroup(req.session!.session_id, req.params.id, envelope), 'year group') };
  });

  app.post(`${base}/classes`, guard, async (req, reply) => {
    const { envelope, ...fields } = parseOr400(ClassBody, req.body);
    const sid = req.session!.session_id;
    const { checkId } = fields.note
      ? await checkTeacherTextPii({
          db: deps.db,
          sessionId: sid,
          targetKind: 'class_note',
          text: fields.note,
          zeroRetention: deps.loaded.config.provider.zero_retention,
          classifier: deps.piiClassifier,
        })
      : { checkId: null };
    const created = await classes.create(sid, { ...fields, ...(checkId ? { note_check_id: checkId } : {}) }, envelope);
    if (checkId) await attachModerationTarget(deps.db, checkId, created.id);
    return reply.code(201).send({ class: created });
  });

  // The demo class goes into its own fictional school (made once), in this school year, starred.
  app.post(`${base}/classes/demo`, guard, async (req, reply) => {
    const { envelope } = parseOr400(Only, req.body);
    const c = await addDemoClass(deps.db, deps.events, req.session!.session_id, envelope);
    return reply.code(201).send({ class: c });
  });

  app.post<Id>(`${base}/classes/:id/update`, guard, async (req) => {
    const { envelope, ...fields } = parseOr400(ClassUpdate, req.body);
    const sid = req.session!.session_id;
    let note_check_id: string | null | undefined;
    if (fields.note !== undefined) {
      if (fields.note && fields.note.trim()) {
        const { checkId } = await checkTeacherTextPii({
          db: deps.db,
          sessionId: sid,
          targetKind: 'class_note',
          targetId: req.params.id,
          text: fields.note,
          zeroRetention: deps.loaded.config.provider.zero_retention,
          classifier: deps.piiClassifier,
        });
        note_check_id = checkId;
      } else {
        note_check_id = null;
      }
    }
    return {
      class: found(
        await classes.update(sid, req.params.id, { ...fields, ...(note_check_id !== undefined ? { note_check_id } : {}) }, envelope),
        'class',
      ),
    };
  });

  app.post<Id>(`${base}/classes/:id/copy`, guard, async (req, reply) => {
    const { envelope, ...fields } = parseOr400(CopyBody, req.body);
    return reply.code(201).send({ class: await copyToNextYear(deps.db, deps.events, req.session!.session_id, req.params.id, fields, envelope) });
  });

  app.post<Id>(`${base}/classes/:id/archive`, guard, async (req) => {
    const { envelope } = parseOr400(Only, req.body);
    return { class: found(await classes.archive(req.session!.session_id, req.params.id, envelope), 'class') };
  });

  app.post<Id>(`${base}/classes/:id/pupils`, guard, async (req, reply) => {
    const { pupils: rows, envelope } = parseOr400(PupilsBody, req.body);
    return reply.code(201).send({ pupils: await pupils.add(req.session!.session_id, req.params.id, rows, envelope) });
  });

  app.post<PupilId>(`${base}/classes/:id/pupils/:pupilId/update`, guard, async (req) => {
    const { envelope, ...fields } = parseOr400(PupilUpdate, req.body);
    return { pupil: found(await pupils.update(req.session!.session_id, req.params.id, req.params.pupilId, fields, envelope), 'pupil') };
  });

  app.post<PupilId>(`${base}/classes/:id/pupils/:pupilId/move`, guard, async (req) => {
    const { to_class_id, envelope } = parseOr400(MoveBody, req.body);
    return { pupil: found(await pupils.move(req.session!.session_id, req.params.id, req.params.pupilId, to_class_id, envelope), 'pupil') };
  });

  app.post<PupilId>(`${base}/classes/:id/pupils/:pupilId/archive`, guard, async (req) => {
    const { envelope } = parseOr400(Only, req.body);
    return { pupil: found(await pupils.archive(req.session!.session_id, req.params.id, req.params.pupilId, envelope), 'pupil') };
  });
}
