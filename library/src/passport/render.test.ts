import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePassport, renderPassport, type Passport } from './index.js';

const cases = JSON.parse(readFileSync(new URL('./passport.cases.json', import.meta.url), 'utf8')) as { base: Record<string, unknown> };
/** A fresh copy of the base passport, to change in a test. */
const base = (): Passport => parsePassport(structuredClone(cases.base));
/** The base's section, which is answered. */
const answered = (p: Passport, name: 'contents') => p.sections[name] as NonNullable<Passport['sections']['contents']>;

describe('renderPassport', () => {
  it('writes the base passport', () => {
    expect(renderPassport(parsePassport(cases.base))).toBe(
      [
        '# Passport for elm/pedagogy 1.0.0',
        '',
        'This file is written from `passport.json`: change that, not this.',
        '',
        'A self-report by its authors. No organisation has checked it.',
        '',
        '## Authors',
        '',
        '- Ada Teacher (`author_a`)',
        '- Ben Teacher (`author_b`)',
        '',
        '## Versions it covers',
        '',
        '- 1.0.0, content hash `sha256:1111111111111111111111111111111111111111111111111111111111111111`',
        '',
        '## Contents',
        '',
        'Strategies for reading.',
        '',
        '_Written by Ada Teacher. Approved by Ben Teacher._',
        '',
        '## Expected use',
        '',
        'Planning P7 literacy.',
        '',
        '_Drafted with an assistant by Ada Teacher. Approved by Ada Teacher._',
        '',
        '## Tested use',
        '',
        'Tried in two classes.',
        '',
        '_Written by Ben Teacher. Approved by Ada Teacher, Ben Teacher._',
        '',
        '## Risks',
        '',
        'Not for assessment.',
        '',
        '_Written by Ada Teacher, Ben Teacher. Approved by Ben Teacher._',
        '',
      ].join('\n'),
    );
  });

  it('shows what is not answered, never hides it', () => {
    const p = base();
    p.authors = [];
    p.covers = [];
    p.sections.contents = null;
    p.sections.risks = { text: 'Drafts only.', written_by: [], approved_by: [], drafted_by_assistant: true };
    p.sections.tested_use = { text: 'None yet.', written_by: [], approved_by: [], drafted_by_assistant: false };
    const md = renderPassport(parsePassport(p));
    expect(md).toContain('## Authors\n\nNot answered.\n');
    expect(md).toContain('## Versions it covers\n\nNone. A version the passport does not cover is treated as Ask first.\n');
    expect(md).toContain('## Contents\n\nNot answered.\n');
    expect(md).toContain('## Risks\n\nDrafts only.\n\n_Drafted by an assistant. Not yet approved by an author._\n');
    expect(md).toContain('## Tested use\n\nNone yet.\n\n_No writer named. Not yet approved by an author._\n');
  });

  it('names someone who is not an author by their id', () => {
    const p = base();
    answered(p, 'contents').approved_by = ['author_z'];
    expect(renderPassport(parsePassport(p))).toContain('_Written by Ada Teacher. Approved by author_z._');
  });

  it('keeps paragraphs in a section and trims its ends', () => {
    const p = base();
    answered(p, 'contents').text = '  First.\n\nSecond.  ';
    expect(renderPassport(parsePassport(p))).toContain('## Contents\n\nFirst.\n\nSecond.\n\n_Written');
  });
});
