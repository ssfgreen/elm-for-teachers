/** Node-only config loader: reads, validates and hashes the config directory. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ZodError } from "zod";
import { AppConfig, budgetProblems, type LoadedConfig } from "../config.js";
import { parseSkillFile, SKILL_FILE, skillProblems, skillsSection, type Skill } from "../skills.js";
import { hashJson, sha256Hex } from "./hash.js";

export const CONFIG_FILE = "app.config.json";

function readText(configDir: string, rel: string): string {
  try {
    return readFileSync(join(configDir, rel), "utf8");
  } catch (e) {
    throw new Error(`config file not found or unreadable: ${rel} (in ${configDir}): ${(e as Error).message}`);
  }
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${name}: invalid JSON: ${(e as Error).message}`);
  }
}

function formatIssues(name: string, err: ZodError): string {
  return err.issues.map((i) => `${name}: ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}

export const SKILLS_DIR = "skills";
/** The skill the wand next to a chat's title follows to name the chat. */
export const NAMING_SKILL = "naming-chats";
/** Files a skill may carry besides SKILL.md (text the model can read). */
const SKILL_TEXT = /\.(md|txt|csv|json)$/i;

/** Every text file under `dir`, by path relative to it with forward slashes, sorted. */
function textFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (SKILL_TEXT.test(entry)) out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}

/** One skill folder, checked against the Agent Skills rules. */
export function loadSkill(configDir: string, name: string): Skill {
  const dir = join(configDir, SKILLS_DIR, name);
  const where = `${SKILLS_DIR}/${name}/${SKILL_FILE}`;
  const { fields, body } = parseSkillFile(readText(configDir, where));
  const problems = skillProblems(name, fields);
  if (problems.length) throw new Error(problems.map((p) => `${where}: ${p}`).join("\n"));
  const files: Record<string, string> = { [SKILL_FILE]: body };
  for (const f of textFiles(dir)) if (f !== SKILL_FILE) files[f] = readFileSync(join(dir, f), "utf8");
  return { name, description: fields.description!, files };
}

/**
 * `override` adjusts the raw config before it is checked (the evals switch skills on this way).
 * In agent mode the config's skills are read and offered at the end of the system prompt.
 */
export function loadAppConfig(configDir: string, override?: (raw: Record<string, unknown>) => Record<string, unknown>): LoadedConfig {
  const json = parseJson(readText(configDir, CONFIG_FILE), CONFIG_FILE) as Record<string, unknown>;
  const parsed = AppConfig.safeParse(override ? override(json) : json);
  if (!parsed.success) throw new Error(formatIssues(CONFIG_FILE, parsed.error));
  const config = parsed.data;
  const unpriced = budgetProblems(config);
  if (unpriced.length) throw new Error(unpriced.map((m) => `${CONFIG_FILE}: ${m}`).join("\n"));
  const prompt = readText(configDir, config.system_prompt_file);
  const skills = config.mode === "agent" ? config.agent.skills.map((n) => loadSkill(configDir, n)) : [];
  // The wand's guidance: a skill file, so it is edited (and exported) like the others, but never offered in chats.
  const naming = existsSync(join(configDir, SKILLS_DIR, NAMING_SKILL, SKILL_FILE)) ? { naming_skill: loadSkill(configDir, NAMING_SKILL) } : {};
  if (skills.length === 0) return { config, config_hash: hashJson(config), system_prompt: prompt, system_prompt_hash: sha256Hex(prompt), skills, ...naming };
  const system_prompt = `${prompt.trimEnd()}\n\n${skillsSection(skills)}\n`;
  const record = [system_prompt, "<!-- The skills' files, as read_skill gives them to the model. -->", ...skills.flatMap((s) => Object.entries(s.files).map(([f, text]) => `<!-- ${SKILLS_DIR}/${s.name}/${f} -->\n${text.trimEnd()}`))].join("\n\n");
  return { config, config_hash: hashJson(config), system_prompt, system_prompt_hash: sha256Hex(record), system_prompt_record: record, skills, ...naming };
}
