/** Event payloads for the teacher's preferences (shared/src/preferences.ts). */
import { Preferences } from "../preferences.js";

/** The teacher changed preferences: the fields that changed, with their new values (null is cleared). */
export const PreferencesSetPayload = Preferences.partial();
