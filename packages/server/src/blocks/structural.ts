/** Teacher structural commands (the REST routes) and how a block command is logged. */
import type { BlockContent, BlockType, DocStyle } from "@edw/shared";
import type { StructuralResult } from "./service.js";

export type StructuralCommand =
  /** `derived_from`: the block this one restores (Spyglass's Restore); it must exist. */
  | { command: "insert"; id?: string; doc_id: string; after: string; type: BlockType; content?: string; derived_from?: string }
  | { command: "split"; block_id: string; first: BlockContent; second: BlockContent; second_type?: BlockType; second_id?: string }
  | { command: "merge"; block_id: string; merged_into: string; after: BlockContent }
  | { command: "delete"; block_id: string }
  | { command: "move"; block_id: string; after: string }
  | { command: "retype"; block_id: string; type: BlockType; after?: BlockContent }
  | { command: "doc_create"; thread_id: string; name: string; id?: string }
  | { command: "doc_rename"; doc_id: string; name: string; auto?: boolean }
  | { command: "doc_style"; doc_id: string; style: DocStyle }
  /** The teacher accepted or rejected the model's suggested font or page colour. */
  | { command: "doc_style_decision"; doc_id: string; accept: boolean }
  | { command: "doc_delete"; doc_id: string }
  | { command: "doc_duplicate"; doc_id: string; name: string; id?: string }
  | {
      command: "doc_import";
      thread_id: string;
      name: string;
      id?: string;
      blocks: Array<{ type: BlockType; content: string }>;
      /** A Word file the teacher uploaded, or a reference file the model opened (open_reference_as_doc). */
      source: { kind: "docx"; filename: string; bytes: number } | { kind: "reference"; reference_id: string; filename: string };
    };

export type BlockCommand = Exclude<StructuralCommand, { command: "doc_create" } | { command: "doc_rename" } | { command: "doc_style" } | { command: "doc_style_decision" } | { command: "doc_delete" } | { command: "doc_duplicate" } | { command: "doc_import" }>;

export function structurePayload(cmd: BlockCommand, out: StructuralResult) {
  switch (cmd.command) {
    case "insert":
      return { action: "insert" as const, block_id: out.block!.id, after: cmd.after };
    case "split":
      return { action: "split" as const, block_id: cmd.block_id, new_block_id: out.block!.id };
    case "merge":
      return { action: "merge" as const, block_id: cmd.block_id, merged_into: cmd.merged_into };
    case "delete":
      return { action: "delete" as const, block_id: cmd.block_id };
    case "move":
      return { action: "move" as const, block_id: cmd.block_id, after: cmd.after };
    case "retype":
      return { action: "retype" as const, block_id: cmd.block_id, type: cmd.type };
  }
}
