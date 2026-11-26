import { z } from "zod";

/**
 * Per-workspace switches (issue #62). Seven independent features. Off means off everywhere:
 * screens, routes and what the assistant hears. There are no rules between them: curriculum works
 * without classes (a teacher may make materials for a curriculum without uploading class data).
 *
 * All are on by default except `pupils` (issue #179): pupils signing in to the workspace's classes.
 * It is off until an admin turns it on (`PUT /api/admin/sessions/:id/features`), and only the server's
 * `PUPILS=on` setting opens pupil sign-in at all: unset or off, it is shut everywhere whatever the
 * switch says (server/src/pupils/).
 */
export const FEATURE_NAMES = ["classes", "curriculum", "pedagogy", "preferences", "spyglass", "plugins", "pupils"] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export const Features = z.object({
  classes: z.boolean(),
  curriculum: z.boolean(),
  pedagogy: z.boolean(),
  preferences: z.boolean(),
  spyglass: z.boolean(),
  plugins: z.boolean(),
  /** Missing (a stored event or bundle from before 23 Nov 2026) reads as off, its default. */
  pupils: z.boolean().default(false),
});
export type Features = z.infer<typeof Features>;

/** A change to some switches; keys left out keep their value. Unknown keys are refused. */
export const FeaturesPatch = Features.partial().strict();
export type FeaturesPatch = z.infer<typeof FeaturesPatch>;

export const DEFAULT_FEATURES: Readonly<Features> = Object.freeze({
  classes: true,
  curriculum: true,
  pedagogy: true,
  preferences: true,
  spyglass: true,
  plugins: true,
  pupils: false,
});

/**
 * The switches in force from what is stored: null, a missing key or anything that is not a
 * boolean reads as its default. Accepts the stored JSON text or an already parsed object;
 * unreadable text reads as the defaults.
 */
export function resolveFeatures(raw: unknown): Features {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  const out: Features = { ...DEFAULT_FEATURES };
  if (obj && typeof obj === "object") {
    for (const name of FEATURE_NAMES) {
      const v = (obj as Record<string, unknown>)[name];
      if (typeof v === "boolean") out[name] = v;
    }
  }
  return out;
}

/** Only the switches that differ from the default, as stored; null when all are at their default. */
export function storedFeatures(f: Features): Partial<Features> | null {
  const diff: Partial<Features> = {};
  for (const name of FEATURE_NAMES) if (f[name] !== DEFAULT_FEATURES[name]) diff[name] = f[name];
  return Object.keys(diff).length ? diff : null;
}
