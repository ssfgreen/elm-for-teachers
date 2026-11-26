/** The background jobs' settings. */
import { z } from 'zod';
import { optional } from './parse.js';

export const jobsVars = {
  /** Guards the cron route (jobs/routes.ts); Vercel's cron sends it as a bearer token. Unset, the route refuses every call. */
  CRON_SECRET: optional(z.string().min(16, 'CRON_SECRET must be at least 16 characters')),
};

export interface JobsEnv {
  /** The cron route's bearer token (jobs/routes.ts); unset, it refuses every call. */
  CRON_SECRET?: string;
}
