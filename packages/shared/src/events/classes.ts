/**
 * Event payloads for classes (docs/classes.md). Year groups and classes are logged with their
 * full text, as projects are. Pupils are not (Sam, 12 Nov 2026, option B): a change to the
 * pupil table logs which rows changed and the table's shape (rows, a count of each need and a
 * hash of its contents), never the labels, needs or notes themselves.
 */
import { z } from "zod";
import { Ulid } from "../blocks.js";

/** A school added. Its name is not logged (Sam, 12 Nov 2026): with a class and a count of needs it could point to a child. */
export const SchoolCreatePayload = z.object({
  school_id: Ulid,
});

/** A school renamed (the name is not logged). */
export const SchoolRenamePayload = z.object({
  school_id: Ulid,
});

export const YearGroupCreatePayload = z.object({
  year_group_id: Ulid,
  school_id: Ulid,
  school_year: z.string(),
  name: z.string(),
});

/** Only what changed; null clears the note. */
export const YearGroupUpdatePayload = z.object({
  year_group_id: Ulid,
  name: z.string().optional(),
  note: z.string().nullable().optional(),
});

export const YearGroupArchivePayload = z.object({
  year_group_id: Ulid,
});

export const ClassCreatePayload = z.object({
  class_id: Ulid,
  year_group_id: Ulid,
  school_id: Ulid,
  school_year: z.string(),
  /** Copied from last year's class, with its pupils. */
  copied_from: Ulid.optional(),
  name: z.string(),
  stage: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  /** Made from the demo register (the study's fictional P7A). */
  demo: z.boolean().optional(),
});

/** Only what changed; null clears a field. `year_group_id`: moved to another year group. */
export const ClassUpdatePayload = z.object({
  class_id: Ulid,
  year_group_id: Ulid.optional(),
  name: z.string().optional(),
  stage: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  /** Starred (one of the teacher's own classes, in the sidebar) or not. */
  starred: z.boolean().optional(),
});

export const ClassArchivePayload = z.object({
  class_id: Ulid,
});

/** The teacher opened the Classes screen (both null), a year group's page or a class's page. */
export const ClassOpenPayload = z.object({
  class_id: Ulid.nullable(),
  year_group_id: Ulid.nullable(),
});

/** The pupil table as the record keeps it: its shape, not its contents. */
export const PupilTableShape = z.object({
  rows: z.number().int().nonnegative(),
  needs_counts: z.record(z.number().int().nonnegative()),
  /** sha256 of the live rows (labels, needs, helps, working at, notes, in order). */
  hash: z.string(),
});
export type PupilTableShape = z.infer<typeof PupilTableShape>;

/**
 * Rows added, changed, moved to another class or archived. `fields` names what changed on an
 * update, never the values (`adaptations` when the library adaptations chosen for a pupil
 * changed). The table's shape is after the change; a move gives both classes'.
 */
export const PupilsChangePayload = z.object({
  class_id: Ulid,
  op: z.enum(["add", "update", "move", "archive"]),
  pupil_ids: z.array(Ulid),
  fields: z.array(z.string()).optional(),
  to_class_id: Ulid.optional(),
  table: PupilTableShape,
  to_table: PupilTableShape.optional(),
});

/**
 * Curriculum items picked for a class (docs/classes.md, C.4), with their text as picked: they are
 * the curriculum's words, not the teacher's or a pupil's, so they are logged in full.
 */
export const CurriculumPickPayload = z.object({
  class_id: Ulid,
  items: z.array(z.object({ item_id: Ulid, code: z.string(), text: z.string(), framework: z.string(), source_version: z.string().nullable(), status: z.string() })),
});

/** An item moved between planned, now and done, or taken off the class (`removed`). */
export const CurriculumStatusPayload = z.object({
  class_id: Ulid,
  item_id: Ulid,
  code: z.string(),
  status: z.enum(["planned", "now", "done", "removed"]),
  before: z.string(),
});

/**
 * The teacher changed a class's reader settings (#186), or a copy to next year carried them to
 * the new class. With the follow-up limit and pupil budget in force after the change (question
 * 81, Sam 23 Nov 2026: config's default when the class has not set one); absent before #195.
 */
export const ClassReaderSettingsPayload = z.object({
  class_id: Ulid,
  follow_ups_max: z.number().int().nonnegative().optional(),
  pupil_budget_gbp: z.number().nonnegative().optional(),
});

/**
 * The teacher changed a class's safety instruction for the reader (#195), went back to the
 * default, or a copy to next year carried the class's own to the new class. Never the text
 * (question 88, Sam 23 Nov 2026: hash and length, never the text): whether it is config's default, and a hash and the
 * length of the text in force after the change.
 */
export const ClassReaderSafetySetPayload = z.object({
  class_id: Ulid,
  is_default: z.boolean(),
  /** `sha256:` and the hex of the text in force (the default's when is_default). */
  text_hash: z.string().min(1),
  text_length: z.number().int().nonnegative(),
});

/**
 * A class's code was made, renewed or closed (issue #209). Ids and the action only: never the
 * code itself, never a pupil. The workspace is the event's own session_id.
 */
export const ClassCodeSetPayload = z.object({
  class_id: Ulid,
  action: z.enum(["make", "renew", "close"]),
});

/**
 * The teacher made a batch of pupil logins for a class (issue #223). The class id and how many
 * only: never a username, a password or its hash.
 */
export const PupilLoginsMadePayload = z.object({
  class_id: Ulid,
  // 40: MAX_LOGINS_A_BATCH in packages/server/src/pupil-logins/store.ts. Change both together.
  count: z.number().int().min(1).max(40),
});

/**
 * The teacher made a new password for a pupil login (issue #246): it unlocks the login and signs
 * its pupil out everywhere. The class id only: never the login, a username, a password or its hash.
 */
export const PupilPasswordResetPayload = z.object({
  class_id: Ulid,
});

/**
 * The teacher removed a pupil from a class (issue #220). The class id only: never the member, the
 * pupil or the anonymised id their kept rows moved to.
 */
export const ClassPupilRemovePayload = z.object({
  class_id: Ulid,
});

/**
 * The teacher pressed "View as pupil" and opened /r as the class's test pupil (issue #215). The
 * class id only: never the test pupil or its member.
 */
export const ClassViewAsPupilPayload = z.object({
  class_id: Ulid,
});

/** The teacher opened the Pedagogy screen (entry null) or one of its entries. */
export const PedagogyOpenPayload = z.object({
  entry_id: z.string().nullable(),
});

/**
 * A study workspace was given its starting state (docs/classes.md, "Study workspaces"): the demo
 * class, the adaptations and curriculum chosen for it, and a demo chat whose turns were written
 * in advance (their ids start `t_demo_`), not asked by the participant.
 */
export const StudySeedPayload = z.object({
  class_id: Ulid,
  thread_id: Ulid,
  turn_ids: z.array(z.string()),
});
