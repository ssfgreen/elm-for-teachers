/** The plugin studio whose drafts a workspace may add (plugins/drafts/). */
import { z } from 'zod';
import { optional } from './parse.js';

/** Whether an address is one a studio may be at: https, or http on this machine (a local studio). */
function studioOrigin(entry: string): string | null {
  let u: URL;
  try {
    u = new URL(entry);
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return u.origin;
}

const entries = (v: string): string[] => v.split(',').map((x) => x.trim()).filter(Boolean);

export const studioVars = {
  /**
   * The plugin studio's address, or several separated by commas: a draft is added only from one of
   * these origins. Unset, a workspace cannot add drafts at all.
   */
  PLUGIN_STUDIO_URL: optional(
    z.string().refine((v) => entries(v).length > 0 && entries(v).every((e) => studioOrigin(e) !== null), 'PLUGIN_STUDIO_URL must be https addresses (http only for localhost), separated by commas'),
  ),
};

export interface StudioEnv {
  /** The studio origins drafts may come from, comma separated; unset, drafts are off. */
  PLUGIN_STUDIO_URL?: string;
}

/** The origins on the allow-list; empty when drafts are off. */
export function studioOrigins(env: StudioEnv): string[] {
  if (!env.PLUGIN_STUDIO_URL) return [];
  return [...new Set(entries(env.PLUGIN_STUDIO_URL).map(studioOrigin).filter((o): o is string => o !== null))];
}
