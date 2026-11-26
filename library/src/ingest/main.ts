import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EO_HOSTS, educationScotlandEo } from './eo/adapter.js';
import { Fetcher } from './fetcher.js';
import { formatReport, runIngest } from './run.js';
import { folderStore } from './store.js';
import { TRAILS_HOSTS, trails } from './trails/adapter.js';
import type { Adapter } from './types.js';

const ADAPTERS: Record<string, { adapter: Adapter; hosts: string[] }> = {
  'education-scotland-eo': { adapter: educationScotlandEo, hosts: EO_HOSTS },
  trails: { adapter: trails, hosts: TRAILS_HOSTS },
};

const USAGE = `Usage: pnpm --filter @edw/library ingest <collection> [--force] [--report <file>]
Collections: ${Object.keys(ADAPTERS).join(', ')}`;

async function main(argv: string[]) {
  const reportAt = argv.indexOf('--report');
  const reportFile = reportAt >= 0 ? argv[reportAt + 1] : undefined;
  const id = argv.find((a, i) => !a.startsWith('--') && (reportAt < 0 || i !== reportAt + 1));
  const force = argv.includes('--force');
  const entry = id ? ADAPTERS[id] : undefined;
  if (!entry) {
    console.error(USAGE);
    process.exit(2);
  }

  const root = fileURLToPath(new URL(`../../collections/${id}`, import.meta.url));
  // Downloads are untrusted: they go in a fresh temporary folder, are only ever read, and are
  // deleted at the end.
  const downloads = mkdtempSync(join(tmpdir(), 'edw-library-'));
  let n = 0;
  try {
    const report = await runIngest(entry.adapter, new Fetcher({ allowedHosts: entry.hosts }), folderStore(root), {
      force,
      saveDownload: (_url, body) => writeFileSync(join(downloads, `${String(++n).padStart(3, '0')}.download`), body),
    });
    const text = formatReport(id!, report);
    console.log(text);
    if (reportFile) writeFileSync(reportFile, text);
    if (report.some((r) => r.status === 'failed')) process.exitCode = 1;
  } finally {
    rmSync(downloads, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
