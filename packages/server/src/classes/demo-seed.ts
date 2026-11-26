/**
 * Adds the demo class P7A (demo.ts) to a workspace: into its own fictional school (made once),
 * in this school year, starred, with its pupils. Used by POST .../classes/demo and by a study
 * workspace's starting state.
 */
import { schoolYearOf, type SchoolClass } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { DEMO_CLASS, DEMO_PUPILS, DEMO_SCHOOL, DEMO_YEAR_GROUP } from './demo.js';
import { createPupilService } from './pupils.js';
import { createSchoolStore } from './schools.js';
import { createClassService } from './service.js';

export function addDemoClass(db: Db, events: EventStore, sid: string, envelope: ServerEnvelope): Promise<SchoolClass> {
  const classes = createClassService(db, events);
  const pupils = createPupilService(db, events);
  const schools = createSchoolStore(db, events);
  return db.transaction(async (tx) => {
    const r = await tx.execute({ sql: 'SELECT id FROM schools WHERE session_id = ? AND demo = 1 AND archived_at IS NULL LIMIT 1', args: [sid] });
    const school = r.rows[0] ? String(r.rows[0].id) : (await schools.createIn(tx, sid, DEMO_SCHOOL, envelope, true)).id;
    const yearGroup = await classes.yearGroupFor(tx, sid, { school_id: school, school_year: schoolYearOf(new Date()), name: DEMO_YEAR_GROUP }, envelope);
    const made = await classes.create(sid, { ...DEMO_CLASS, year_group_id: yearGroup.id, starred: true, demo: true }, envelope, tx);
    await pupils.add(sid, made.id, DEMO_PUPILS, envelope, tx);
    return made;
  });
}
