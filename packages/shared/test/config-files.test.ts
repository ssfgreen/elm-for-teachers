import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppConfig } from "../src/config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (name: string): string => readFileSync(join(repoRoot, "config", name), "utf8");

describe("config files", () => {
  it("app.config.json parses against AppConfig", () => {
    expect(AppConfig.safeParse(JSON.parse(read("app.config.json"))).success).toBe(true);
  });

  it("the system prompt documents every operation and no study-only concepts", () => {
    const p = read("system_prompt.md");
    for (const op of ["insert", "replace", "delete", "move", "create_doc"]) expect(p).toContain(`"op": "${op}"`);
    for (const gone of ["variant", "section", "create_version", "class register", "Task 2", "DRAFT"]) expect(p).not.toContain(gone);
  });
});
