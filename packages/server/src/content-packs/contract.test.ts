/**
 * Cross-system Content Pack (v1) contract tests (T0).
 *
 * Pins the two golden fixture bundles in `fixtures/contracts/` against `expected.json` and
 * proves that exporting a document strips every excluded field (teacher PII, workspace/doc/thread
 * ids, comments, revision history, pending suggestions, deleted blocks, class notes).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractPackBlocks, newUlid, nowIso } from '@edw/shared';
import { buildContentPackFiles, sha256Hex, verifyContentPackFiles } from '@edw/shared/node';
import { saveAsset } from '../assets/store.js';
import { createCommentStore } from '../comments/store.js';
import { findRepoRoot } from '../env.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { packContentZip, unpackContentZip } from './zip.js';

const CONTRACTS_DIR = path.join(findRepoRoot(), 'fixtures', 'contracts');

interface ExpectedFixtures {
  format_version: string;
  fixtures: Record<
    string,
    {
      pack_id: string;
      kind: 'reading' | 'worksheet';
      content_hash: string;
      zip_sha256: string;
      files: { path: string; sha256: string; bytes: number; mime?: string }[];
    }
  >;
}

const PNG_1X1 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

let t: TempDb;

beforeAll(async () => {
  t = await tempDb();
});
afterAll(() => t.cleanup());

describe('Content Pack v1 golden fixtures', () => {
  const expected = JSON.parse(readFileSync(path.join(CONTRACTS_DIR, 'expected.json'), 'utf8')) as ExpectedFixtures;

  for (const [name, meta] of Object.entries(expected.fixtures)) {
    it(`${name} verifies against expected.json`, async () => {
      const zipBytes = new Uint8Array(readFileSync(path.join(CONTRACTS_DIR, name)));
      expect(sha256Hex(zipBytes)).toBe(meta.zip_sha256);

      const unpacked = await unpackContentZip(zipBytes);
      const verified = verifyContentPackFiles(unpacked, meta.content_hash);
      expect(verified.manifest.format_version).toBe('1.0');
      expect(verified.manifest.pack_id).toBe(meta.pack_id);
      expect(verified.manifest.kind).toBe(meta.kind);
      expect(verified.manifest.files).toEqual(meta.files);
    });
  }

  it('reading-with-image includes raster asset and sanitised inline SVG; worksheet-with-prompts includes writing lines and prompts', async () => {
    const reading = verifyContentPackFiles(await unpackContentZip(new Uint8Array(readFileSync(path.join(CONTRACTS_DIR, 'reading-with-image.zip')))));
    expect(reading.assets.get('water_diagram')?.mime).toBe('image/png');
    expect(reading.blocks.some((b) => b.content.includes('<svg'))).toBe(true);
    expect(reading.prompts).toEqual([]);

    const worksheet = verifyContentPackFiles(await unpackContentZip(new Uint8Array(readFileSync(path.join(CONTRACTS_DIR, 'worksheet-with-prompts.zip')))));
    expect(worksheet.blocks.some((b) => b.content === '<line/>')).toBe(true);
    expect(worksheet.prompts).toHaveLength(2);
  });
});

describe('Content Pack v1 privacy and exclusion contract', () => {
  it('strips teacher PII, session/doc/thread ids, comments, revisions, proposals and deleted blocks', async () => {
    const deps = testDeps(t.db);
    const { session, thread, doc } = await newWorkspace(deps, 'Ms Jane Teacher');
    const env = envelopeFor(doc, thread);

    const assetId = 'img_safe_1';
    await saveAsset(t.db, {
      asset_id: assetId,
      session_id: session.session_id,
      mime: 'image/png',
      bytes: PNG_1X1.byteLength,
      filename: 'secret-teacher-filename.png',
      data: PNG_1X1,
      created_at: nowIso(),
    });

    const ins1 = await deps.canvas.structural(
      session.session_id,
      { command: 'insert', doc_id: doc.id, after: 'start', type: 'heading', content: '# Scottish Castles' },
      env,
    );
    const b1 = ins1.changes.blocks[0]!;
    const ins2 = await deps.canvas.structural(
      session.session_id,
      { command: 'insert', doc_id: doc.id, after: b1.id, type: 'image', content: `![Castle](asset:${assetId})` },
      env,
    );
    const b2 = ins2.changes.blocks[0]!;
    // Add a pending model suggestion, a proposed block, and a teacher comment that must all be stripped.
    await deps.canvas.applyTurn(
      session.session_id,
      {
        turn_id: 'turn-secret-999',
        cause_event_id: newUlid(),
        thread_id: thread.id,
        default_doc_id: doc.id,
        operations: [
          { op: 'replace', id: b1.id, content: '# SECRET_PROPOSAL_TEXT' },
          { op: 'insert', after: b2.id, type: 'paragraph', content: 'UNACCEPTED_MODEL_BLOCK' },
        ],
      },
      { envelope: env },
    );
    const comments = createCommentStore(t.db, deps.events);
    await comments.create(session.session_id, { doc_id: doc.id, block_id: b1.id, author: 'teacher', body: 'PRIVATE_TEACHER_COMMENT_jane@school.example', quote: 'Castles' }, env);

    const state = await deps.canvas.loadState(session.session_id);
    const { blocks, assetIds } = extractPackBlocks(state, doc.id);
    expect(assetIds).toEqual([assetId]);

    const built = buildContentPackFiles({
      pack_id: newUlid(),
      kind: 'reading',
      title: 'Scottish Castles',
      created_at: nowIso(),
      blocks,
      assets: [{ asset_id: assetId, mime: 'image/png', bytes: new Uint8Array(PNG_1X1) }],
    });
    const zipBytes = await packContentZip(built.files);
    const unpacked = await unpackContentZip(zipBytes);
    const verified = verifyContentPackFiles(unpacked, built.manifest.content_hash);
    expect(verified.blocks.map((b) => b.content)).toContain('# Scottish Castles');

    const textPayload = [...unpacked.entries()]
      .filter(([p]) => p.endsWith('.json'))
      .map(([, b]) => new TextDecoder().decode(b))
      .join('\n');

    for (const forbidden of [
      session.session_id,
      session.participant_token,
      doc.id,
      thread.id,
      'Ms Jane Teacher',
      'jane@school.example',
      'PRIVATE_TEACHER_COMMENT',
      'SECRET_PROPOSAL_TEXT',
      'UNACCEPTED_MODEL_BLOCK',
      'turn-secret-999',
      'secret-teacher-filename',
    ]) {
      expect(textPayload).not.toContain(forbidden);
    }
  });
});
