/**
 * Using a draft in a turn (#159): what the studio's runner says the draft holds, and a library
 * client for its tools. The runner (S5) is not built yet; this reads the answer E1a reads at the
 * draft's address, as plugin.json does (docs/plugin-platform.md section 9):
 *   GET  <address>                              -> { name?, content_hash?, collections: [{ id, kind }] }
 *                                                  (or the same under `manifest` or `plugin`)
 *   POST <address>/api/collections/<c>/<tool>   -> as a library server answers (docs/plugins.md)
 * The address holds the draft's secret code: nothing here logs it, and an error the model sees
 * has it taken out.
 */
import { createLibraryClient, LibraryError, type LibraryClient } from '../library-client.js';
import { BODY_MAX, contentHashOf, readAnswer, READ_MS } from './studio.js';

/** What a turn needs from a draft's answer. */
export interface DraftManifest {
  /** studio.ts contentHashOf: the same rule as plugin_draft_add. */
  content_hash: string;
  /** The collection the turn uses: a pedagogy one first, else the first documents one; null when it has neither. */
  collection: { id: string; kind: 'library' | 'pedagogy' } | null;
  /** The manifest's description, one line, or null. */
  description: string | null;
}

export interface DraftRunner {
  /** The draft's manifest; null when the studio is down, slow (over READ_MS) or answers something else. */
  read(address: string): Promise<DraftManifest | null>;
  /** A client for the draft's tools: no redirects, answers of at most 256 KB, as E1a's read. */
  client(address: string): LibraryClient;
}

const DESCRIPTION_MAX = 300;
/** A tool call may take longer than reading the manifest, but not as long as a library server. */
const CALL_MS = 8000;

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** One plain line of at most DESCRIPTION_MAX characters, or null. */
function oneLine(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const one = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return one ? one.slice(0, DESCRIPTION_MAX) : null;
}

export function manifestOf(json: unknown, text: string): DraftManifest {
  const top = obj(json) ?? {};
  const inner = obj(top.manifest) ?? obj(top.plugin) ?? {};
  const pick = (k: string) => top[k] ?? inner[k];
  const cols = (Array.isArray(pick('collections')) ? (pick('collections') as unknown[]) : []).map(obj).filter((c) => c && typeof c.id === 'string' && c.id.trim());
  const pedagogy = cols.find((c) => c!.kind === 'pedagogy');
  const documents = cols.find((c) => c!.kind === 'documents');
  const chosen = pedagogy ? { id: String(pedagogy.id).trim(), kind: 'pedagogy' as const } : documents ? { id: String(documents.id).trim(), kind: 'library' as const } : null;
  return { content_hash: contentHashOf(json, text), collection: chosen, description: oneLine(pick('description')) };
}

/** The address, and its secret code on its own, taken out of a message. */
export function withoutAddress(message: string, address: string): string {
  const code = address.slice(address.lastIndexOf('/') + 1);
  return message.split(address).join('the draft').split(code).join('…');
}

/** A client whose errors never carry the address (the studio may repeat it in a refusal). */
function scrubbed(inner: LibraryClient, address: string): LibraryClient {
  return {
    async call(collection, op, body) {
      try {
        return await inner.call(collection, op, body);
      } catch (err) {
        if (err instanceof LibraryError) throw new LibraryError(withoutAddress(err.message, address), err.status);
        throw new LibraryError('the draft could not be reached', null);
      }
    },
  };
}

export function createDraftRunner(fetchFn: typeof fetch = fetch, readMs = READ_MS, callMs = CALL_MS): DraftRunner {
  return {
    async read(address) {
      const answer = await readAnswer(address, fetchFn, readMs);
      return answer ? manifestOf(answer.json, answer.text) : null;
    },
    client: (address) => scrubbed(createLibraryClient(address, fetchFn, callMs, {}, { maxBytes: BODY_MAX }), address),
  };
}
