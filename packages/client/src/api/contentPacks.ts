/** One-way Content Pack v1 client API (T3). */
import type { ContentPackKind, ContentPackPrompt } from '@edw/shared';
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

export interface ContentPackSummary {
  id: string;
  doc_id: string;
  kind: ContentPackKind;
  title: string;
  format_version: string;
  content_hash: string;
  bytes: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface CreatedContentPack {
  pack_id: string;
  content_hash: string;
  download_url: string;
  import_url: string;
  expires_at: string;
  pack: ContentPackSummary;
}

export interface ContentPacksApi {
  listContentPacks(): Promise<ContentPackSummary[]>;
  createContentPack(
    docId: string,
    input: { kind: ContentPackKind; title?: string; prompts?: ContentPackPrompt[] },
    envelope: Envelope,
  ): Promise<CreatedContentPack>;
  revokeContentPack(packId: string): Promise<void>;
}

export function contentPacksApi(sessionId: string, opts: ApiOptions): ContentPacksApi {
  return {
    listContentPacks: () => api<{ packs: ContentPackSummary[] }>('GET', endpoints.contentPacks(sessionId), undefined, opts).then((r) => r.packs),
    createContentPack: (docId, input, envelope) =>
      api<CreatedContentPack>('POST', endpoints.docContentPacks(sessionId, docId), { ...input, envelope }, opts),
    revokeContentPack: (packId) => api<void>('DELETE', endpoints.contentPack(sessionId, packId), undefined, opts),
  };
}
