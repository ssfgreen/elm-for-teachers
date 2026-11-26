/**
 * Copying a class into the next school year (Sam, 12 Nov 2026): the year group moves up (P6 to
 * P7), the name follows it (P6A to P7A), and the pupils come too as new rows with the same labels,
 * what helps and notes, so a pupil has no identity that runs across years. The stage is left for the
 * teacher (it changes with the year); the subject and the note come across. A starred class stays
 * starred. The pupil reader's settings come too (#186). The teacher can name the year group and
 * class instead. The hidden needs and working_at (#243) are left behind: the new rows start
 * without them, and the old class keeps its own.
 */
import { nextClassName, nextSchoolYear, nextYearGroupName, type SchoolClass } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { notFound } from '../http-error.js';
import { createPupilService } from './pupils.js';
import { createClassService } from './service.js';

export interface CopyFields {
  /** The year group it goes into next year (default: the next one up, or the same name). */
  year_group_name?: string;
  name?: string;
}

export function copyToNextYear(db: Db, events: EventStore, sessionId: string, classId: string, fields: CopyFields, envelope: ServerEnvelope): Promise<SchoolClass> {
  const classes = createClassService(db, events);
  const pupils = createPupilService(db, events);
  return db.transaction(async (tx) => {
    const from = await classes.get(sessionId, classId, tx);
    if (!from) throw notFound('class');
    const fromYear = await classes.yearGroup(sessionId, from.year_group_id, tx);
    const fromName = fromYear?.name ?? '';
    const toName = fields.year_group_name?.trim() || nextYearGroupName(fromName) || fromName || 'Next year';
    const yearGroup = await classes.yearGroupFor(tx, sessionId, { school_id: from.school_id, school_year: nextSchoolYear(from.school_year), name: toName }, envelope);
    const made = await classes.create(
      sessionId,
      { year_group_id: yearGroup.id, name: fields.name?.trim() || nextClassName(from.name, fromName, toName), subject: from.subject, note: from.note, starred: !!from.starred_at, copied_from: from.id },
      envelope,
      tx,
    );
    const rows = await pupils.list(sessionId, from.id, tx);
    if (rows.length) await pupils.add(sessionId, made.id, rows.map(({ label, helps, note }) => ({ label, helps, note })), envelope, tx);
    return made;
  });
}
