/** The pupil sign-in setting (issue #179). Joined into the server's settings by env.ts. */
import { z } from 'zod';
import { optional } from '../env/parse.js';

export const pupilsVars = {
  /**
   * Pupil sign-in is on only with `on`. Unset or `off` stops every pupil route at once, whatever
   * any workspace's `pupils` switch says: it fails closed (#179 review).
   */
  PUPILS: optional(z.enum(['on', 'off'])),
};

export interface PupilsEnv {
  PUPILS?: 'on' | 'off';
}
