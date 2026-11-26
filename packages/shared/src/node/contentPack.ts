/**
 * Node-only builder and verifier for Content Pack (v1) bundles (uses node:crypto SHA-256).
 * Kept in `@edw/shared/node` so client bundles never pull in node:crypto.
 */
import { createHash } from "node:crypto";
import {
  CONTENT_PACK_ASSET_MAX_BYTES,
  CONTENT_PACK_FORMAT_VERSION,
  CONTENT_PACK_TOTAL_MAX_BYTES,
  ContentPackBlocks,
  ContentPackManifest,
  ContentPackPrompts,
  contentPackAssetExt,
  isAllowedContentPackMime,
  referencedAssetIds,
  type ContentPackAssetMime,
  type ContentPackBlock,
  type ContentPackFileEntry,
  type ContentPackKind,
  type ContentPackPrompt,
} from "../contentPackV1.js";
import { sha256Hex } from "./hash.js";

export interface ContentPackAssetInput {
  asset_id: string;
  mime: string;
  bytes: Uint8Array;
}

export interface BuildContentPackInput {
  pack_id: string;
  kind: ContentPackKind;
  title: string;
  subject?: string;
  stage?: string;
  standard_uris?: string[];
  created_at: string;
  blocks: ContentPackBlock[];
  prompts?: ContentPackPrompt[];
  assets?: ContentPackAssetInput[];
}

export interface BuiltContentPack {
  manifest: ContentPackManifest;
  /** Every file in the archive, including `manifest.json`, ready for zipping. */
  files: Record<string, Uint8Array>;
  totalBytes: number;
}

export interface VerifiedContentPack {
  manifest: ContentPackManifest;
  blocks: ContentPackBlock[];
  prompts: ContentPackPrompt[];
  assets: Map<string, { path: string; mime: ContentPackAssetMime; bytes: Uint8Array; sha256: string }>;
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });
const toJsonBytes = (v: unknown): Uint8Array => enc.encode(JSON.stringify(v, null, 2) + "\n");

/**
 * Deterministic `sha256:<hex>` over the pack's non-manifest files in sorted path order.
 * Each entry contributes `<path>\0<byteLength>\0` followed by its raw bytes.
 */
