/**
 * A case's class (docs/classes.md): the chat is made a class chat, with the class's pupils, the
 * library adaptations chosen for them and its curriculum, as a teacher would set them up. With
 * `demo`, the class is the study's fictional P7A (server/src/classes/demo.ts).
 */
import type { CurriculumStatus, PupilFields } from '@edw/shared';
import { createAdaptationService } from '../../server/src/classes/adaptations.js';
import { createCurriculumService } from '../../server/src/classes/curriculum.js';
import { DEMO_CLASS, DEMO_PUPILS } from '../../server/src/classes/demo.js';
import { createPupilService } from '../../server/src/classes/pupils.js';
import { createClassService } from '../../server/src/classes/service.js';
import type { Db } from '../../server/src/db/client.js';
import type { EventStore } from '../../server/src/deps.js';

export interface ClassFixture {
  /** The demo P7A, with its 20 pupils; otherwise `name`, `stage`, `subject` and `pupils`. */
  demo?: boolean;
  name?: string;
  stage?: string;
  subject?: string;
  note?: string;
  pupils?: PupilFields[];
  /** Library adaptations chosen for pupils, by label. */
  adaptations?: { pupil: string; entry_id: string; title: string; changes_goal?: boolean; status?: 'confirmed' | 'trialling' | 'stopped'; overrides?: string }[];
  curriculum?: { code: string; text: string; status?: CurriculumStatus }[];
}

export async function seedClass(db: Db, events: EventStore, sid: string, threadId: string, fx: ClassFixture): Promise<void> {
  const env = { client_ts: new Date().toISOString(), focus_pane: 'canvas' as const, doc_id: null, thread_id: null };
  const classes = createClassService(db, events);
  const yearGroup = await classes.createYearGroup(sid, { name: fx.demo ? 'P7' : (fx.stage?.split(/[ ,]/)[0] ?? 'Year') }, env);
  const base = fx.demo ? DEMO_CLASS : { name: fx.name ?? 'Eval class', stage: fx.stage ?? null, subject: fx.subject ?? null, note: fx.note ?? null };
  const cls = await classes.create(sid, { ...base, year_group_id: yearGroup.id }, env);
  const pupils = await createPupilService(db, events).add(sid, cls.id, fx.demo ? DEMO_PUPILS : (fx.pupils ?? []), env);
  const adaptations = createAdaptationService(db, events);
  for (const a of fx.adaptations ?? []) {
    const p = pupils.find((x) => x.label === a.pupil);
    if (!p) throw new Error(`fixture adaptation names an unknown pupil: ${a.pupil}`);
    await adaptations.add(sid, cls.id, p.id, { entry_id: a.entry_id, title: a.title, changes_goal: a.changes_goal ?? false, status: a.status ?? 'confirmed', overrides: a.overrides ?? null }, env);
  }
  const curriculum = createCurriculumService(db, events);
  for (const status of ['now', 'planned', 'done'] as const) {
    const items = (fx.curriculum ?? []).filter((c) => (c.status ?? 'now') === status);
    if (items.length) await curriculum.pick(sid, cls.id, items.map((c) => ({ code: c.code, text: c.text, framework: 'cfe-eo', kind: 'eo' })), status, env);
  }
  await db.execute('UPDATE threads SET class_id = ? WHERE id = ?', [cls.id, threadId]);
}
