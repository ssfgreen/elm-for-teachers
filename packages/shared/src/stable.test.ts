import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable.js";

describe("stableStringify", () => {
  it("sorts keys at every depth", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("is independent of insertion order", () => {
    const x = { provider: { model: "m", temperature: 0 }, version: "1" };
    const y = { version: "1", provider: { temperature: 0, model: "m" } };
    expect(stableStringify(x)).toBe(stableStringify(y));
  });

  it("keeps array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("omits undefined properties but keeps nulls", () => {
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("escapes strings like JSON.stringify", () => {
    expect(stableStringify('he said "hi"\n')).toBe(JSON.stringify('he said "hi"\n'));
  });

  it("rejects circular structures and non-finite numbers", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => stableStringify(o)).toThrow(TypeError);
    expect(() => stableStringify({ n: Number.NaN })).toThrow(TypeError);
  });
});
