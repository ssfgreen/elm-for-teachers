/**
 * Plugins: what the assistant can reach beyond the chat's own docs and files, chosen by the
 * teacher on the Plugins screen (docs/plugins.md). The catalogue is config `plugins`; each
 * workspace keeps a trust level for each one.
 */
import { z } from "zod";

/** Use freely; ask the teacher first (allowed for one chat at a time); or never offered. */
export const PluginTrust = z.enum(["use", "ask", "off"]);
export type PluginTrust = z.infer<typeof PluginTrust>;

/**
 * `pictures`: a picture library (ARASAAC). `library`: a collection of documents on a library
 * server. `pedagogy`: a pedagogy collection there (entries and citable claims), used in class chats.
 */
export const PluginKind = z.enum(["pictures", "library", "pedagogy"]);
export type PluginKind = z.infer<typeof PluginKind>;

/** One plugin in config `plugins`. */
export const PluginEntry = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/),
    kind: PluginKind,
    name: z.string().min(1).max(80),
    publisher: z.string().min(1).max(120),
    /** What it holds and when it helps, for the teacher and (for a library) the model. */
    description: z.string().min(1).max(600),
    licence: z.string().min(1).max(120),
    homepage: z.string().url().optional(),
    /** Words the Plugins search also matches, such as subjects. */
    tags: z.array(z.string().min(1).max(40)).default([]),
    default_trust: PluginTrust.default("use"),
    /** A library's (or pedagogy collection's) server and collection; a null url means the server's LIBRARY_URL. */
    library: z.object({ url: z.string().url().nullable().default(null), collection: z.string().min(1) }).optional(),
  })
  .refine((p) => (p.kind !== "pictures") === Boolean(p.library), { message: "a library or pedagogy plugin needs `library`, and only those have one" });
export type PluginEntry = z.infer<typeof PluginEntry>;

/** A plugin as the Plugins screen shows it. */
export const PluginInfo = z.object({
  id: z.string(),
  kind: PluginKind,
  name: z.string(),
  publisher: z.string(),
  description: z.string(),
  licence: z.string(),
  homepage: z.string().optional(),
  tags: z.array(z.string()),
  trust: PluginTrust,
  /** False for a library whose server is not set up here: it can't be used yet. */
  available: z.boolean(),
  /** With a chat: an Ask first plugin the teacher has allowed in it, or the assistant has asked for. */
  allowed: z.boolean().optional(),
  requested: z.boolean().optional(),
});
export type PluginInfo = z.infer<typeof PluginInfo>;

export const ARASAAC_PLUGIN_ID = "arasaac";

/** The catalogue when a config names none: the picture library alone. */
export const DEFAULT_PLUGINS: PluginEntry[] = [
  {
    id: ARASAAC_PLUGIN_ID,
    kind: "pictures",
    name: "ARASAAC pictures",
    publisher: "Government of Aragón",
    description: "Clear, simple pictograms made for teaching and communication. The assistant looks here for a picture before drawing one.",
    licence: "CC BY-NC-SA 4.0",
    homepage: "https://arasaac.org",
    tags: ["pictures", "symbols", "additional support needs"],
    default_trust: "use",
  },
];
