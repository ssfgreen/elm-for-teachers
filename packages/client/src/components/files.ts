import { ApiError } from '../api/http';
import { ReferenceFileError } from '../import/reference';

/** The badge on a file's tile: its extension in capitals (PDF, DOCX). */
export const fileKind = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toUpperCase() ?? 'FILE';

/** The server's own wording for a refused file (a limit, no text), else a general line. */
export function fileError(err: unknown, name: string): string {
  if (err instanceof ReferenceFileError) return err.message;
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.body) as { error?: unknown };
      if (typeof body.error === 'string' && err.status !== 400) return body.error;
    } catch {
      // Not JSON: the general line.
    }
  }
  return `“${name}” could not be added. Please try again.`;
}

/** 812 KB, 3.4 MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
