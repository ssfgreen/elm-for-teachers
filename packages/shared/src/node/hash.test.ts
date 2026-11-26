import { describe, expect, it } from "vitest";
import { compositeHash, hashJson, sha256Hex } from "./hash.js";

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("hashJson", () => {
  it("ignores key order", () => {
    expect(hashJson({ a: 1, b: [1, 2] })).toBe(hashJson({ b: [1, 2], a: 1 }));
  });
  it("changes when any value changes", () => {
    expect(hashJson({ temperature: 0 })).not.toBe(hashJson({ temperature: 0.1 }));
  });
});

describe("compositeHash", () => {
  it("is order independent and sensitive to every part", () => {
    const h1 = compositeHash({ config: "x", bank: "y" });
    const h2 = compositeHash({ bank: "y", config: "x" });
    const h3 = compositeHash({ config: "x", bank: "z" });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