export function computeContentPackHash(entries: readonly ContentPackFileEntry[], byPath: ReadonlyMap<string, Uint8Array>): string {
  const hash = createHash("sha256");
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of sorted) {
    const data = byPath.get(entry.path);
    if (!data) throw new Error(`missing content for ${entry.path}`);
    hash.update(enc.encode(`${entry.path}\0${data.byteLength}\0`));
    hash.update(data);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function buildContentPackFiles(input: BuildContentPackInput): BuiltContentPack {
  const blocks = ContentPackBlocks.parse(input.blocks);
  const prompts = input.prompts?.length ? ContentPackPrompts.parse(input.prompts) : null;
  const neededAssets = new Set(referencedAssetIds(blocks));

  const byPath = new Map<string, Uint8Array>();
  const entries: ContentPackFileEntry[] = [];

  const addFile = (path: string, bytes: Uint8Array, mime?: ContentPackAssetMime) => {
    byPath.set(path, bytes);
    entries.push({ path, sha256: sha256Hex(bytes), bytes: bytes.byteLength, ...(mime ? { mime } : {}) });
  };

  addFile("blocks.json", toJsonBytes(blocks));
  if (prompts) addFile("prompts.json", toJsonBytes(prompts));

  const seenAssets = new Set<string>();
  for (const a of input.assets ?? []) {
    if (!neededAssets.has(a.asset_id)) continue;
    if (seenAssets.has(a.asset_id)) continue;
    if (!isAllowedContentPackMime(a.mime)) throw new Error(`disallowed asset mime: ${a.mime}`);
    if (a.bytes.byteLength > CONTENT_PACK_ASSET_MAX_BYTES) {
      throw new Error(`asset ${a.asset_id} exceeds ${CONTENT_PACK_ASSET_MAX_BYTES} bytes`);
    }
    const ext = contentPackAssetExt(a.mime)!;
    seenAssets.add(a.asset_id);
    addFile(`assets/${a.asset_id}.${ext}`, a.bytes, a.mime);
  }

  for (const id of neededAssets) {
    if (!seenAssets.has(id)) throw new Error(`missing referenced asset: ${id}`);
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  const content_hash = computeContentPackHash(entries, byPath);

  const manifest = ContentPackManifest.parse({
    format_version: CONTENT_PACK_FORMAT_VERSION,
    pack_id: input.pack_id,
    kind: input.kind,
    title: input.title,
    ...(input.subject ? { subject: input.subject } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.standard_uris?.length ? { standard_uris: input.standard_uris } : {}),
    created_at: input.created_at,
    files: entries,
    content_hash,
  });

  const manifestBytes = toJsonBytes(manifest);
  const totalBytes = manifestBytes.byteLength + entries.reduce((sum, e) => sum + e.bytes, 0);
  if (totalBytes > CONTENT_PACK_TOTAL_MAX_BYTES) {
    throw new Error(`content pack exceeds ${CONTENT_PACK_TOTAL_MAX_BYTES} bytes`);
  }

  const files: Record<string, Uint8Array> = { "manifest.json": manifestBytes };
  for (const entry of entries) files[entry.path] = byPath.get(entry.path)!;
  return { manifest, files, totalBytes };
}

/** Verify an unpacked archive's files against the Content Pack v1 contract. */
export function verifyContentPackFiles(files: ReadonlyMap<string, Uint8Array>, expectedHash?: string): VerifiedContentPack {
  const rawManifest = files.get("manifest.json");
  if (!rawManifest) throw new Error("manifest.json is missing");

  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(dec.decode(rawManifest));
  } catch (err) {
    throw new Error(`manifest.json is not valid JSON: ${(err as Error).message}`);
  }
  const manifest = ContentPackManifest.parse(parsedManifest);

  if (expectedHash && manifest.content_hash !== expectedHash) {
    throw new Error("content_hash does not match expected hash");
  }

  const expectedPaths = new Set<string>(["manifest.json", ...manifest.files.map((f) => f.path)]);
  for (const path of files.keys()) {
    if (!expectedPaths.has(path)) throw new Error(`unexpected file in pack: ${path}`);
  }

  let totalBytes = rawManifest.byteLength;
  const assets = new Map<string, { path: string; mime: ContentPackAssetMime; bytes: Uint8Array; sha256: string }>();

  for (const entry of manifest.files) {
    const data = files.get(entry.path);
    if (!data) throw new Error(`missing listed file: ${entry.path}`);
    if (data.byteLength !== entry.bytes) throw new Error(`byte length mismatch for ${entry.path}`);
    if (sha256Hex(data) !== entry.sha256) throw new Error(`sha256 mismatch for ${entry.path}`);
    totalBytes += data.byteLength;

    if (entry.path.startsWith("assets/")) {
      if (!entry.mime) throw new Error(`missing mime for asset ${entry.path}`);
      if (data.byteLength > CONTENT_PACK_ASSET_MAX_BYTES) throw new Error(`asset ${entry.path} exceeds size limit`);
      const m = /^assets\/([A-Za-z0-9_-]+)\.[a-z]+$/.exec(entry.path);
      if (!m) throw new Error(`invalid asset path: ${entry.path}`);
      assets.set(m[1]!, { path: entry.path, mime: entry.mime, bytes: data, sha256: entry.sha256 });
    }
  }
  if (totalBytes > CONTENT_PACK_TOTAL_MAX_BYTES) throw new Error("content pack exceeds size limit");

  const actualHash = computeContentPackHash(manifest.files, files);
  if (actualHash !== manifest.content_hash) throw new Error("content_hash mismatch");

  const blocksRaw = files.get("blocks.json");
  if (!blocksRaw) throw new Error("blocks.json is missing");
  const blocks = ContentPackBlocks.parse(JSON.parse(dec.decode(blocksRaw)));

  for (const id of referencedAssetIds(blocks)) {
    if (!assets.has(id)) throw new Error(`blocks reference missing asset: ${id}`);
  }

  const promptsRaw = files.get("prompts.json");
  const prompts = promptsRaw ? ContentPackPrompts.parse(JSON.parse(dec.decode(promptsRaw))) : [];

  return { manifest, blocks, prompts, assets };
}
