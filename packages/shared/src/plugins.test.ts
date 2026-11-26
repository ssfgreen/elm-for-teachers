import { describe, expect, it } from "vitest";
import { AppConfig } from "./config.js";
import { DEFAULT_PLUGINS, PluginEntry } from "./plugins.js";

const library = { id: "trails", kind: "library", name: "TRAILS", publisher: "TRAILS", description: "AI literacy resources.", licence: "unknown", library: { collection: "trails" } };

describe("plugins", () => {
  it("fills in a library's defaults: trust Use freely, no tags, the server's own LIBRARY_URL", () => {
    expect(PluginEntry.parse(library)).toMatchObject({ tags: [], default_trust: "use", library: { url: null, collection: "trails" } });
  });

  it("refuses a library without a collection, and a picture library with one", () => {
    const { library: _l, ...bare } = library;
    void _l;
    expect(PluginEntry.safeParse(bare).success).toBe(false);
    expect(PluginEntry.safeParse({ ...DEFAULT_PLUGINS[0], library: { collection: "x" } }).success).toBe(false);
    expect(PluginEntry.safeParse({ ...library, id: "Not An Id" }).success).toBe(false);
  });

  it("gives a config with no plugins the picture library alone", () => {
    const parsed = AppConfig.shape.plugins.parse(undefined);
    expect(parsed.map((p) => p.id)).toEqual(["arasaac"]);
  });
});
