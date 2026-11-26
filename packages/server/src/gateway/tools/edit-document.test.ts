import { describe, expect, it } from 'vitest';
import { editDocument } from './edit-document.js';

type Schema = { properties: { operations: { items: { properties: { font: { enum: string[] } } } } } };

describe('edit_document', () => {
  it('offers the model the toolbar fonts, but not OpenDyslexic, which the teacher picks, nor fonts no longer offered', () => {
    const fonts = (editDocument.parameters as unknown as Schema).properties.operations.items.properties.font.enum;
    expect(fonts).toContain('lexend');
    expect(fonts).not.toContain('open_dyslexic');
    expect(fonts).not.toContain('verdana');
    // A past study condition, no longer offered.
    expect(fonts).not.toContain('comic_sans');
  });
});
