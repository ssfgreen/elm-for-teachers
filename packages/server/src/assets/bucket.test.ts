import { describe, expect, it, vi } from 'vitest';
import { bucketFromEnv, createBucket, presign } from './bucket.js';

describe('presign (AWS Signature Version 4, query string)', () => {
  it("matches AWS's published presigned-URL example", () => {
    // docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presign(
      { endpoint: 'https://s3.amazonaws.com', bucket: 'examplebucket', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
      { method: 'GET', key: 'test.txt', seconds: 86400, now: new Date('2013-05-24T00:00:00Z'), virtualHost: true },
    );
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('signs path-style URLs (R2) and the Content-Type of an upload', () => {
    const cfg = { endpoint: 'https://acct.r2.cloudflarestorage.com', bucket: 'worksheets', accessKeyId: 'k', secretAccessKey: 's', region: 'auto' };
    const put = new URL(presign(cfg, { method: 'PUT', key: 'sessions/S1/ast_1', seconds: 600, signedHeaders: { 'Content-Type': 'image/png' } }));
    expect(put.host).toBe('acct.r2.cloudflarestorage.com');
    expect(put.pathname).toBe('/worksheets/sessions/S1/ast_1');
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(put.searchParams.get('X-Amz-Credential')).toMatch(/^k\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(put.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('bucket', () => {
  const cfg = { endpoint: 'https://acct.r2.cloudflarestorage.com', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', region: 'auto' };
  it('reads size and type with a signed HEAD, and null when missing', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('missing') ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { 'content-length': '1234', 'content-type': 'image/png' } }),
    );
    const bucket = createBucket(cfg, fetchImpl as unknown as typeof fetch);
    expect(await bucket.head('sessions/S/ast_1')).toEqual({ bytes: 1234, contentType: 'image/png' });
    expect(await bucket.head('missing')).toBeNull();
    expect(fetchImpl.mock.calls[0]![0]).toContain('X-Amz-Signature=');
  });

  it('deletes with a signed DELETE, treating a missing file as deleted', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) =>
      new Response(null, { status: url.includes('broken') ? 500 : url.includes('missing') ? 404 : init?.method === 'DELETE' ? 204 : 400 }),
    );
    const bucket = createBucket(cfg, fetchImpl as unknown as typeof fetch);
    await bucket.delete('sessions/S/ast_1');
    await bucket.delete('missing');
    await expect(bucket.delete('broken')).rejects.toThrow(/500/);
    expect(fetchImpl.mock.calls[0]![0]).toContain('X-Amz-Signature=');
    expect(fetchImpl.mock.calls[0]![1]).toEqual({ method: 'DELETE' });
  });

  it('is configured from the environment only when all four settings are there', () => {
    expect(bucketFromEnv({})).toBeNull();
    expect(bucketFromEnv({ S3_ENDPOINT: 'https://x', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k' })).toBeNull();
    expect(bucketFromEnv({ S3_ENDPOINT: 'https://x', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' })).not.toBeNull();
  });
});
