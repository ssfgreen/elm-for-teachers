/** An S3-compatible bucket for images (Cloudflare R2, AWS S3, Backblaze B2). */
import { z } from 'zod';
import { optional, type Vars } from './parse.js';

export const bucketVars = {
  /** All four or none. */
  S3_ENDPOINT: optional(z.string().url()),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),
  /** `auto` for R2 (the default); the bucket's region for AWS. */
  S3_REGION: optional(z.string()),
};

export interface BucketEnv {
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
}

export function checkBucket(v: Vars<typeof bucketVars>): void {
  const set = [v.S3_ENDPOINT, v.S3_BUCKET, v.S3_ACCESS_KEY_ID, v.S3_SECRET_ACCESS_KEY].filter(Boolean).length;
  if (set !== 0 && set !== 4) {
    throw new Error('Invalid environment:\n  S3_*: set all of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or none');
  }
}
