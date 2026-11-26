import { SKILL_FILE } from '@edw/shared';
import { toolError, type AgentTool } from './types.js';

/**
 * A skill's instructions (its SKILL.md body), or one of its other files. Offered whenever
 * config `agent.skills` names any; the system prompt lists them by name and description.
 */
export const readSkill: AgentTool = {
  name: 'read_skill',
  description:
    "Read a skill's instructions, by the name the system prompt lists it under. Follow them for the rest of the task. A skill may point to further files of its own; read one by passing its path as `file`.",
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The skill name, e.g. as listed in <available_skills>.' },
      file: { type: 'string', description: `Another file of the skill, by the path its instructions give (default: the instructions, ${SKILL_FILE}).` },
    },
    required: ['name'],
    additionalProperties: false,
  },
  label: (args) => `Reading the “${String(args.name)}” skill`,
  execute(args, ctx) {
    const skill = ctx.skills.find((s) => s.name === args.name);
    if (!skill) return toolError(`no skill called ${String(args.name)}`, { skills: ctx.skills.map((s) => s.name) });
    const file = typeof args.file === 'string' && args.file ? args.file.replace(/^\.\//, '') : SKILL_FILE;
    const text = skill.files[file];
    if (text === undefined) return toolError(`the ${skill.name} skill has no file ${file}`, { files: Object.keys(skill.files) });
    const others = Object.keys(skill.files).filter((f) => f !== SKILL_FILE);
    return { output: file === SKILL_FILE && others.length ? `${text}\n\n[This skill's other files: ${others.join(', ')}]` : text };
  },
};
