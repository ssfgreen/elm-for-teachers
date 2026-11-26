/**
 * One-way Content Pack v1 export service (T3).
 * Freezes a document's live blocks and referenced assets into a deterministic zip bundle,
 * stores it in the object bucket (or DB fallback in dev/tests), and returns a 7-day capability link.
 */
import { randomBytes } from 'node:crypto';
import {
  CONTENT_PACK_FORMAT_VERSION,
  extractPackBlocks,
  newUlid,
  nowIso,
  type ContentPackKind,
  type ContentPackPrompt,
} from '@edw/shared';
import { buildContentPackFiles, type ContentPackAssetInput } from '@edw/shared/node';
import { bucketKey, getAsset } from '../assets/store.js';
import type { AppDeps } from '../deps.js';
import { badRequest, notFound } from '../http-error.js';
import { enqueue } from '../jobs/store.js';
import { hashLinkCode, insertContentPack, type ContentPackRecord } from './store.js';
import { packContentZip } from './zip.js';

export const CONTENT_PACK_TTL_DAYS = 7;
const TTL_MS = CONTENT_PACK_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface ExportContentPackInput {
  sessionId: string;
  docId: string;
  kind: ContentPackKind;
  title?: string;
  prompts?: ContentPackPrompt[];
  /** Request origin used when PUBLIC_BASE_URL is unset. */
  origin: string;
  /** Injectable fetch for bucket PUT/GET in tests. */
  fetchImpl?: typeof fetch;
}

export interface ExportContentPackResult {
  pack_id: string;
  content_hash: string;
  download_url: string;
  import_url: string;
  expires_at: string;
  pack: ContentPackRecord;
}

export async function exportContentPack(
  deps: Pick<AppDeps, 'db' | 'canvas' | 'bucket' | 'env'>,
  input: ExportContentPackInput,
): Promise<ExportContentPackResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const state = await deps.canvas.loadState(input.sessionId);
  const doc = state.docs.get(input.docId);
  if (!doc) throw notFound('doc');

  const { blocks: packBlocks, assetIds } = extractPackBlocks(state, doc.id);
  if (packBlocks.length === 0) throw badRequest('the document has no live content to export', 'empty_doc');

  const assets: ContentPackAssetInput[] = [];
  for (const assetId of assetIds) {
    const asset = await getAsset(deps.db, input.sessionId, assetId);
    if (!asset || asset.status !== 'ready') continue;
    let bytes: Uint8Array | null = null;
    if (asset.storage === 'db' && asset.data) {
      bytes = new Uint8Array(asset.data);
    } else if (asset.storage === 'bucket' && deps.bucket) {
      const url = deps.bucket.presignGet(bucketKey(input.sessionId, asset.asset_id), 120);
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`could not read asset ${asset.asset_id} from bucket (${res.status})`);
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (!bytes) continue;
    assets.push({ asset_id: asset.asset_id, mime: asset.mime, bytes });
  }

  const packId = newUlid();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.parse(createdAt) + TTL_MS).toISOString();
  const title = (input.title?.trim() || doc.name).slice(0, 200);

  const built = buildContentPackFiles({
    pack_id: packId,
    kind: input.kind,
    title,
    created_at: createdAt,
    blocks: packBlocks,
    assets,
    ...(input.prompts?.length ? { prompts: input.prompts } : {}),
  });
  const contentHash = built.manifest.content_hash;

  const zipBytes = await packContentZip(built.files);
  const storageKey = `packs/${packId}.zip`;

  let zipData: Buffer | null = null;
  if (deps.bucket) {
    const putUrl = deps.bucket.presignPut(storageKey, 'application/zip', 120);
    const putRes = await fetchFn(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: Buffer.from(zipBytes),
    });
    if (!putRes.ok) throw new Error(`could not store content pack in bucket (${putRes.status})`);
  } else {
    zipData = Buffer.from(zipBytes);
  }

  const rawCode = randomBytes(32).toString('base64url');
  const pack = await insertContentPack(deps.db, {
    id: packId,
    session_id: input.sessionId,
    doc_id: doc.id,
    kind: input.kind,
    title,
    format_version: CONTENT_PACK_FORMAT_VERSION,
    content_hash: contentHash,
    storage_key: storageKey,
    bytes: zipBytes.byteLength,
    link_code_hash: hashLinkCode(rawCode),
    zip_data: zipData,
    created_at: createdAt,
    expires_at: expiresAt,
  });

  await enqueue(deps.db, 'expire_content_pack', { pack_id: packId }, { runAfter: new Date(expiresAt) });

  const base = (deps.env.PUBLIC_BASE_URL ?? input.origin).replace(/\/+$/, '');
  const download_url = `${base}/api/packs/${rawCode}`;
  const import_url = deps.env.STUDENTS_URL
    ? `${deps.env.STUDENTS_URL.replace(/\/+$/, '')}/import?pack=${encodeURIComponent(download_url)}`
    : download_url;

  return {
    pack_id: packId,
    content_hash: contentHash,
    download_url,
    import_url,
    expires_at: expiresAt,
    pack,
  };
}
