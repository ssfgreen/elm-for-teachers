import { describe, expect, it } from 'vitest';
import { groupLines, type PdfItem } from './lines.js';

const item = (x: number, y: number, w: number, str: string, h = 10): PdfItem => ({ x, y, w, h, str, font: 'f1' });

describe('groupLines', () => {
  it('joins items on one baseline and keeps columns apart', () => {
    const lines = groupLines([item(100, 500, 40, 'L IT'), item(140, 500, 2, ' '), item(143, 500, 40, '0-11a /'), item(300, 500, 50, 'Other column')]);
    expect(lines.map((l) => l.text)).toEqual(['L IT 0-11a /', 'Other column']);
  });

  it('drops footnote marks in text and marks the line a footnote starts', () => {
    const lines = groupLines([
      item(100, 500, 80, 'the world around me'),
      item(180, 505, 3, '1', 6),
      item(43, 54, 3, '1', 6),
      item(48, 49, 300, 'The numeracy experiences and outcomes are shown in italics.'),
    ]);
    expect(lines.map((l) => [l.text, l.note])).toEqual([
      ['the world around me', undefined],
      ['The numeracy experiences and outcomes are shown in italics.', '1'],
    ]);
  });

  it('puts back a full stop and a split word that pdf.js placed out of order', () => {
    const lines = groupLines([
      item(100, 500, 80, 'the world around me'),
      item(300, 500, 60, 'next column'),
      item(300, 488, 60, 'next column'),
      item(181, 500, 2, '.'),
      item(100, 400, 80, 'selected resources'),
      item(190, 400, 10, 'as'),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['the world around me.', 'next column', 'next column', 'selected resources as']);
  });

  it('turns private-use bullet glyphs into bullets and joins them to their text', () => {
    const lines = groupLines([item(79, 300, 4, ''), item(97, 300, 100, 'curiosity and exploration')]);
    expect(lines.map((l) => l.text)).toEqual(['• curiosity and exploration']);
  });
});
