#!/usr/bin/env node
/**
 * Checks an S3-compatible image bucket (Cloudflare R2, AWS S3, Backblaze B2, ...) with the
 * server's own signing code, using the S3_* settings from the environment or .env.
 *
 *   pnpm --filter @edw/server build && node scripts/check-bucket.mjs
 *
 * It uploads a small test image through a signed URL (as the browser does), checks its
 * size and type (as the server does before accepting it), downloads it through a signed
 * URL (as an <img> does), and confirms the bucket refuses a tampered signature and a file
 * of a different type than the one signed for, then deletes the test file (as deleting a
 * workspace in /admin does).
 * Prints the bucket's settings but never the secret key.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bucketModule = join(root, 'packages/server/dist/assets/bucket.js');
if (!existsSync(bucketModule)) {
  console.error('Build the server first: pnpm --filter @edw/server build');
  process.exit(2);
}
const { default: dotenv } = await import(join(root, 'packages/server/node_modules/dotenv/lib/main.js')).catch(() => ({ default: null }));
dotenv?.config({ path: join(root, '.env') });
const { bucketFromEnv } = await import(bucketModule);

const env = process.env;
const bucket = bucketFromEnv(env);
if (!bucket) {
  console.error('Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (and S3_REGION, default auto).');
  process.exit(2);
}
console.log(`Bucket ${env.S3_BUCKET} at ${env.S3_ENDPOINT} (region ${env.S3_REGION || 'auto'}, key ${env.S3_ACCESS_KEY_ID})`);

// A 1x1 PNG.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const key = `check-bucket/${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed += 1;
};

try {
  const put = await fetch(bucket.presignPut(key, 'image/png'), { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png });
  check(put.ok, 'upload through a signed URL', `HTTP ${put.status}${put.ok ? '' : ` ${(await put.text()).slice(0, 200)}`}`);

  const head = await bucket.head(key);
  check(head?.bytes === png.length, 'size as stored', head ? `${head.bytes} bytes` : 'not found');
  check(head?.contentType === 'image/png', 'type as stored', head?.contentType ?? 'none');

  const get = await fetch(bucket.presignGet(key, 300));
  const body = Buffer.from(await get.arrayBuffer());
  check(get.ok && body.equals(png), 'download through a signed URL', `HTTP ${get.status}, ${body.length} bytes`);

  const tampered = bucket.presignGet(key, 300).replace(/X-Amz-Signature=([0-9a-f])/, (_m, c) => `X-Amz-Signature=${c === '0' ? '1' : '0'}`);
  const bad = await fetch(tampered);
  check(bad.status === 403 || bad.status === 400, 'a tampered signature is refused', `HTTP ${bad.status}`);

  const wrongType = await fetch(bucket.presignPut(`${key}.other`, 'image/png'), { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: '<p>not an image</p>' });
  check(wrongType.status === 403 || wrongType.status === 400, 'a different file type than signed for is refused', `HTTP ${wrongType.status}`);

  check((await bucket.head('check-bucket/does-not-exist.png')) === null, 'a missing file is reported as missing');

  await bucket.delete(key);
  check((await bucket.head(key)) === null, 'delete (as deleting a workspace does)');
} catch (err) {
  check(false, 'reaching the bucket', err instanceof Error ? err.message : String(err));
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nThe bucket works with the editor.');
console.log('Uploads from the browser also need the bucket CORS rule in DEPLOY.md section 5; this script cannot test that.');
process.exit(failed ? 1 : 0);
