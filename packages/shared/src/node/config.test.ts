import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { CONFIG_FILE, loadAppConfig } from "./config.js";
import { sha256Hex } from "./hash.js";
import { DEFAULT_SAFETY_INSTRUCTION } from "../readerPrompts.js";

const here = dirname(fileURLToPath(import.meta.url));
const realDir = resolve(here, "../../../../config");
const HEX = /^[0-9a-f]{64}$/;
const temps: string[] = [];

function copyConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), "edw-config-"));
  temps.push(dir);
  cpSync(realDir, dir, { recursive: true });
  return dir;
}
function editJson(dir: string, fn: (c: Record<string, unknown>) => void): void {
  const p = join(dir, CONFIG_FILE);
  const c = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  fn(c);
  writeFileSync(p, JSON.stringify(c, null, 2));
}

afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

describe("loadAppConfig", () => {
  it("loads the real config directory with 64-hex hashes and the system prompt", () => {
    const l = loadAppConfig(realDir);
    expect(l.config_hash).toMatch(HEX);
    expect(l.system_prompt_hash).toMatch(HEX);
    expect(l.system_prompt).toMatch(/create_doc/);
    expect(l.config.provider.model).toBe("gpt-6-sol");
  });

  it("loads the naming skill for the wand, and does not offer it in chats", () => {
    const l = loadAppConfig(realDir);
    expect(l.naming_skill?.files["SKILL.md"]).toContain("# Naming a chat");
    expect((l.skills ?? []).map((sk) => sk.name)).not.toContain("naming-chats");
  });

  it("is deterministic, and key order does not change config_hash", () => {
    const dir = copyConfig();
    const a = loadAppConfig(dir);
    editJson(dir, (c) => {
      const { provider, ...rest } = c;
      for (const k of Object.keys(c)) delete c[k];
      Object.assign(c, rest, { provider });
    });
    expect(loadAppConfig(dir).config_hash).toBe(a.config_hash);
  });

  it("a system prompt change moves only system_prompt_hash; a temperature change moves config_hash", () => {
    const dir = copyConfig();
    const a = loadAppConfig(dir);
    appendFileSync(join(dir, a.config.system_prompt_file), "\nOne more line.\n");
    const b = loadAppConfig(dir);
    expect(b.system_prompt_hash).not.toBe(a.system_prompt_hash);
    expect(b.config_hash).toBe(a.config_hash);
    editJson(dir, (c) => ((c.provider as { temperature: number }).temperature = 0.5));
    expect(loadAppConfig(dir).config_hash).not.toBe(a.config_hash);
  });

  it("names a missing referenced file and reports schema issue paths", () => {
    const dir = copyConfig();
    editJson(dir, (c) => (c.system_prompt_file = "missing.md"));
    expect(() => loadAppConfig(dir)).toThrow(/missing\.md/);
    editJson(dir, (c) => {
      c.system_prompt_file = "system_prompt.md";
      (c.history as { max_turns: number }).max_turns = 0;
    });
    expect(() => loadAppConfig(dir)).toThrow(/history\.max_turns/);
  });

  it("refuses a config whose models are not all priced for the budget, or that has no exchange rate", () => {
    type Provider = { prices: Record<string, unknown>; usd_to_gbp?: number };
    const dir = copyConfig();
    editJson(dir, (c) => delete (c.provider as Provider).prices["gpt-6-astra"]);
    expect(() => loadAppConfig(dir)).toThrow(/gpt-6-astra has no price/);
    const judge = copyConfig();
    editJson(judge, (c) => (c.spyglass = { judge_model: "gpt-6-nova", judge_models: [] }));
    expect(() => loadAppConfig(judge)).toThrow(/gpt-6-nova has no price/);
    const rate = copyConfig();
    editJson(rate, (c) => delete (c.provider as Provider).usd_to_gbp);
    expect(() => loadAppConfig(rate)).toThrow(/usd_to_gbp/);
    const reader = copyConfig();
    editJson(reader, (c) => ((c.reader as { model: string }).model = "gpt-6-nova"));
    expect(() => loadAppConfig(reader)).toThrow(/gpt-6-nova has no price/);
  });

  it("reads the reader section, and gives Sam's examples to a config without one", () => {
    const real = loadAppConfig(realDir).config.reader;
    expect(real).toMatchObject({ model: "gpt-6-luna", pupil_budget_gbp: 0.5, follow_ups_max: 3 });
    expect(real.default_prompts.map((p) => p.label)).toEqual(["Explain", "I don't understand"]);
    const dir = copyConfig();
    editJson(dir, (c) => delete c.reader);
    const fallback = loadAppConfig(dir).config.reader;
    expect(fallback.model).toBeUndefined();
    expect(fallback.default_prompts).toEqual(real.default_prompts);
    editJson(dir, (c) => (c.reader = { pupil_budget_gbp: 0.5, follow_ups_max: 3, default_prompts: [{ label: " ", instruction: "x", after_highlight: true, follow_up: false }] }));
    expect(() => loadAppConfig(dir)).toThrow(/reader\.default_prompts\.0\.label/);
  });

  it("reads the reader's safety instruction, gives the built-in one when it is left out, and refuses an empty one", () => {
    const real = loadAppConfig(realDir).config.reader.safety_instruction;
    expect(real).toBe(DEFAULT_SAFETY_INSTRUCTION);
    const dir = copyConfig();
    editJson(dir, (c) => delete (c.reader as Record<string, unknown>).safety_instruction);
    expect(loadAppConfig(dir).config.reader.safety_instruction).toBe(DEFAULT_SAFETY_INSTRUCTION);
    editJson(dir, (c) => ((c.reader as Record<string, unknown>).safety_instruction = "  "));
    expect(() => loadAppConfig(dir)).toThrow(/reader\.safety_instruction/);
  });

  describe("skills", () => {
    const on = (names: string[]) => (c: Record<string, unknown>) => ({ ...c, agent: { ...(c.agent as object), skills: names } });

    it("with none named, the prompt and its hash are the prompt file's alone", () => {
      const l = loadAppConfig(realDir, on([]));
      expect(l.skills).toEqual([]);
      expect(l.system_prompt_hash).toBe(sha256Hex(l.system_prompt));
      expect(l.system_prompt_record).toBeUndefined();
    });

    it("offers a named skill at the end of the prompt; its files are behind the hash", () => {
      const plain = loadAppConfig(realDir, on([]));
      const l = loadAppConfig(realDir, on(["dyslexia-friendly"]));
      expect(l.skills!.map((s) => s.name)).toEqual(["dyslexia-friendly"]);
      expect(Object.keys(l.skills![0]!.files)).toEqual(["SKILL.md", "checklist.md"]);
      expect(l.skills![0]!.files["SKILL.md"]).toMatch(/^# Dyslexia-friendly documents/);
      expect(l.system_prompt.startsWith(plain.system_prompt.trimEnd())).toBe(true);
      expect(l.system_prompt).toMatch(/<available_skills>\n<skill>\n<name>dyslexia-friendly<\/name>\n<description>Make a worksheet/);
      expect(l.system_prompt).not.toContain("# Dyslexia-friendly documents");
      expect(l.system_prompt_record).toContain("<!-- skills/dyslexia-friendly/checklist.md -->");
      expect(l.system_prompt_hash).toBe(sha256Hex(l.system_prompt_record!));
    });

    it("a change to any skill file moves system_prompt_hash; single mode offers none", () => {
      const dir = copyConfig();
      const a = loadAppConfig(dir, on(["dyslexia-friendly"]));
      appendFileSync(join(dir, "skills/dyslexia-friendly/checklist.md"), "9. One more.\n");
      expect(loadAppConfig(dir, on(["dyslexia-friendly"])).system_prompt_hash).not.toBe(a.system_prompt_hash);
      const single = loadAppConfig(dir, (c) => ({ ...on(["dyslexia-friendly"])(c), mode: "single", system_prompt_file: "system_prompt.md" }));
      expect(single.skills).toEqual([]);
    });

    it("refuses a missing skill, a bad name and a name that is not its folder's", () => {
      const dir = copyConfig();
      expect(() => loadAppConfig(dir, on(["nope"]))).toThrow(/skills\/nope\/SKILL\.md/);
      const md = join(dir, "skills/dyslexia-friendly/SKILL.md");
      const text = readFileSync(md, "utf8");
      writeFileSync(md, text.replace("name: dyslexia-friendly", "name: Dyslexia Friendly"));
      expect(() => loadAppConfig(dir, on(["dyslexia-friendly"]))).toThrow(/name must be lowercase words/);
      writeFileSync(md, text.replace("name: dyslexia-friendly", "name: other-skill"));
      expect(() => loadAppConfig(dir, on(["dyslexia-friendly"]))).toThrow(/must match its folder/);
      writeFileSync(md, text.replace(/^description: .*$/m, ""));
      expect(() => loadAppConfig(dir, on(["dyslexia-friendly"]))).toThrow(/description is missing/);
    });
  });
});
