import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURES, FEATURE_NAMES, Features, FeaturesPatch, resolveFeatures, storedFeatures } from "./features.js";
import { EVENT_KINDS } from "./events.js";
import { isServerOnlyKind } from "./events/serverOnly.js";

describe("resolveFeatures", () => {
  it("reads null, undefined, an empty object and unreadable text as the defaults", () => {
    for (const raw of [null, undefined, {}, "", "not json", "null", 3]) expect(resolveFeatures(raw)).toEqual(DEFAULT_FEATURES);
  });

  it("has every switch on by default except pupils, which only an admin turns on", () => {
    expect(FEATURE_NAMES.filter((n) => !DEFAULT_FEATURES[n])).toEqual(["pupils"]);
    expect(resolveFeatures({ pupils: true }).pupils).toBe(true);
    expect(resolveFeatures({ pupils: "yes" }).pupils).toBe(false);
  });

  it("reads a stored set from before the pupils switch as pupils off", () => {
    const before = { classes: true, curriculum: true, pedagogy: true, preferences: true, spyglass: false, plugins: true };
    expect(Features.parse(before)).toEqual({ ...before, pupils: false, needs_groups: true });
  });

  it("turns off only the switches stored as false, from text or an object", () => {
    expect(resolveFeatures('{"spyglass":false}')).toEqual({ ...DEFAULT_FEATURES, spyglass: false });
    expect(resolveFeatures({ plugins: false, pedagogy: true })).toEqual({ ...DEFAULT_FEATURES, plugins: false });
  });

  it("has no rule between curriculum and classes", () => {
    expect(resolveFeatures({ classes: false })).toEqual({ ...DEFAULT_FEATURES, classes: false });
    expect(resolveFeatures({ curriculum: false })).toEqual({ ...DEFAULT_FEATURES, curriculum: false });
  });

  it("ignores unknown keys and values that are not booleans", () => {
    expect(resolveFeatures({ spyglass: "no", other: false, classes: 0 })).toEqual(DEFAULT_FEATURES);
  });
});

describe("storedFeatures", () => {
  it("keeps only what differs from the default, null when all are at their default", () => {
    expect(storedFeatures({ ...DEFAULT_FEATURES })).toBeNull();
    expect(storedFeatures({ ...DEFAULT_FEATURES, pupils: true })).toEqual({ pupils: true });
    expect(storedFeatures({ ...DEFAULT_FEATURES, classes: false })).toEqual({ classes: false });
    expect(resolveFeatures(storedFeatures({ ...DEFAULT_FEATURES, plugins: false, spyglass: false }))).toEqual({ ...DEFAULT_FEATURES, plugins: false, spyglass: false });
  });
});

describe("FeaturesPatch", () => {
  it("takes some switches and refuses unknown keys or non-booleans", () => {
    expect(FeaturesPatch.safeParse({ spyglass: false }).success).toBe(true);
    expect(FeaturesPatch.safeParse({}).success).toBe(true);
    // Left out stays left out: a patch never turns pupils off by default.
    expect(FeaturesPatch.parse({ spyglass: false })).toEqual({ spyglass: false });
    expect(FeaturesPatch.safeParse({ other: false }).success).toBe(false);
    expect(FeaturesPatch.safeParse({ classes: "off" }).success).toBe(false);
  });
});

describe("workspace_features_set", () => {
  it("is an event kind only the server writes", () => {
    expect(EVENT_KINDS).toContain("workspace_features_set");
    expect(isServerOnlyKind("workspace_features_set")).toBe(true);
  });
});
