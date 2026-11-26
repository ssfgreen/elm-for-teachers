/** Deterministic zip packing and safe unpacking for Content Pack (v1) archives. */
import JSZip from 'jszip';
import { CONTENT_PACK_TOTAL_MAX_BYTES } from '@edw/shared';

const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z');

/** Pack files in sorted path order with a fixed timestamp so identical input produces identical zip bytes. */
export async function packContentZip(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const name of Object.keys(files).sort()) {
    zip.file(name, files[name]!, { date: FIXED_DATE, createFolders: false, unixPermissions: 0o644 });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' });
}

/** Unpack a Content Pack zip, enforcing the uncompressed byte cap and rejecting directory traversal. */
export async function unpackContentZip(zipBytes: Uint8Array, maxBytes = CONTENT_PACK_TOTAL_MAX_BYTES): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(zipBytes);
  const out = new Map<string, Uint8Array>();
  let total = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (name.startsWith('/') || name.includes('..') || name.includes('\\')) {
      throw new Error(`unsafe zip entry path: ${name}`);
    }
    const data = await entry.async('uint8array');
    total += data.byteLength;
    if (total > maxBytes) throw new Error('unpacked content pack exceeds size limit');
    out.set(name, data);
  }
  return out;
}
