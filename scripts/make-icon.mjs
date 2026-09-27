#!/usr/bin/env node
/* Създава desktop/icon.ico от desktop/icon.svg и страничната картинка на
 * инсталатора installer/welcome.bmp от installer/welcome.svg.
 *
 * Изпълнява се рядко — само при промяна на рисунките; готовите файлове са в
 * хранилището. Растеризацията се прави с Chromium чрез Playwright:
 *
 *   npx playwright --version      (трябва да е инсталиран)
 *   node scripts/make-icon.mjs
 *
 * Малките размери се записват като BMP (най-съвместимо), 256×256 — като PNG.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SVG = path.join(ROOT, 'desktop', 'icon.svg');
const ICO = path.join(ROOT, 'desktop', 'icon.ico');
const WELCOME_SVG = path.join(ROOT, 'installer', 'welcome.svg');
const WELCOME_BMP = path.join(ROOT, 'installer', 'welcome.bmp');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '@playwright/test'].filter(Boolean);
  for (const name of candidates) {
    try {
      const mod = await import(name);
      return mod.chromium ? mod : mod.default;
    } catch { /* следващият */ }
  }
  throw new Error('Нужен е Playwright: npm install --no-save playwright (или PLAYWRIGHT_MODULE=път/до/index.js).');
}

async function withPage(fn) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    return await fn(await browser.newPage());
  } finally {
    await browser.close();
  }
}

/** Растеризира SVG в Chromium: { [размер]: { rgba, png } }. */
function rasterise(page, svg, sizes) {
  return page.evaluate(async ({ svg, sizes }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const out = {};
    for (const [w, h] of sizes) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      out[`${w}x${h}`] = { rgba: Array.from(g.getImageData(0, 0, w, h).data), png: c.toDataURL('image/png').split(',')[1] };
    }
    return out;
  }, { svg, sizes });
}

/** 24-битов BMP (за страничната картинка на NSIS). */
function bmp24(w, h, rgba) {
  const row = Math.ceil(w * 3 / 4) * 4;
  const out = Buffer.alloc(54 + row * h);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18);
  out.writeInt32LE(h, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      out[dst + x * 3] = rgba[src + 2];
      out[dst + x * 3 + 1] = rgba[src + 1];
      out[dst + x * 3 + 2] = rgba[src];
    }
  }
  return out;
}

/** 32-битов BMP за иконка: пикселите отдолу нагоре (BGRA) + 1-битова маска. */
function bmpEntry(size, rgba) {
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  const mask = Buffer.alloc(maskRow * size);
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = (row * size + x) * 4;
      pixels[dst] = rgba[src + 2];
      pixels[dst + 1] = rgba[src + 1];
      pixels[dst + 2] = rgba[src];
      pixels[dst + 3] = rgba[src + 3];
      if (rgba[src + 3] === 0) mask[row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, pixels, mask]);
}

function buildIco(rendered) {
  const images = SIZES.map(size => {
    const r = rendered[`${size}x${size}`];
    return size >= 256 ? Buffer.from(r.png, 'base64') : bmpEntry(size, r.rgba);
  });
  const dir = Buffer.alloc(6 + 16 * SIZES.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(SIZES.length, 4);
  let offset = dir.length;
  SIZES.forEach((size, i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2);
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(images[i].length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([dir, ...images]);
}

await withPage(async (page) => {
  const icon = await rasterise(page, fs.readFileSync(SVG, 'utf8'), SIZES.map(s => [s, s]));
  fs.writeFileSync(ICO, buildIco(icon));
  console.log(`${path.relative(ROOT, ICO)}: ${SIZES.join(', ')} px`);

  const welcome = await rasterise(page, fs.readFileSync(WELCOME_SVG, 'utf8'), [[164, 314]]);
  fs.writeFileSync(WELCOME_BMP, bmp24(164, 314, welcome['164x314'].rgba));
  console.log(`${path.relative(ROOT, WELCOME_BMP)}: 164×314 px`);
});
