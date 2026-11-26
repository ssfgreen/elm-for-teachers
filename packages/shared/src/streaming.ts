/**
 * Reading a model reply while it streams in. The reply is a chat message followed by a
 * ```json fence holding the operations array (see the system prompt); these helpers split
 * the text received so far into the part to show in the chat and the part that is
 * operations, and parse a half-written operations array so its finished operations, and
 * the content of the one being written, can be previewed in the document.
 */

export interface StreamingReply {
  /** The chat message so far, without the operations fence or a half-typed fence opener. */
  message: string;
  /** The body of the operations fence received so far, or null before it starts. */
  opsText: string | null;
  /** True once the fence has closed. */
  opsDone: boolean;
}

const OPEN = /```(json)?[ \t]*\n(?=\s*\[)|```json[ \t]*\n/i;

export function splitStreamingReply(raw: string): StreamingReply {
  const text = raw.replace(/\r\n?/g, "\n");
  const open = OPEN.exec(text);
  if (!open) {
    // Hold back a fence that is still being typed ("`", "``", "```", "```js").
    return { message: text.replace(/`{1,3}[a-z]*$/i, "").trimEnd(), opsText: null, opsDone: false };
  }
  const bodyStart = open.index + open[0].length;
  const close = text.indexOf("```", bodyStart);
  const before = text.slice(0, open.index).trimEnd();
  if (close < 0) return { message: before, opsText: text.slice(bodyStart), opsDone: false };
  const after = text.slice(close + 3).trim();
  return { message: after ? `${before}\n\n${after}` : before, opsText: text.slice(bodyStart, close), opsDone: true };
}

/** A value parsed from a prefix of JSON text; `complete` is false when the text ended inside it. */
interface Parsed {
  value: unknown;
  complete: boolean;
}

/**
 * Parses as much of a JSON array as has arrived. Finished elements come back as they are;
 * an object still being written comes back with the fields received so far (a string cut
 * off mid-way keeps its received part). Returns the elements and whether the last one is
 * finished. Never throws: text that is not an array gives `[]`.
 */
export function parsePartialArray(text: string): { items: unknown[]; lastComplete: boolean } {
  const p = new PartialParser(text);
  p.ws();
  if (p.peek() !== "[") return { items: [], lastComplete: true };
  const r = p.value();
  if (!r || !Array.isArray(r.value)) return { items: [], lastComplete: true };
  return { items: r.value, lastComplete: p.lastElementComplete };
}

class PartialParser {
  private i = 0;
  /** Set by the outermost array: whether its last element was finished. */
  lastElementComplete = true;
  private depth = 0;

  constructor(private readonly s: string) {}

  peek(): string | undefined {
    return this.s[this.i];
  }
  ws(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }
  private eof(): boolean {
    return this.i >= this.s.length;
  }

  /** null means nothing usable (the text ended before the value began, or it is malformed). */
  value(): Parsed | null {
    this.ws();
    if (this.eof()) return null;
    const c = this.s[this.i]!;
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === '"') return this.string();
    return this.literal();
  }

  private array(): Parsed | null {
    const outer = this.depth === 0;
    this.depth++;
    this.i++;
    const out: unknown[] = [];
    let lastComplete = true;
    for (;;) {
      this.ws();
      if (this.eof()) break;
      if (this.s[this.i] === "]") {
        this.i++;
        this.depth--;
        if (outer) this.lastElementComplete = lastComplete;
        return { value: out, complete: true };
      }
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      const v = this.value();
      if (!v) break;
      // A half-written string or number at array level is noise; a half-written object is useful.
      if (v.complete || (v.value !== null && typeof v.value === "object")) out.push(v.value);
      lastComplete = v.complete;
      if (!v.complete) break;
    }
    this.depth--;
    if (outer) this.lastElementComplete = lastComplete;
    return { value: out, complete: false };
  }

  private object(): Parsed | null {
    this.depth++;
    this.i++;
    const out: Record<string, unknown> = {};
    for (;;) {
      this.ws();
      if (this.eof()) break;
      const c = this.s[this.i];
      if (c === "}") {
        this.i++;
        this.depth--;
        return { value: out, complete: true };
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      if (c !== '"') break;
      const key = this.string();
      if (!key || !key.complete) break;
      this.ws();
      if (this.s[this.i] !== ":") break;
      this.i++;
      const v = this.value();
      if (!v) break;
      out[key.value as string] = v.value;
      if (!v.complete) break;
    }
    this.depth--;
    return { value: out, complete: false };
  }

  private string(): Parsed | null {
    this.i++;
    let out = "";
    while (!this.eof()) {
      const c = this.s[this.i]!;
      if (c === '"') {
        this.i++;
        return { value: out, complete: true };
      }
      if (c === "\\") {
        const n = this.s[this.i + 1];
        if (n === undefined) break;
        if (n === "u") {
          const hex = this.s.slice(this.i + 2, this.i + 6);
          if (hex.length < 4) break;
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 6;
          continue;
        }
        out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[n] ?? n;
        this.i += 2;
        continue;
      }
      out += c;
      this.i++;
    }
    this.i = this.s.length;
    return { value: out, complete: false };
  }

  private literal(): Parsed | null {
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(this.s.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    // A number at the very end may still be growing.
    if (this.eof()) return null;
    return { value: JSON.parse(m[0]), complete: true };
  }
}
