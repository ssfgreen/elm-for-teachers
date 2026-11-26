/**
 * Image files in an S3-compatible bucket: Cloudflare R2, AWS S3, Backblaze B2 and others.
 * The server never handles the bytes. It signs short-lived URLs: the browser PUTs the file
 * straight to the bucket, and an <img> is redirected to a signed GET. That keeps every
 * request small, which serverless hosts require (Vercel accepts at most 4.5 MB a request).
 *
 * Signing is AWS Signature Version 4 in its query-string ("presigned URL") form, written
 * out here with node:crypto (see bucket.test.ts for AWS's published example).
 */
import { createHash, createHmac } from 'node:crypto';

export interface BucketConfig {
  /** e.g. https://<account>.r2.cloudflarestorage.com, or https://s3.eu-west-2.amazonaws.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `auto` for R2; the bucket's region for AWS. */
  region: string;
}

export interface Bucket {
  /** A URL the browser can PUT the file to (with this Content-Type), valid for `seconds`. */
  presignPut(key: string, contentType: string, seconds?: number): string;
  /** A URL that fetches the file, valid for `seconds`. */
  presignGet(key: string, seconds?: number): string;
  /** Size and type of a stored file, or null when it is not there. */
  head(key: string): Promise<{ bytes: number; contentType: string | null } | null>;
  /** Remove a stored file; removing one that is not there is not an error. */
  delete(key: string): Promise<void>;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();
/** RFC 3986 encoding, as SigV4 wants (encodeURIComponent leaves !'()* alone). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p: string) => p.split('/').map(enc).join('/');

/** The presigned URL for one request (AWS Signature Version 4, query string). */
export function presign(
  cfg: BucketConfig,
  p: { method: string; key: string; seconds: number; now?: Date; signedHeaders?: Record<string, string>; virtualHost?: boolean },
): string {
  const endpoint = new URL(cfg.endpoint);
  const host = p.virtualHost ? `${cfg.bucket}.${endpoint.host}` : endpoint.host;
  const path = p.virtualHost ? `/${encPath(p.key)}` : `/${enc(cfg.bucket)}/${encPath(p.key)}`;
  const amzDate = (p.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const headers: Record<string, string> = { host, ...Object.fromEntries(Object.entries(p.signedHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])) };
  const names = Object.keys(headers).sort();
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(p.seconds),
    'X-Amz-SignedHeaders': names.join(';'),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k]!)}`)
    .join('&');
  const canonical = [p.method, path, canonicalQuery, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, day), cfg.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `${endpoint.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function createBucket(cfg: BucketConfig, fetchImpl: typeof fetch = fetch): Bucket {
  return {
    presignPut: (key, contentType, seconds = 600) => presign(cfg, { method: 'PUT', key, seconds, signedHeaders: { 'content-type': contentType } }),
    presignGet: (key, seconds = 3600) => presign(cfg, { method: 'GET', key, seconds }),
    async head(key) {
      const res = await fetchImpl(presign(cfg, { method: 'HEAD', key, seconds: 60 }), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`bucket HEAD returned ${res.status}`);
      return { bytes: Number(res.headers.get('content-length') ?? 0), contentType: res.headers.get('content-type') };
    },
    async delete(key) {
      const res = await fetchImpl(presign(cfg, { method: 'DELETE', key, seconds: 60 }), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`bucket DELETE returned ${res.status}`);
    },
  };
}

/** The bucket from the environment, or null when uploads are kept in the database. */
export function bucketFromEnv(env: { S3_ENDPOINT?: string; S3_BUCKET?: string; S3_ACCESS_KEY_ID?: string; S3_SECRET_ACCESS_KEY?: string; S3_REGION?: string }): Bucket | null {
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  return createBucket({ endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, region: env.S3_REGION || 'auto' });
}
