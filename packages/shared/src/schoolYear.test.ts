import { describe, expect, it } from "vitest";
import { nextClassName, nextSchoolYear, nextYearGroupName, schoolYearOf } from "./schoolYear.js";

describe("school years", () => {
  it("turns over on 1 August", () => {
    expect(schoolYearOf(new Date(2026, 6, 31))).toBe("2025-26");
    expect(schoolYearOf(new Date(2026, 7, 1))).toBe("2026-27");
    expect(schoolYearOf(new Date(2027, 0, 15))).toBe("2026-27");
    expect(schoolYearOf(new Date(2099, 8, 1))).toBe("2099-00");
  });

  it("counts on a year", () => {
    expect(nextSchoolYear("2026-27")).toBe("2027-28");
    expect(nextSchoolYear("2099-00")).toBe("2100-01");
  });

  it("moves a year group up, primary into secondary, and stops at S6", () => {
    expect(nextYearGroupName("P6")).toBe("P7");
    expect(nextYearGroupName("p7")).toBe("S1");
    expect(nextYearGroupName("S3")).toBe("S4");
    expect(nextYearGroupName("S6")).toBeNull();
    expect(nextYearGroupName("Year 7")).toBe("Year 8");
    expect(nextYearGroupName("Nursery")).toBeNull();
  });

  it("renames a class that starts with its year group", () => {
    expect(nextClassName("P6A", "P6", "P7")).toBe("P7A");
    expect(nextClassName("Maths set 1", "S2", "S3")).toBe("Maths set 1");
  });
});
