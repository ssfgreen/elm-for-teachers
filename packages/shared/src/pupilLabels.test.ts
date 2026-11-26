import { describe, expect, it } from "vitest";
import { LABEL_THINGS, LABEL_WORDS, makePupilLabel } from "./pupilLabels.js";
import { needsCounts } from "./classes.js";

describe("makePupilLabel", () => {
  it("makes a word and a thing, joined with a hyphen", () => {
    expect(makePupilLabel([])).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("never repeats a label already taken, whatever its case", () => {
    const first = makePupilLabel([], () => 0);
    expect(first).toBe(`${LABEL_WORDS[0]}-${LABEL_THINGS[0]}`);
    // A random source stuck on the first pick still ends, with a number added.
    expect(makePupilLabel([first.toUpperCase()], () => 0)).toBe(`${first}-2`);
  });

  it("deals a whole class without a repeat", () => {
    const taken: string[] = [];
    for (let i = 0; i < 60; i++) taken.push(makePupilLabel(taken));
    expect(new Set(taken).size).toBe(60);
  });

  it("uses no word that is also a common first name or a colour", () => {
    const names = ["amber", "ruby", "robin", "skye", "holly", "ivy", "rose", "hazel", "willow", "jasper", "rusty", "olive", "pearl", "daisy", "red", "blue", "green", "yellow"];
    for (const w of [...LABEL_WORDS, ...LABEL_THINGS]) expect(names).not.toContain(w);
  });
});

describe("needsCounts", () => {
  it("counts each need once a pupil, ignoring case, largest first", () => {
    expect(needsCounts([{ needs: ["Dyslexia"] }, { needs: ["dyslexia ", "ADHD"] }, { needs: [] }, { needs: ["ADHD", "Autism"] }])).toEqual({ ADHD: 2, Dyslexia: 2, Autism: 1 });
  });
});
