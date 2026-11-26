/**
 * Canonical JSON serialisation: object keys sorted recursively, arrays kept in order,
 * `undefined` properties omitted. Two structurally equal values always serialise to
 * the same string, so hashes of configuration are stable across machines.
 */
export function stableStringify(value: unknown): string {
  return serialise(value, new Set());
}

function serialise(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("stableStringify: non-finite number");
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      throw new TypeError("stableStringify: undefined at top level or inside an array");
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`stableStringify: unsupported type ${typeof value}`);
  }
  if (typeof value !== "object") throw new TypeError("stableStringify: unreachable");
  if (seen.has(value)) throw new TypeError("stableStringify: circular structure");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return "[" + value.map((v) => serialise(v === undefined ? null : v, seen)).join(",") + "]";
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + serialise(obj[k], seen)).join(",") + "}";
  } finally {
    seen.delete(value);
  }
}
