/**
 * The Word preview names only the Word font. Every font a doc can be set in, the ones no longer
 * offered too (older docs keep them), needs a face the app defines, or a machine without the
 * font draws the browser's serif.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DocFont } from '@edw/shared';
import { DOC_FONT_STACKS, WORD_FONTS } from '../editor/docStyle';

const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const families = new Set([...css('./wordPreviewFonts.css').matchAll(/font-family:\s*'?([^';]+)'?;/g)].map((m) => m[1]));
/** Bundled under their own names (styles/index.css), so they need no stand-in. */
const OWN = [...css('../styles/index.css').matchAll(/@fontsource\/([a-z-]+)\//g)].map((m) => m[1]);

describe('the Word preview fonts', () => {
  it.each(DocFont.options)('has a face for a doc set in %s', (font) => {
    const name = WORD_FONTS[font];
    expect(families.has(name) || OWN.includes(name.toLowerCase())).toBe(true);
  });

  // The faces load with the whole app, so the editor draws these two in Arimo as well.
  it("names Arimo in the editor's stacks for Century Gothic and Verdana, which stand in it", () => {
    expect(DOC_FONT_STACKS.century_gothic).toBe("'Century Gothic', Arimo, sans-serif");
    expect(DOC_FONT_STACKS.verdana).toBe('Verdana, Arimo, sans-serif');
  });
});
