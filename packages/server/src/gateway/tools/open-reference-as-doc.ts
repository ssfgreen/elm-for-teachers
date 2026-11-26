import { readDocument } from './read-document.js';
import { toolError, type AgentTool } from './types.js';

/** "Similes Homework.docx" -> "Similes Homework". */
const docNameOf = (file: string) => file.replace(/\.[a-z0-9]{1,5}$/i, '').trim().slice(0, 200) || 'Untitled';

/**
 * Copies a Word reference file into the chat as an editable doc, with its headings, lists and
 * tables as "Upload .docx" makes them, so the model suggests edits to the teacher's own document
 * instead of retyping it from its text. Unlike the other tools this one writes at once (the doc
 * is the teacher's content, live, not a suggestion); the turn's view takes the new doc, so
 * edit_document can change its blocks in the same turn, and those changes are suggestions.
 */
export const openReferenceAsDoc: AgentTool = {
  name: 'open_reference_as_doc',
  description:
    "Copy a Word reference file into this chat as an editable document, keeping its headings, lists and tables, and get it back as numbered blocks to change with edit_document. Use it when the teacher wants a version of a file they attached or uploaded (adapt, differentiate, correct or shorten it): suggest edits to the copy rather than writing the document again from its text. Only files the catalogue marks as Word documents can be opened. If a document copied from the file is already in this chat, edit that one instead.",
  parameters: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'The reference file id, from the catalogue. The document takes the file’s name.' },
    },
    required: ['file_id'],
    additionalProperties: false,
  },
  label: (args, ctx) => `Opening “${ctx.references?.files.find((f) => f.id === args.file_id)?.name ?? 'a file'}”`,
  async execute(args, ctx) {
    const file = ctx.references?.files.find((f) => f.id === args.file_id);
    if (!file) return toolError(`no reference file with id ${String(args.file_id)}`, { files: (ctx.references?.files ?? []).map((f) => ({ id: f.id, name: f.name })) });
    if (!file.editable || !ctx.openReference) {
      return toolError(`${file.name} can't be opened as a document (only Word files can, and only those added since this was possible). Read it with read_reference; if a new document is needed, write it with edit_document.`);
    }
    // Named after the file, so the teacher knows it is their own document.
    const name = docNameOf(file.name);
    const doc = await ctx.openReference(file, name);
    const read = await readDocument.execute({ doc_id: doc.id }, ctx);
    return { output: `Opened ${file.name} as the document “${doc.name}” (id: ${doc.id}). The teacher sees it now. Suggest your changes to its blocks with edit_document (doc ${doc.id}).\n\n${read.output}` };
  },
};
