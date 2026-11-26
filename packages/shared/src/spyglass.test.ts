import { describe, expect, it } from "vitest";
import { SpyglassConfig } from "./config.js";
import { capFlags, KeyDecision, SpyglassResult, type KeyDecision as Flag } from "./spyglass.js";

const flag = (n: number): Flag => ({ check: "scope", label: "removed", block_ids: [`B${n}`], title: `Flag ${n}`, why: "" });

describe("Spyglass result", () => {
  it("keeps the first three flags and counts the rest", () => {
    const r = capFlags([1, 2, 3, 4, 5].map(flag), "judge");
    expect(r.flags.map((f) => f.title)).toEqual(["Flag 1", "Flag 2", "Flag 3"]);
    expect(r.others).toBe(2);
    expect(SpyglassResult.parse(r)).toEqual(r);
  });

  it("refuses a flag on no block, or with a label it does not know", () => {
    expect(KeyDecision.safeParse({ ...flag(1), block_ids: [] }).success).toBe(false);
    expect(KeyDecision.safeParse({ ...flag(1), label: "wrong" }).success).toBe(false);
  });
});

describe("Spyglass config switch", () => {
  it("offers the toggle, the callout and the effect to the model unless the config says otherwise", () => {
    expect(SpyglassConfig.parse({})).toEqual({ mode: "shown_and_model", judge_timeout_ms: 8000, judge_models: [] });
    expect(SpyglassConfig.safeParse({ mode: "hidden" }).success).toBe(false);
  });
});
