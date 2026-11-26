import JSZip from 'jszip';

const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z');

/** Zip the files in sorted name order with a fixed timestamp, so identical data gives identical bytes. */
export async function zipBundle(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const name of Object.keys(files).sort()) {
    zip.file(name, files[name]!, { date: FIXED_DATE, createFolders: false, unixPermissions: 0o644 });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' });
}
