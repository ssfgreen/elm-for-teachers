/**
 * Agent Skills (agentskills.io, as Pi loads them): a folder `config/skills/<name>/` with a
 * `SKILL.md` whose frontmatter gives the skill's name and a description of when to use it,
 * and whose body holds the instructions; other files in the folder are references the
 * instructions may point to. Only the names and descriptions go in the system prompt; the
 * model reads a skill (read_skill) when a request matches it, so skills cost nothing until used.
 */

export interface Skill {
  name: string;
  description: string;
  /** The skill's files by path in its folder: `SKILL.md` (its body, frontmatter removed) and any others. */
  files: Record<string, string>;
}

/** Lowercase words joined by hyphens, as the spec requires (and the folder's name). */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
export const SKILL_FILE = "SKILL.md";

/** A SKILL.md split into its frontmatter fields (simple `key: value` lines) and body. */
export function parseSkillFile(text: string): { fields: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]!] = kv[2]!.trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
  }
  return { fields, body: m[2]!.trim() };
}

/** What a skill folder must satisfy; a message per problem (empty when it is fine). */
export function skillProblems(folder: string, fields: Record<string, string>): string[] {
  const problems: string[] = [];
  const name = fields.name ?? "";
  if (!SKILL_NAME.test(name) || name.length > SKILL_NAME_MAX) problems.push(`name must be lowercase words joined by hyphens, at most ${SKILL_NAME_MAX} characters (got ${JSON.stringify(name)})`);
  else if (name !== folder) problems.push(`name ${name} must match its folder, ${folder}`);
  const description = fields.description ?? "";
  if (!description) problems.push("description is missing");
  else if (description.length > SKILL_DESCRIPTION_MAX) problems.push(`description is over ${SKILL_DESCRIPTION_MAX} characters`);
  return problems;
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The part of the system prompt that offers the skills (empty with none). */
export function skillsSection(skills: readonly Skill[]): string {
  if (skills.length === 0) return "";
  return [
    "## Skills",
    "",
    "Skills hold instructions for particular kinds of task. When the teacher's request matches a skill's description, call read_skill with its name before you answer, and follow what it says. Read a skill only when you need it.",
    "",
    "<available_skills>",
    ...skills.map((s) => `<skill>\n<name>${escapeXml(s.name)}</name>\n<description>${escapeXml(s.description)}</description>\n</skill>`),
    "</available_skills>",
  ].join("\n");
}
