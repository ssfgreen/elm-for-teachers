import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { covers, publishCheck, renderPassport } from '../passport/index.js';
import { PLUGINS_ROOT, bundledPluginFiles, loadBundledPlugin } from './bundled.js';
import { treeHash } from './hash.js';
import { coveredHash, readPassport } from './passport-files.js';

const pedagogyDir = join(PLUGINS_ROOT, 'pedagogy');
const RERUN = 'run `pnpm --filter @edw/library passport`';

describe("pedagogy's passport", () => {
  const passport = readPassport(pedagogyDir)!;
  const plugin = loadBundledPlugin(pedagogyDir);

  it('passes the schema, for this plugin and version', () => {
    expect(passport.plugin).toEqual({ id: plugin.manifest.id, version: plugin.manifest.version });
  });

  it('has nothing blocking at limited, and names what is still open', () => {
    const { blocking, suggestions } = publishCheck(passport, 'limited');
    expect(blocking).toEqual([]);
    expect(suggestions.map((p) => p.code)).toEqual(['no_authors', 'not_approved', 'not_approved', 'not_approved', 'not_approved']);
  });

  it('is drafted by an assistant, with no author or approval until Sam names them (question 28)', () => {
    expect(passport.authors).toEqual([]);
    for (const s of Object.values(passport.sections)) expect(s).toMatchObject({ written_by: [], approved_by: [], drafted_by_assistant: true });
  });

  it('covers the plugin as it is: a changed plugin needs a new entry in covers', () => {
    const files = bundledPluginFiles(pedagogyDir);
    const rest = new Map([...files].filter(([path]) => path !== 'passport.json' && path !== 'PASSPORT.md'));
    expect(coveredHash(files)).toBe(treeHash(rest));
    expect(passport.covers).toContainEqual({ version: plugin.manifest.version, content_hash: coveredHash(files) });
    expect(covers(passport, plugin.manifest.version, coveredHash(files))).toBe(true);
  });

  it("is not covered by the plugin hash in a runner answer, which includes the passport files", () => {
    expect(covers(passport, plugin.manifest.version, plugin.hash)).toBe(false);
  });

  it(`has PASSPORT.md as render writes it (${RERUN})`, () => {
    expect(readFileSync(join(pedagogyDir, 'PASSPORT.md'), 'utf8')).toBe(renderPassport(passport));
  });
});

describe('coveredHash', () => {
  it('ignores only the passport files', () => {
    const files = new Map([['plugin.json', '{}'], ['README.md', 'x']]);
    const withPassport = new Map(files).set('passport.json', '{}').set('PASSPORT.md', '# P');
    expect(coveredHash(withPassport)).toBe(treeHash(files));
    expect(coveredHash(new Map(files).set('README.md', 'y'))).not.toBe(coveredHash(files));
  });

  it('gives no passport for a plugin without one', () => expect(readPassport(join(PLUGINS_ROOT, 'cfe'))).toBeNull());
});
