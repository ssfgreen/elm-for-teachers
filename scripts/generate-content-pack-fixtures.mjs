#!/usr/bin/env node
/**
 * Generates the two golden Content Pack (v1) fixture bundles in `fixtures/contracts/`:
 *   - reading-with-image.zip      (raster PNG in assets/ + sanitised inline SVG)
 *   - worksheet-with-prompts.zip  (worksheet blocks with <line/> writing lines + prompts.json)
 * and records their pinned hashes in `fixtures/contracts/expected.json`.
 *
 * Run after `pnpm --filter @edw/shared build && pnpm --filter @edw/server build`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContentPackFiles, sha256Hex } from '../packages/shared/dist/node/index.js';
import { packContentZip } from '../packages/server/dist/content-packs/zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'fixtures', 'contracts');
mkdirSync(OUT, { recursive: true });

// Minimal valid 1x1 PNG (67 bytes).
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const reading = buildContentPackFiles({
  pack_id: '01JCPACKG01DEN000000000001',
  kind: 'reading',
  title: 'The Water Cycle',
  subject: 'Sciences',
  stage: 'Second level',
  standard_uris: ['SCN 2-05a'],
  created_at: '2026-11-26T00:00:00.000Z',
  blocks: [
    { id: '01JBLK00000000000000000001', type: 'heading', content: '# The Water Cycle' },
    { id: '01JBLK00000000000000000002', type: 'paragraph', content: 'Water moves continuously between rivers, oceans and clouds through **evaporation**, **condensation** and **precipitation**.' },
    { id: '01JBLK00000000000000000003', type: 'image', content: '![Water cycle diagram](asset:water_diagram)' },
    { id: '01JBLK00000000000000000004', type: 'image', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect x="4" y="4" width="112" height="32" rx="6" fill="none" stroke="currentColor"/></svg>' },
  ],
  assets: [{ asset_id: 'water_diagram', mime: 'image/png', bytes: PNG_1X1 }],
});

const worksheet = buildContentPackFiles({
  pack_id: '01JCPACKG01DEN000000000002',
  kind: 'worksheet',
  title: 'Similes and Metaphors',
  subject: 'Literacy and English',
  stage: 'Second level',
  standard_uris: ['LIT 2-16a', 'ENG 2-19a'],
  created_at: '2026-11-26T00:00:00.000Z',
  blocks: [
    { id: '01JBLK00000000000000000011', type: 'heading', content: '# Similes and Metaphors' },
    { id: '01JBLK00000000000000000012', type: 'paragraph', content: 'A simile compares two things using *like* or *as*. Write one simile for a storm:' },
    { id: '01JBLK00000000000000000013', type: 'paragraph', content: '<line/>' },
    { id: '01JBLK00000000000000000014', type: 'numbered_item', content: '1. Explain how the metaphor "the wind was a roaring lion" makes the reader feel.' },
    { id: '01JBLK00000000000000000015', type: 'paragraph', content: '<line/>' },
  ],
  prompts: [
    {
      label: 'Explain this word',
      instruction: 'Explain the highlighted word in plain language for a P7 pupil, with one everyday example.',
      after_highlight: true,
      follow_up: false,
    },
    {
      label: 'Give me a hint',
      instruction: 'Give a short Socratic hint without writing the answer for the pupil.',
      after_highlight: true,
      follow_up: true,
    },
  ],
});

const readingZip = await packContentZip(reading.files);
const worksheetZip = await packContentZip(worksheet.files);

writeFileSync(path.join(OUT, 'reading-with-image.zip'), readingZip);
writeFileSync(path.join(OUT, 'worksheet-with-prompts.zip'), worksheetZip);

const expected = {
  format_version: '1.0',
  fixtures: {
    'reading-with-image.zip': {
      pack_id: reading.manifest.pack_id,
      kind: reading.manifest.kind,
      content_hash: reading.manifest.content_hash,
      zip_sha256: sha256Hex(readingZip),
      files: reading.manifest.files,
    },
    'worksheet-with-prompts.zip': {
      pack_id: worksheet.manifest.pack_id,
      kind: worksheet.manifest.kind,
      content_hash: worksheet.manifest.content_hash,
      zip_sha256: sha256Hex(worksheetZip),
      files: worksheet.manifest.files,
    },
  },
};
writeFileSync(path.join(OUT, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
console.log('Generated Content Pack v1 golden fixtures in', OUT);
