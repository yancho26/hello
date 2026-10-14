/* Подготвя шрифтовете за PDF отчетите: от пълния Noto Sans (SIL OFL 1.1) остават
 * латиница, кирилица, пунктуация и знаците, които програмата използва; от DejaVu Sans
 * (лиценз Bitstream Vera / DejaVu) — само символите, които Noto Sans няма (≈, ≤, стрелки, отметки).
 * Пуска се ръчно при смяна на шрифта:
 *   node scripts/subset-fonts.mjs <папка с NotoSans-Regular.ttf, -SemiBold.ttf, -Bold.ttf> [DejaVuSans.ttf]
 * Резултатът е в public/fonts/. */

import fs from 'node:fs';
import path from 'node:path';
import { parseTTF, subsetTTF } from '../public/js/shared/pdf/ttf.js';

const RANGES = [
  [0x20, 0x7e], [0xa0, 0x17f], [0x400, 0x45f], [0x490, 0x491],
  [0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2116, 0x2116], [0x2122, 0x2122],
  [0x2150, 0x215e], [0x2190, 0x2195], [0x2212, 0x2212], [0x2248, 0x2248], [0x2260, 0x2265],
];

const src = process.argv[2];
if (!src) {
  console.error('Употреба: node scripts/subset-fonts.mjs <папка с шрифтовете>');
  process.exit(1);
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'fonts');
fs.mkdirSync(out, { recursive: true });
for (const weight of ['Regular', 'SemiBold', 'Bold']) {
  const file = `NotoSans-${weight}.ttf`;
  const font = parseTTF(fs.readFileSync(path.join(src, file)));
  const chars = new Set();
  for (const [a, z] of RANGES) for (let cp = a; cp <= z; cp++) if (font.cmap.has(cp)) chars.add(cp);
  const glyphs = new Set([...chars].map(cp => font.cmap.get(cp)));
  const bytes = subsetTTF(font, glyphs, chars);
  fs.writeFileSync(path.join(out, file), bytes);
  console.log(`${file}: ${chars.size} знака, ${(bytes.length / 1024).toFixed(0)} KB`);
}

// Символите от DejaVu Sans.
const SYMBOLS = '≈≠≤≥±×÷→←↑↓↗↘⇒✓✔✗☐☑■□▪▫●○◎◆◇▲▼►★☆☁☀♥⚖⚠';
const dejavu = process.argv[3] || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
if (fs.existsSync(dejavu)) {
  const font = parseTTF(fs.readFileSync(dejavu));
  const chars = new Set([...SYMBOLS].map(c => c.codePointAt(0)).filter(cp => font.cmap.has(cp)));
  const bytes = subsetTTF(font, new Set([...chars].map(cp => font.cmap.get(cp))), chars);
  fs.writeFileSync(path.join(out, 'DejaVuSans-Symbols.ttf'), bytes);
  console.log(`DejaVuSans-Symbols.ttf: ${chars.size} знака, ${(bytes.length / 1024).toFixed(0)} KB`);
}
