/**
 * Reading a draft's name from the studio when it is added. The studio's draft address (S5) is not
 * built yet: a JSON answer with a `name` (or `manifest.name`, `plugin.name`) gives the name, and
 * anything else (no answer, an error, a redirect, not JSON) gives the placeholder. Failures are
 * never logged: the error could carry the address.
 */
import { createHash } from 'node:crypto';
import { cappedText } from '../capped-text.js';

export const DRAFT_NAME_PLACEHOLDER = 'Studio draft';
export const DRAFT_NAME_MAX = 80;
/** E1a's timeout for any read of a draft's address. */
export const READ_MS = 3000;
/** Bytes, not characters: for any answer from the studio. */
export const BODY_MAX = 256 * 1024;

export interface DraftRead {
  name: string;
  /** contentHashOf the studio's answer; null when it could not be read. */
  content_hash: string | null;
}

/** A plain one-line name of at most DRAFT_NAME_MAX characters, or null. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const one = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return one ? one.slice(0, DRAFT_NAME_MAX) : null;
}

function nameIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const inner = (k: string) => (o[k] && typeof o[k] === 'object' ? (o[k] as Record<string, unknown>).name : undefined);
  return cleanName(o.name) ?? cleanName(inner('manifest')) ?? cleanName(inner('plugin'));
}

/** The studio's JSON answer at a draft's address and its text, or null (not JSON, too big, an error, a redirect, too slow). */
export async function readAnswer(address: string, fetchFn: typeof fetch = fetch, ms = READ_MS): Promise<{ json: unknown; text: string } | null> {
  try {
    const res = await fetchFn(address, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(ms) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const text = await cappedText(res, BODY_MAX);
    if (text === null) return null;
    return { json: JSON.parse(text), text };
  } catch {
    return null;
  }
}

const HASH_RE = /^(?:sha256:)?([0-9a-f]{64})$/;

/**
 * A draft's content hash, the one rule for plugin_draft_add and chat_prompt (#159): the studio's
 * own when its answer carries one (`content_hash`, or under `manifest` or `plugin`), else a sha256
 * of the answer; always written `sha256:<64 hex>`.
 */
export function contentHashOf(json: unknown, text: string): string {
  const o = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const inner = (k: string) => (o[k] && typeof o[k] === 'object' ? (o[k] as Record<string, unknown>).content_hash : undefined);
  for (const v of [o.content_hash, inner('manifest'), inner('plugin')]) {
    const m = typeof v === 'string' ? HASH_RE.exec(v) : null;
    if (m) return `sha256:${m[1]}`;
  }
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/** The draft's name and content hash, read from the studio; the placeholder when it cannot be. */
export async function readDraft(address: string, fetchFn: typeof fetch = fetch, ms = READ_MS): Promise<DraftRead> {
  const answer = await readAnswer(address, fetchFn, ms);
  if (!answer) return { name: DRAFT_NAME_PLACEHOLDER, content_hash: null };
  return { name: nameIn(answer.json) ?? DRAFT_NAME_PLACEHOLDER, content_hash: contentHashOf(answer.json, answer.text) };
}
