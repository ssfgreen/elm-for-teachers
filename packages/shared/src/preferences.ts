/**
 * The teacher's preferences for the workspace, set on the Preferences screen: a note about
 * themselves for the assistant (given after the system prompt, as a project's instructions are)
 * and the font new documents start in. Null is not set.
 */
import { z } from "zod";
import { DocFont } from "./enums.js";

/** The longest note about the teacher, in characters. */
export const TEACHER_NOTE_MAX = 2000;

export const Preferences = z.object({
  teacher_note: z.string().max(TEACHER_NOTE_MAX).nullable(),
  default_font: DocFont.nullable(),
});
export type Preferences = z.infer<typeof Preferences>;

/** A change: only the fields given are set (empty or blank text clears the note). */
export const PreferencesUpdate = Preferences.partial();
export type PreferencesUpdate = z.infer<typeof PreferencesUpdate>;

export const NO_PREFERENCES: Preferences = { teacher_note: null, default_font: null };
