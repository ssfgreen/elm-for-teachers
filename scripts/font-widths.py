"""
Writes packages/shared/src/layout/fontWidths.ts: the letter widths of the fonts the app bundles,
so the layout check (packages/shared/src/layout) can measure text the way Word sets it, without
a browser. Run from the repo root after `pnpm install`, with Pillow:

    python3 scripts/font-widths.py

Each font is the free twin the editor uses for a Word font (DOC_FONT_STACKS in
client/src/editor/docStyle.ts). Widths are in thousandths of an em, for the characters in CHARS;
a character the font lacks is written as 0 and measured as the font's average.
"""
import json
import os
from PIL import ImageFont

ROOT = os.path.join('node_modules', '.pnpm')
FONTS = {
    'carlito': '@fontsource+carlito@5.3.0/node_modules/@fontsource/carlito/files/carlito',
    'arimo': '@fontsource+arimo@5.3.0/node_modules/@fontsource/arimo/files/arimo',
    'tinos': '@fontsource+tinos@5.3.0/node_modules/@fontsource/tinos/files/tinos',
    'gelasio': '@fontsource+gelasio@5.3.0/node_modules/@fontsource/gelasio/files/gelasio',
    'caladea': '@fontsource+caladea@5.3.0/node_modules/@fontsource/caladea/files/caladea',
    'comic_neue': '@fontsource+comic-neue@5.3.0/node_modules/@fontsource/comic-neue/files/comic-neue',
    'lexend': '@fontsource+lexend@5.2.5/node_modules/@fontsource/lexend/files/lexend',
    'opendyslexic': '@fontsource+opendyslexic@5.3.0/node_modules/@fontsource/opendyslexic/files/opendyslexic',
}
CHARS = ''.join(chr(c) for c in range(32, 127)) + '‘’“”–—…•£€éèáàíóúçñü×÷°½'
OUT = os.path.join('packages', 'shared', 'src', 'layout', 'fontWidths.ts')


def widths(path):
    f = ImageFont.truetype(path, 1000)
    missing = f.getlength('￿')
    out = []
    for ch in CHARS:
        w = f.getlength(ch)
        out.append(0 if ord(ch) > 126 and w == missing else round(w))
    ascent, descent = f.getmetrics()
    return out, ascent + descent


lines = [
    '/**',
    ' * Letter widths of the bundled fonts, in thousandths of an em, for the characters in CHARS',
    ' * (0: the font lacks it). Written by scripts/font-widths.py: do not edit by hand.',
    ' */',
    f'export const CHARS = {json.dumps(CHARS, ensure_ascii=False)};',
    '',
    '/** Per font: regular and bold widths, and the line height (ascent + descent) in thousandths of an em. */',
    'export const FONT_WIDTHS: Record<string, { regular: number[]; bold: number[]; line: number }> = {',
]
for name, stem in FONTS.items():
    regular, line = widths(os.path.join(ROOT, stem + '-latin-400-normal.woff'))
    bold, _ = widths(os.path.join(ROOT, stem + '-latin-700-normal.woff'))
    lines.append(f'  {name}: {{ line: {line}, regular: {json.dumps(regular)}, bold: {json.dumps(bold)} }},')
lines.append('};')
with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(lines) + '\n')
print('wrote', OUT)
