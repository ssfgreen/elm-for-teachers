/** The agent's tools by name; config `agent.tools` picks which the model is offered. */
import { addComment } from './add-comment.js';
import { checkLayoutTool } from './check-layout.js';
import { editDocument } from './edit-document.js';
import { readDocument } from './read-document.js';
import { readReference } from './read-reference.js';
import { openReferenceAsDoc } from './open-reference-as-doc.js';
import { searchPictures } from './search-pictures.js';
import { searchReferences } from './search-references.js';
import { readSkill } from './read-skill.js';
import { replyToComment } from './reply-to-comment.js';
import type { AgentTool } from './types.js';

export type { AgentTool, AgentView, CommentDraft, ToolContext, ToolResult } from './types.js';

export const TOOL_REGISTRY: Readonly<Record<string, AgentTool>> = {
  [readDocument.name]: readDocument,
  [editDocument.name]: editDocument,
  [checkLayoutTool.name]: checkLayoutTool,
  [addComment.name]: addComment,
  [replyToComment.name]: replyToComment,
  [readSkill.name]: readSkill,
  [searchPictures.name]: searchPictures,
};

/** Offered on top of a config's tools when the chat's project has reference files. */
export const REFERENCE_TOOLS: readonly AgentTool[] = [searchReferences, readReference, openReferenceAsDoc];

/** The tools config `agent.tools` defaults to; read_skill comes with config `agent.skills` instead. */
export const DEFAULT_TOOLS = Object.keys(TOOL_REGISTRY).filter((n) => n !== readSkill.name);

/** The tools a config offers: `agent.tools`, and read_skill when it names skills. */
export function agentToolsFor(tools: readonly string[], skillCount: number): AgentTool[] {
  const named = toolsByName(tools);
  return skillCount > 0 && !named.includes(readSkill) ? [...named, readSkill] : named;
}

/** The tools named, in that order; throws on a name the registry does not have. */
export function toolsByName(names: readonly string[]): AgentTool[] {
  return names.map((n) => {
    const tool = TOOL_REGISTRY[n];
    if (!tool) throw new Error(`config agent.tools names an unknown tool: ${n} (known: ${DEFAULT_TOOLS.join(', ')})`);
    return tool;
  });
}
