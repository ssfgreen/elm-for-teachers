import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from this module to the directory containing pnpm-workspace.yaml. */
export function findRepoRoot(from: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not find pnpm-workspace.yaml above ${from}`);
    dir = parent;
  }
}
