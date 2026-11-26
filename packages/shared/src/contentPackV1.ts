/**
 * Content Pack (v1) cross-system contract (docs/specs/01-three-system-split.md section 5).
 *
 * Strictly one-way, immutable, anonymised bundle exported by Elm for Teachers and imported by
 * Elm for Students. Every schema here is `.strict()` so no teacher PII, session id, doc id,
 * comments, revision history or pending assistant proposals can leak into a pack.
 */
import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";
import { liveBlocks, type CanvasState } from "./canvas.js";
import { BlockType } from "./enums.js";
import { cleanSvg, isSvgContent } from "./svg.js";

export const CONTENT_PACK_FORMAT_VERSION = "1.0" as const;
export const CONTENT_PACK_ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ContentPackAssetMime = (typeof CONTENT_PACK_ALLOWED_MIMES)[number];

export const CONTENT_PACK_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const CONTENT_PACK_TOTAL_MAX_BYTES = 25 * 1024 * 1024;
export const CONTENT_PACK_PROMPTS_MAX = 20;
export const CONTENT_PACK_BLOCKS_MAX = 1000;

export const ContentPackKind = z.enum(["reading", "worksheet"]);
export type ContentPackKind = z.infer<typeof ContentPackKind>;

/** A frozen live document block: id, type and markdown content only. */
export const ContentPackBlock = z
  .object({
    id: z.string().min(1).max(64),
    type: BlockType,
    content: z.string().max(100_000),
  })
  .strict();
export type ContentPackBlock = z.infer<typeof ContentPackBlock>;

export const ContentPackBlocks = z.array(ContentPackBlock).max(CONTENT_PACK_BLOCKS_MAX);

/** An optional suggested pupil prompt button. Imported only if confirmed by the teacher. */
export const ContentPackPrompt = z
  .object({
    label: z.string().trim().min(1).max(80),
    instruction: z.string().trim().min(1).max(2000),
    after_highlight: z.boolean(),
    follow_up: z.boolean(),
  })
  .strict();
export type ContentPackPrompt = z.infer<typeof ContentPackPrompt>;

export const ContentPackPrompts = z.array(ContentPackPrompt).max(CONTENT_PACK_PROMPTS_MAX);

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SAFE_PATH = /^(?:blocks\.json|prompts\.json|assets\/[A-Za-z0-9_-]+\.(?:png|jpg|webp|gif))$/;

export const ContentPackFileEntry = z
  .object({
    path: z.string().regex(SAFE_PATH, "unsupported pack file path"),
    sha256: z.string().regex(SHA256_HEX, "expected 64-char hex sha256"),
    bytes: z.number().int().nonnegative(),
    mime: z.enum(CONTENT_PACK_ALLOWED_MIMES).optional(),
  })
  .strict();
export type ContentPackFileEntry = z.infer<typeof ContentPackFileEntry>;

export const ContentPackManifest = z
  .object({
    format_version: z.literal(CONTENT_PACK_FORMAT_VERSION),
    pack_id: Ulid,
    kind: ContentPackKind,
    title: z.string().trim().min(1).max(200),
    subject: z.string().trim().min(1).max(120).optional(),
    stage: z.string().trim().min(1).max(120).optional(),
    standard_uris: z.array(z.string().trim().min(1).max(200)).max(80).optional(),
    created_at: Timestamp,
    files: z.array(ContentPackFileEntry).min(1),
    content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/, "expected sha256:<hex>"),
  })
  .strict();
export type ContentPackManifest = z.infer<typeof ContentPackManifest>;

const MIME_EXT: Record<ContentPackAssetMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function contentPackAssetExt(mime: string): string | null {
  return (MIME_EXT as Record<string, string | undefined>)[mime] ?? null;
}

export function isAllowedContentPackMime(mime: string): mime is ContentPackAssetMime {
  return (CONTENT_PACK_ALLOWED_MIMES as readonly string[]).includes(mime);
}

const IMAGE_ASSET_RE = /!\[[^\]]*\]\(asset:([A-Za-z0-9_-]+)\)/g;

/** All `asset:<id>` references inside a block's markdown, in order without duplicates. */
export function referencedAssetIds(blocks: readonly Pick<ContentPackBlock, "content">[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    IMAGE_ASSET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMAGE_ASSET_RE.exec(b.content)) !== null) {
      const id = m[1]!;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * Frozen live blocks of a doc for Content Pack export: drops proposed and deleted blocks,
 * strips pending suggestions and provenance metadata, and sanitises any inline SVGs.
 */
export function extractPackBlocks(state: CanvasState, docId: string): { blocks: ContentPackBlock[]; assetIds: string[] } {
  const blocks: ContentPackBlock[] = liveBlocks(state, docId).map((b) => {
    let content = b.content;
    if (b.type === "image" && isSvgContent(content)) {
      content = cleanSvg(content)?.svg ?? "";
    }
    return ContentPackBlock.parse({ id: b.id, type: b.type, content });
  });
  return { blocks, assetIds: referencedAssetIds(blocks) };
}
