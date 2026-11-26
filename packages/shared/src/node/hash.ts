/**
 * Node-only hashing. Imported via `@edw/shared/node`, never from
 * the package root, so the client bundle never pulls in node:crypto.
 */
import { createHash } from "node:crypto";
import { stableStringify } from "../stable.js";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash of a JSON-serialisable value, independent of key order. */
export function hashJson(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

/** Combine named parts into one hash; order of parts does not matter. */
export function compositeHash(parts: Record<string, string>): string {
  return hashJson(parts);
}
