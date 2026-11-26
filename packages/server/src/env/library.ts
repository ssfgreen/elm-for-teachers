/** The library server that library plugins with no url of their own use. */
import { z } from 'zod';
import { optional, type Vars } from './parse.js';
import { vercelLibraryUrl, type VercelVars } from './vercel.js';

export const libraryVars = {
  /** The library server (library/) that library plugins with no url of their own use; unset, they show as not set up. */
  LIBRARY_URL: optional(z.string().url()),
  /** Sent as a bearer token to LIBRARY_URL; the library deployed beside the app on Vercel needs it. */
  LIBRARY_TOKEN: optional(z.string()),
};

export interface LibraryEnv {
  LIBRARY_URL?: string;
  LIBRARY_TOKEN?: string;
  /**
   * Vercel's protection bypass, for a preview behind Vercel's login: set only when LIBRARY_URL is
   * this deployment's own /library, worked out from VERCEL_*, never one set by hand.
   */
  LIBRARY_BYPASS_SECRET?: string;
}

type LibraryInput = Vars<typeof libraryVars> & VercelVars & { VERCEL_AUTOMATION_BYPASS_SECRET?: string };

export function librarySettings(v: LibraryInput): Pick<LibraryEnv, 'LIBRARY_URL' | 'LIBRARY_BYPASS_SECRET'> {
  const own = v.LIBRARY_URL ? undefined : vercelLibraryUrl(v, v.LIBRARY_TOKEN);
  return {
    LIBRARY_URL: v.LIBRARY_URL ?? own,
    LIBRARY_BYPASS_SECRET: own !== undefined ? v.VERCEL_AUTOMATION_BYPASS_SECRET : undefined,
  };
}
