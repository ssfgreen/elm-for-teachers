import { describe, expect, it } from "vitest";
import { normaliseHref } from "./TextStyleControls.js";

describe("normaliseHref", () => {
  it("takes web and email addresses as a teacher would type them", () => {
    expect(normaliseHref("https://www.bbc.co.uk/bitesize")).toBe("https://www.bbc.co.uk/bitesize");
    expect(normaliseHref(" bbc.co.uk/bitesize ")).toBe("https://bbc.co.uk/bitesize");
    expect(normaliseHref("office@school.example")).toBe("mailto:office@school.example");
    expect(normaliseHref("mailto:office@school.example")).toBe("mailto:office@school.example");
  });

  it("refuses what is not an address", () => {
    expect(normaliseHref("")).toBeNull();
    expect(normaliseHref("the guide")).toBeNull();
    expect(normaliseHref("javascript:alert(1)")).toBeNull();
  });
});
